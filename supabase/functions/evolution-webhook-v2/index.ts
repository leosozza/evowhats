import "https://deno.land/x/xhr@0.4.0/mod.ts";
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { createHmac } from "https://deno.land/std@0.224.0/crypto/mod.ts";
import { callBitrixAPI, setCorrelationId } from "../_shared/bitrix/callBitrixAPI.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-evolution-signature, x-signature, x-corr-id",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
};

async function logStructured(service: any, log: any) {
  try {
    await service.from("webhook_logs").insert({
      provider: log.provider || "evolution",
      payload_json: {
        category: log.category,
        tenantId: log.tenantId,
        instanceId: log.instanceId,
        conversationId: log.conversationId,
        chatId: log.chatId,
        direction: log.direction,
        provider: log.provider,
        msgKey: log.msgKey,
        data: log.data || {}
      },
      valid_signature: log.valid_signature ?? true,
      received_at: new Date().toISOString()
    });
  } catch (e) {
    console.error("[evolution-webhook-v2] Log error:", e);
  }
}

async function validateEvolutionSignature(req: Request, payload: any, instanceId: string, service: any): Promise<boolean> {
  const signature = req.headers.get("x-evolution-signature") || req.headers.get("x-signature");
  if (!signature) return true; // No signature provided

  try {
    // Get instance secret from wa_instances table via uuid
    const { data: instance } = await service
      .from("wa_instances")
      .select("webhook_secret, secret")
      .eq("id", instanceId)
      .limit(1)
      .maybeSingle();

    const secret = instance?.webhook_secret || instance?.secret || Deno.env.get("EVOLUTION_WEBHOOK_SECRET");
    if (!secret) return true; // No secret configured

    const expectedSig = await createHmac("sha256", new TextEncoder().encode(secret))
      .update(new TextEncoder().encode(JSON.stringify(payload)))
      .digest("hex");
    
    return signature === `sha256=${expectedSig}` || signature === expectedSig;
  } catch (e) {
    console.error("[evolution-webhook-v2] Signature validation error:", e);
    return false;
  }
}

async function upsertContact(service: any, tenantId: string, phone: string, name?: string) {
  const phoneE164 = phone.startsWith('+') ? phone : `+${phone.replace(/\D/g, '')}`;
  
  const { data: existing } = await service
    .from("contacts")
    .select("id")
    .eq("tenant_id", tenantId)
    .eq("phone_e164", phoneE164)
    .limit(1)
    .maybeSingle();

  if (existing?.id) return existing.id;

  const { data: created, error } = await service
    .from("contacts")
    .insert({
      tenant_id: tenantId,
      phone_e164: phoneE164,
      display_name: name || phoneE164,
      created_at: new Date().toISOString()
    })
    .select("id")
    .maybeSingle();

  if (error) throw error;
  return created?.id;
}

async function findLineIdByInstance(service: any, tenantId: string, waInstanceId: string): Promise<string | null> {
  const { data } = await service
    .from("open_channel_bindings")
    .select("line_id")
    .eq("tenant_id", tenantId)
    .eq("wa_instance_id", waInstanceId)
    .limit(1)
    .maybeSingle();
  
  return data?.line_id || null;
}

async function sendToBitrixWithRetry(tenantId: string, method: string, params: any, retries = 3): Promise<any> {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      return await callBitrixAPI(tenantId, method, params);
    } catch (e) {
      console.error(`[evolution-webhook-v2] Bitrix send attempt ${attempt}/${retries}:`, e);
      if (attempt === retries) throw e;
      
      // Exponential backoff: 1s, 3s, 7s
      const delay = Math.pow(2, attempt) * 500 + Math.random() * 500;
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
}

serve(async (req) => {
  const corrId = req.headers.get("x-corr-id") || crypto.randomUUID();
  setCorrelationId(corrId);

  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  if (req.method === "GET") {
    return new Response(
      JSON.stringify({ ok: true, message: "evolution-webhook-v2 alive", corrId }),
      { headers: corsHeaders }
    );
  }

  if (req.method !== "POST") {
    return new Response(
      JSON.stringify({ ok: false, error: "Method not allowed" }),
      { status: 405, headers: corsHeaders }
    );
  }

  const service = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

  try {
    const payload = await req.json().catch(() => ({}));
    const instanceName = payload?.instanceName || payload?.instance || payload?.instance_id || payload?.instance_name;
    
    if (!instanceName) {
      return new Response(
        JSON.stringify({ ok: false, error: "Missing instanceName" }),
        { status: 400, headers: corsHeaders }
      );
    }

    console.log(`[evolution-webhook-v2] Processing ${corrId}:`, { instanceName, event: payload?.event });

    // Find wa_instance by name/label to get tenant and UUID
    const { data: instance } = await service
      .from("wa_instances")
      .select("id, tenant_id, webhook_secret, secret")
      .eq("label", instanceName)
      .limit(1)
      .maybeSingle();

    if (!instance) {
      console.warn(`[evolution-webhook-v2] No wa_instance found for:`, instanceName);
      return new Response(
        JSON.stringify({ ok: true, info: "Instance not found" }),
        { headers: corsHeaders }
      );
    }

    const tenantId = instance.tenant_id;
    const waInstanceId = instance.id;

    // Validate HMAC signature by instance
    const isValidSignature = await validateEvolutionSignature(req, payload, waInstanceId, service);

    await logStructured(service, {
      category: "SECURITY",
      tenantId,
      instanceId: instanceName,
      provider: "evolution",
      valid_signature: isValidSignature,
      data: { event: payload.event, signature_valid: isValidSignature, corrId }
    });

    if (!isValidSignature) {
      return new Response(
        JSON.stringify({ ok: false, error: "Invalid signature" }),
        { status: 403, headers: corsHeaders }
      );
    }

    const eventType = payload?.event || payload?.type || "unknown";
    const state = payload?.state || payload?.status;

    // Update wa_sessions heartbeat if exists
    const { data: session } = await service
      .from("wa_sessions")
      .select("id")
      .eq("instance_id", waInstanceId)
      .limit(1)
      .maybeSingle();

    if (session?.id) {
      const patch: any = { last_sync_at: new Date().toISOString() };
      if (state) patch.status = String(state).toUpperCase();
      await service.from("wa_sessions").update(patch).eq("id", session.id);
    }

    // Handle message events (inbound)
    if (eventType.toLowerCase().includes("message") || payload?.message) {
      const msg = payload?.message || payload;
      const evolutionMessageId = String(msg?.id || msg?.messageId || msg?.message_id || "");

      // Idempotency: skip if already processed
      if (evolutionMessageId) {
        const { data: existing } = await service
          .from("messages")
          .select("id")
          .eq("evolution_message_id", evolutionMessageId)
          .limit(1)
          .maybeSingle();
        
        if (existing?.id) {
          console.log(`[evolution-webhook-v2] Duplicate message ignored: ${evolutionMessageId}`);
          return new Response(
            JSON.stringify({ ok: true, info: "Duplicate ignored" }),
            { headers: corsHeaders }
          );
        }
      }

      const text = msg?.text || msg?.body || msg?.content || "";
      const mediaUrl = msg?.mediaUrl || msg?.fileUrl || msg?.file_url || null;
      const fromNumber = msg?.from || msg?.sender?.phone || msg?.sender?.id || "";
      const contactPhone = String(fromNumber || "").replace(/[^\d+]/g, "");
      const contactName = msg?.sender?.name || msg?.pushname || null;

      if (!contactPhone) {
        console.warn(`[evolution-webhook-v2] No contact phone found in message`);
        return new Response(
          JSON.stringify({ ok: true, info: "No contact phone" }),
          { headers: corsHeaders }
        );
      }

      // Upsert contact by phone_e164
      const contactId = await upsertContact(service, tenantId, contactPhone, contactName);

      // Resolve or create conversation
      const { data: existingConv } = await service
        .from("conversations")
        .select("*")
        .eq("tenant_id", tenantId)
        .eq("instance_id", waInstanceId)
        .eq("contact_id", contactId)
        .limit(1)
        .maybeSingle();

      let conversationId = existingConv?.id;
      let openlinesChatId = existingConv?.openlines_chat_id;

      if (!conversationId) {
        const { data: newConv, error } = await service
          .from("conversations")
          .insert({
            tenant_id: tenantId,
            instance_id: waInstanceId,
            contact_id: contactId,
            status: "open",
            last_message_at: new Date().toISOString()
          })
          .select("id")
          .maybeSingle();
        
        if (error) throw error;
        conversationId = newConv?.id;
      } else {
        await service
          .from("conversations")
          .update({ last_message_at: new Date().toISOString() })
          .eq("id", conversationId);
      }

      // Find line_id via open_channel_bindings
      const lineId = await findLineIdByInstance(service, tenantId, waInstanceId);

      // Persist inbound message
      await service.from("messages").insert({
        conversation_id: conversationId,
        direction: "in",
        message_type: mediaUrl ? "media" : "text",
        content: text || (mediaUrl ? "[media]" : ""),
        media_url: mediaUrl,
        evolution_message_id: evolutionMessageId || null,
        sender_name: contactName,
        status: "received",
        delivery_status: "received"
      });

      await logStructured(service, {
        category: "INBOUND",
        tenantId,
        instanceId: instanceName,
        conversationId,
        chatId: openlinesChatId,
        direction: "in",
        provider: "evolution",
        msgKey: evolutionMessageId,
        data: { text, mediaUrl, contactPhone, contactName, lineId, corrId }
      });

      // Send to Bitrix Open Lines via imconnector.send.messages
      if (lineId) {
        try {
          const messageData = {
            CONNECTOR: "evolution_whatsapp",
            LINE: lineId,
            MESSAGES: [{
              USER: {
                ID: contactPhone,
                NAME: contactName || contactPhone
              },
              MESSAGE: {
                TEXT: text || "",
                FILE_URL: mediaUrl || undefined
              }
            }]
          };

          const bitrixResult = await sendToBitrixWithRetry(tenantId, "imconnector.send.messages", messageData);
          
          // Update conversation with Bitrix chat ID if returned
          const returnedChatId = bitrixResult?.result?.chat_id || bitrixResult?.chat_id;
          if (returnedChatId && !openlinesChatId) {
            await service
              .from("conversations")
              .update({ openlines_chat_id: String(returnedChatId) })
              .eq("id", conversationId);
          }

          console.log(`[evolution-webhook-v2] Message sent to Bitrix line ${lineId}`);
        } catch (e) {
          console.error(`[evolution-webhook-v2] Failed to send to Bitrix:`, e);
          await logStructured(service, {
            category: "OUTBOUND",
            tenantId,
            instanceId: instanceName,
            conversationId,
            direction: "out",
            provider: "bitrix",
            data: { error: String(e), lineId, corrId }
          });
        }
      } else {
        console.warn(`[evolution-webhook-v2] No lineId found for instance ${waInstanceId}`);
      }
    }

    return new Response(
      JSON.stringify({ ok: true, corrId }),
      { headers: corsHeaders }
    );

  } catch (error: any) {
    console.error("[evolution-webhook-v2] Error:", error);
    await logStructured(service, {
      category: "SECURITY",
      provider: "evolution",
      valid_signature: false,
      data: { error: error.message, corrId }
    });

    return new Response(
      JSON.stringify({ ok: false, error: error.message, corrId }),
      { status: 500, headers: corsHeaders }
    );
  }
});