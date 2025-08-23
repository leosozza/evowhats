
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-webhook-token",
  "Access-Control-Allow-Methods": "POST,OPTIONS",
} as const;

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function optionsResponse() {
  return new Response(null, {
    status: 204,
    headers: corsHeaders,
  });
}

function parseFormEncoded(params: URLSearchParams) {
  const result: Record<string, any> = {};

  const parseKey = (key: string) =>
    key
      .split("[")
      .map((k) => k.replace(/\]?$/, ""))
      .filter((k) => k.length > 0);

  const setNested = (obj: Record<string, any>, keys: string[], value: any) => {
    let current = obj;
    keys.forEach((k, idx) => {
      const isLast = idx === keys.length - 1;
      if (isLast) {
        current[k] = value;
      } else {
        if (typeof current[k] !== "object" || current[k] === null) {
          current[k] = {};
        }
        current = current[k];
      }
    });
  };

  for (const [key, value] of params.entries()) {
    const keys = parseKey(key);
    if (keys.length === 0) continue;
    setNested(result, keys, value);
  }

  return result;
}

async function parseIncomingBody(req: Request) {
  const contentType = req.headers.get("content-type")?.toLowerCase() || "";
  console.log("[evolution-webhook] Content-Type:", contentType);

  if (contentType.includes("application/json")) {
    try {
      const json = await req.json();
      return { payload: json, contentType };
    } catch (e) {
      console.error("[evolution-webhook] Failed to parse JSON body:", e);
      return { payload: null, contentType, error: "Invalid JSON" };
    }
  }

  if (contentType.includes("application/x-www-form-urlencoded")) {
    try {
      const text = await req.text();
      const params = new URLSearchParams(text);
      const formObject = parseFormEncoded(params);
      return { payload: formObject, contentType };
    } catch (e) {
      console.error("[evolution-webhook] Failed to parse form body:", e);
      return { payload: null, contentType, error: "Invalid form payload" };
    }
  }

  try {
    const json = await req.json();
    return { payload: json, contentType };
  } catch {
    try {
      const text = await req.text();
      const params = new URLSearchParams(text);
      if ([...params.keys()].length > 0) {
        const formObject = parseFormEncoded(params);
        return { payload: formObject, contentType };
      }
      return { payload: { raw: text }, contentType };
    } catch (e) {
      console.error("[evolution-webhook] Failed to parse unknown body:", e);
      return { payload: null, contentType, error: "Unsupported body" };
    }
  }
}

function normalizePhone(input?: string | null): string | null {
  if (!input) return null;
  const digits = input.replace(/\D/g, "");
  if (!digits) return null;
  if (!digits.startsWith("0")) return `+${digits}`;
  return `+${digits.replace(/^0+/, "")}`;
}

function extractTextFromMessage(msg: any): string | null {
  const t1 = msg?.message?.conversation;
  const t2 = msg?.body;
  const t3 = msg?.text;
  const t4 = msg?.message?.extendedTextMessage?.text;
  return t1 || t2 || t3 || t4 || null;
}

function isFromMe(msg: any): boolean {
  if (typeof msg?.key?.fromMe === "boolean") return msg.key.fromMe;
  if (typeof msg?.fromMe === "boolean") return msg.fromMe;
  return false;
}

function extractRemoteJid(msg: any): string | null {
  return msg?.key?.remoteJid || msg?.remoteJid || msg?.chatId || null;
}

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

async function getOrOpenConversation(supabase: any, tenantId: string, instanceId: string, contactId: string) {
  const { data: existing } = await supabase
    .from("conversations")
    .select("id, status, openlines_chat_id")
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
    .select("id, status, openlines_chat_id")
    .maybeSingle();

  if (error) {
    console.error("[evolution-webhook] getOrOpenConversation insert error:", error);
  }
  return data || existing;
}

async function addInboundMessage(supabase: any, tenantId: string, conversationId: string, waMessageId: string | null, text: string | null, file?: { url?: string | null; mime?: string | null }) {
  // Check for duplicate message
  if (waMessageId) {
    const { data: existing } = await supabase
      .from("messages")
      .select("id")
      .eq("wa_message_id", waMessageId)
      .maybeSingle();
    
    if (existing) {
      console.log("[evolution-webhook] Duplicate message ignored:", waMessageId);
      return existing;
    }
  }

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

  const { data, error } = await supabase.from("messages").insert(payload).select("id").maybeSingle();
  if (error) console.error("[evolution-webhook] addInboundMessage error:", error);

  await supabase
    .from("conversations")
    .update({ last_message_at: new Date().toISOString() })
    .eq("id", conversationId);

  return data;
}

async function sendToBitrixOpenLines(supabase: any, tenantId: string, conversationId: string, text: string, fileUrl?: string) {
  try {
    const { data, error } = await supabase.functions.invoke("bitrix-openlines", {
      body: {
        action: "openlines.sendMessage",
        payload: {
          tenantId,
          text,
          fileUrl,
          ensure: {
            tenantId,
            contact: { phone: "unknown" } // This should be improved with actual contact data
          }
        }
      }
    });

    if (error) {
      console.error("[evolution-webhook] Error calling bitrix-openlines:", error);
      return null;
    }

    if (data?.success && data?.data?.chatId) {
      // Update conversation with chatId
      await supabase
        .from("conversations")
        .update({ openlines_chat_id: data.data.chatId })
        .eq("id", conversationId);
      
      console.log("[evolution-webhook] Message sent to Bitrix OpenLines, chatId:", data.data.chatId);
      return data.data;
    }

    return null;
  } catch (e) {
    console.error("[evolution-webhook] Exception calling bitrix-openlines:", e);
    return null;
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") return optionsResponse();
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);

  const { payload, error: parseError } = await parseIncomingBody(req);
  if (!payload) {
    return jsonResponse({ error: parseError || "Invalid request body" }, 400);
  }

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

  // Validate webhook token
  const providedToken = req.headers.get("x-webhook-token") || new URL(req.url).searchParams.get("token") || "";
  const expectedToken = Deno.env.get("WEBHOOK_TOKEN_EVO") || "";
  const validSignature = !!expectedToken ? providedToken === expectedToken : true; // allow if no token set

  // Log webhook
  await supabase.from("webhook_logs").insert({
    provider: "evo",
    payload_json: payload,
    received_at: new Date().toISOString(),
    valid_signature: validSignature,
  });

  const event = payload?.event;
  const instance = payload?.instance || payload?.instanceName || payload?.session || null;
  const data = payload?.data;

  const tenantId = await resolveTenantId(supabase, req);

  async function reflectInstanceStatus(tenantId: string | null, instLabel: string, state: "qr_required" | "active" | "inactive" | "connecting" | "error") {
    if (!tenantId) return;
    const ex = await getOrCreateInstance(supabase, tenantId, instLabel);
    if (!ex?.id) return;
    await supabase
      .from("wa_instances")
      .update({ status: state, updated_at: new Date().toISOString() })
      .eq("id", ex.id);
  }

  // Handle existing events (QR, CONNECTION)
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

    await reflectInstanceStatus(tenantId, instance, status === "CONNECTED" ? "active" : "inactive");
    console.log(`[evolution-webhook] Updated connection status for instance: ${instance} -> ${status}`);
  }

  // Handle incoming messages
  if (event === "MESSAGES_UPSERT" && instance && data?.messages && Array.isArray(data.messages)) {
    if (!tenantId) {
      console.warn("[evolution-webhook] MESSAGES_UPSERT: no tenant resolved");
      return jsonResponse({ received: true, warning: "no_tenant" });
    }

    const instRow = await getOrCreateInstance(supabase, tenantId, String(instance));
    if (!instRow?.id) {
      console.warn("[evolution-webhook] Could not resolve instance");
      return jsonResponse({ received: true, warning: "no_instance" });
    }

    for (const msg of data.messages) {
      try {
        if (isFromMe(msg)) continue; // Skip messages from agent/bot

        const remoteJid = extractRemoteJid(msg);
        const phone = normalizePhone(remoteJid) || normalizePhone(msg?.from) || null;
        const waMessageId = msg?.key?.id || msg?.id || null;
        const text = extractTextFromMessage(msg);
        const pushName = msg?.pushName || msg?.senderName || null;

        if (!phone) {
          console.warn("[evolution-webhook] Skipping message - no phone number");
          continue;
        }

        const contact = await getOrCreateContact(supabase, tenantId, phone, remoteJid, pushName);
        if (!contact?.id) continue;

        const conv = await getOrOpenConversation(supabase, tenantId, instRow.id, contact.id);
        if (!conv?.id) continue;

        // Media support
        const fileUrl = msg?.fileUrl || msg?.mediaUrl || null;
        const mime = msg?.mimeType || null;

        const messageData = await addInboundMessage(
          supabase, 
          tenantId, 
          conv.id, 
          waMessageId, 
          text, 
          fileUrl ? { url: fileUrl, mime } : undefined
        );

        if (messageData) {
          // Send to Bitrix Open Lines
          await sendToBitrixOpenLines(supabase, tenantId, conv.id, text || "Arquivo recebido", fileUrl);
          console.log(`[evolution-webhook] Processed message: tenant=${tenantId}, instance=${instance}, phone=${phone}`);
        }

      } catch (e) {
        console.error("[evolution-webhook] Error processing message:", e);
      }
    }
  }

  return jsonResponse({ received: true });
});
