
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// CORS
const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-webhook-token",
  "Access-Control-Allow-Methods": "POST,OPTIONS",
};

function ok(data: any) {
  return new Response(JSON.stringify({ ok: true, data }), { status: 200, headers: { ...cors, "Content-Type": "application/json" } });
}
function ko(msg: string) {
  return new Response(JSON.stringify({ ok: false, error: msg }), { status: 200, headers: { ...cors, "Content-Type": "application/json" } });
}

// Helpers: Supabase service client (para acessar DB com privilégios de servidor)
function getServiceClient() {
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !supabaseServiceKey) return null;
  return createClient(supabaseUrl, supabaseServiceKey);
}

// Normalização simples de telefone/JID em algo próximo a E.164
function normalizePhone(input?: string | null): string | null {
  if (!input) return null;
  // remove tudo que não é dígito
  const digits = input.replace(/\D/g, "");
  if (!digits) return null;
  // se já começa com país (ex.: 55...), prefixar com +
  if (!digits.startsWith("0")) return `+${digits}`;
  // remover 0 inicial
  return `+${digits.replace(/^0+/, "")}`;
}

// Extrair texto de mensagens Evolution (formatos podem variar entre versões)
function extractTextFromMessage(msg: any): string | null {
  // tente campos comuns
  const t1 = msg?.message?.conversation;         // padrão WA proto
  const t2 = msg?.body;                           // alguns webhooks usam body
  const t3 = msg?.text;                           // fallback
  const t4 = msg?.message?.extendedTextMessage?.text;
  return t1 || t2 || t3 || t4 || null;
}

// Descobrir se mensagem é do agente (fromMe) ou do cliente
function isFromMe(msg: any): boolean {
  if (typeof msg?.key?.fromMe === "boolean") return msg.key.fromMe;
  if (typeof msg?.fromMe === "boolean") return msg.fromMe;
  return false;
}

// Tenta extrair um remote JID / telefone do payload
function extractRemoteJid(msg: any): string | null {
  return msg?.key?.remoteJid || msg?.remoteJid || msg?.chatId || null;
}

// Resolve tenant: se houver 1 único tenant, usa ele; senão, tente por portal_url no header "x-tenant-portal" (opcional)
async function resolveTenantId(supabase: any, req: Request): Promise<string | null> {
  const portal = req.headers.get("x-tenant-portal");
  if (portal) {
    const { data, error } = await supabase
      .from("tenants")
      .select("id")
      .eq("portal_url", portal)
      .maybeSingle();
    if (!error && data?.id) return data.id;
  }
  const { data: list } = await supabase.from("tenants").select("id").limit(2);
  if (Array.isArray(list) && list.length === 1) return list[0].id;
  return null;
}

// Upsert de wa_instances por (tenant, label)
async function getOrCreateInstance(supabase: any, tenantId: string, label: string) {
  const { data: existing } = await supabase
    .from("wa_instances")
    .select("id, status")
    .eq("tenant_id", tenantId)
    .eq("label", label)
    .maybeSingle();
  if (existing?.id) return existing;

  const { data, error } = await supabase
    .from("wa_instances")
    .insert({
      tenant_id: tenantId,
      provider: "evo",
      label,
      status: "connecting",
      config_json: {},
    })
    .select("id, status")
    .maybeSingle();

  if (error) {
    console.error("[evolution-webhook] getOrCreateInstance insert error:", error);
  }
  return data || existing;
}

// Upsert de contact por (tenant, phone_e164)
async function getOrCreateContact(supabase: any, tenantId: string, phone: string, waJid?: string | null, name?: string | null) {
  const { data: existing } = await supabase
    .from("contacts")
    .select("id")
    .eq("tenant_id", tenantId)
    .eq("phone_e164", phone)
    .maybeSingle();
  if (existing?.id) return existing;

  const { data, error } = await supabase
    .from("contacts")
    .insert({
      tenant_id: tenantId,
      phone_e164: phone,
      wa_jid: waJid || null,
      name: name || null,
    })
    .select("id")
    .maybeSingle();

  if (error) {
    console.error("[evolution-webhook] getOrCreateContact insert error:", error);
  }
  return data || existing;
}

// Pega conversa aberta para (tenant, instance, contact) ou cria uma nova
async function getOrOpenConversation(supabase: any, tenantId: string, instanceId: string, contactId: string) {
  const { data: existing } = await supabase
    .from("conversations")
    .select("id, status")
    .eq("tenant_id", tenantId)
    .eq("instance_id", instanceId)
    .eq("contact_id", contactId)
    .eq("status", "open")
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (existing?.id) return existing;

  const { data, error } = await supabase
    .from("conversations")
    .insert({
      tenant_id: tenantId,
      instance_id: instanceId,
      contact_id: contactId,
      status: "open",
      last_message_at: new Date().toISOString(),
    })
    .select("id, status")
    .maybeSingle();

  if (error) {
    console.error("[evolution-webhook] getOrOpenConversation insert error:", error);
  }
  return data || existing;
}

// Insere mensagem e atualiza last_message_at da conversa
async function addInboundMessage(supabase: any, tenantId: string, conversationId: string, waMessageId: string | null, text: string | null, file?: { url?: string | null; mime?: string | null }) {
  const payload: any = {
    tenant_id: tenantId,
    conversation_id: conversationId,
    direction: "in",
    type: file?.url ? "file" : "text",
    text: text,
    file_url: file?.url || null,
    mime_type: file?.mime || null,
    wa_message_id: waMessageId || null,
    created_at: new Date().toISOString(),
  };

  const { error } = await supabase.from("messages").insert(payload);
  if (error) console.error("[evolution-webhook] addInboundMessage error:", error);

  await supabase
    .from("conversations")
    .update({ last_message_at: new Date().toISOString() })
    .eq("id", conversationId);
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  if (req.method !== "POST") return ko("method_not_allowed");

  const supabase = getServiceClient();
  if (!supabase) return ko("server_misconfigured");

  try {
    const payload = await req.json().catch(() => ({}));
    const event = payload?.event;
    const instance = payload?.instance || payload?.instanceName || payload?.session || null;
    const data = payload?.data;

    // Validação simples por token (opcional)
    const providedToken = req.headers.get("x-webhook-token") || new URL(req.url).searchParams.get("token") || "";
    const expectedToken = Deno.env.get("WEBHOOK_TOKEN_EVO") || "";
    const validSignature = !!expectedToken ? providedToken === expectedToken : false;

    // Log persistente do webhook
    await supabase.from("webhook_logs").insert({
      provider: "evo",
      payload_json: payload,
      received_at: new Date().toISOString(),
      valid_signature: validSignature,
    });

    // Opcional: refletir QR / estado também em wa_instances
    async function reflectInstanceStatus(tenantId: string | null, instLabel: string, state: "qr_required" | "active" | "inactive" | "connecting" | "error") {
      if (!tenantId) return;
      const ex = await getOrCreateInstance(supabase, tenantId, instLabel);
      if (!ex?.id) return;
      await supabase
        .from("wa_instances")
        .update({ status: state, updated_at: new Date().toISOString() })
        .eq("id", ex.id);
    }

    // Se disponível, resolva tenant agora (usado pelos handlers abaixo)
    const tenantId = await resolveTenantId(supabase, req);

    // Handlers existentes: atualizam wa_sessions (mantidos)
    if (event === "QRCODE_UPDATED" && instance && data?.qr) {
      await supabase
        .from("wa_sessions")
        .update({
          qr_code: data.qr,
          status: "PENDING_QR",
          last_sync_at: new Date().toISOString(),
        })
        .eq("evo_instance_id", instance)
        .catch(() => {});

      await reflectInstanceStatus(tenantId, instance, "qr_required");
      console.log(`[evolution-webhook] Updated QR for instance: ${instance}`);
    }

    if (event === "CONNECTION_UPDATE" && instance) {
      const status = data?.state === "open" ? "CONNECTED" : "DISCONNECTED";
      await supabase
        .from("wa_sessions")
        .update({
          status,
          qr_code: status === "CONNECTED" ? null : undefined,
          connected_at: status === "CONNECTED" ? new Date().toISOString() : undefined,
          last_sync_at: new Date().toISOString(),
        })
        .eq("evo_instance_id", instance)
        .catch(() => {});

      // Também reflete em wa_instances
      await reflectInstanceStatus(tenantId, instance, status === "CONNECTED" ? "active" : "inactive");
      console.log(`[evolution-webhook] Updated connection status for instance: ${instance} -> ${status}`);
    }

    // Persistência de mensagens recebidas
    if (event === "MESSAGES_UPSERT" && instance && data?.messages && Array.isArray(data.messages)) {
      if (!tenantId) {
        console.warn("[evolution-webhook] MESSAGES_UPSERT: sem tenant resolvido; inclua header x-tenant-portal ou mantenha single-tenant.");
      }

      // Garante que a instância exista (por label = instance enviados pelo provedor)
      const instRow = tenantId ? await getOrCreateInstance(supabase, tenantId, String(instance)) : null;

      for (const msg of data.messages) {
        try {
          // Ignore mensagens do próprio atendente/instância
          if (isFromMe(msg)) continue;

          const remoteJid = extractRemoteJid(msg);
          const phone = normalizePhone(remoteJid) || normalizePhone(msg?.from) || null;
          const waMessageId = msg?.key?.id || msg?.id || null;
          const text = extractTextFromMessage(msg);
          const pushName = msg?.pushName || msg?.senderName || null;

          if (!tenantId || !instRow?.id || !phone) {
            console.warn("[evolution-webhook] Skipping message - missing key data:", { tenantId: !!tenantId, instId: !!instRow?.id, phone: !!phone });
            continue;
          }

          const contact = await getOrCreateContact(supabase, tenantId, phone, remoteJid, pushName);
          if (!contact?.id) continue;

          const conv = await getOrOpenConversation(supabase, tenantId, instRow.id, contact.id);
          if (!conv?.id) continue;

          // Suporte rudimentar a mídia (se o payload trouxer url/mime em algum campo conhecido)
          const fileUrl = msg?.fileUrl || msg?.mediaUrl || null;
          const mime = msg?.mimeType || null;

          await addInboundMessage(supabase, tenantId, conv.id, waMessageId, text, fileUrl ? { url: fileUrl, mime } : undefined);

          console.log(`[evolution-webhook] Stored inbound message for tenant=${tenantId}, instance=${instance}, phone=${phone}`);
        } catch (e) {
          console.error("[evolution-webhook] Error persisting message:", e);
        }
      }
    }

    return ok({ received: true });
  } catch (e: any) {
    console.error("[evolution-webhook] Error:", e);
    return ko(e?.message || "internal_error");
  }
});
