
import "https://deno.land/x/xhr@0.4.0/mod.ts";
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { createHmac } from "https://deno.land/std@0.224.0/crypto/mod.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-evolution-signature, x-signature",
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

async function validateEvolutionSignature(req: Request, payload: any, instanceName: string, service: any): Promise<boolean> {
  const signature = req.headers.get("x-evolution-signature") || req.headers.get("x-signature");
  if (!signature) return true; // No signature provided

  try {
    // Get instance secret from wa_sessions table
    const { data: session } = await service
      .from("wa_sessions")
      .select("webhook_secret")
      .eq("evo_instance_id", instanceName)
      .limit(1)
      .maybeSingle();

    const secret = session?.webhook_secret || Deno.env.get("EVOLUTION_WEBHOOK_SECRET");
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

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  if (req.method === "GET") {
    return new Response(
      JSON.stringify({ ok: true, message: "evolution-webhook-v2 alive" }),
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

    // Validate HMAC signature
    const isValidSignature = await validateEvolutionSignature(req, payload, instanceName, service);

    await logStructured(service, {
      category: "SECURITY",
      instanceId: instanceName,
      provider: "evolution",
      valid_signature: isValidSignature,
      data: { event: payload.event, signature_valid: isValidSignature }
    });

    if (!isValidSignature) {
      return new Response(
        JSON.stringify({ ok: false, error: "Invalid signature" }),
        { status: 403, headers: corsHeaders }
      );
    }

    console.log("[evolution-webhook-v2] Incoming:", payload);

    const eventType = payload?.event || payload?.type || "unknown";
    const state = payload?.state || payload?.status;

    // Find session by evo_instance_id to get user_id and optional Bitrix line
    const { data: session } = await service
      .from("wa_sessions")
      .select("*")
      .eq("evo_instance_id", instanceName)
      .limit(1)
      .maybeSingle();

    const userId = session?.user_id || null;
    const bitrixLineId = session?.bitrix_line_id || null;

    // Update wa_sessions heartbeat and optional status
    if (session?.id) {
      const patch: any = { last_sync_at: new Date().toISOString() };
      if (state) patch.status = String(state).toUpperCase();
      await service.from("wa_sessions").update(patch).eq("id", session.id);
    }

    // Only proceed with message flow if we can identify owner
    if (!userId) {
      console.warn("[evolution-webhook-v2] No session/user found for instance:", instanceName);
      return new Response(
        JSON.stringify({ ok: true, info: "No owner session found" }),
        { headers: corsHeaders }
      );
    }

    // Handle message events (inbound)
    if (eventType.toLowerCase().includes("message") || payload?.message) {
      const msg = payload?.message || payload;
      const direction = "in";
      const evolutionMessageId = String(msg?.id || msg?.messageId || msg?.message_id || "");

      const text = msg?.text || msg?.body || msg?.content;
      const mediaUrl = msg?.mediaUrl || msg?.fileUrl || msg?.file_url || undefined;
      const fromNumber = msg?.from || msg?.sender?.phone || msg?.sender?.id || "";
      const contactPhone = String(fromNumber || "").replace(/[^\d+]/g, "");

      // Idempotency: skip if already stored
      if (evolutionMessageId) {
        const { data: dup } = await service
          .from("messages")
          .select("id")
          .eq("evolution_message_id", evolutionMessageId)
          .limit(1)
          .maybeSingle();
        if (dup?.id) {
          return new Response(
            JSON.stringify({ ok: true, info: "Duplicate ignored" }),
            { headers: corsHeaders }
          );
        }
      }

      // Resolve or create conversation by (user_id + contact_phone + evolution_instance)
      const { data: existingConv } = await service
        .from("conversations")
        .select("*")
        .eq("user_id", userId)
        .eq("contact_phone", contactPhone)
        .eq("evolution_instance", instanceName)
        .limit(1)
        .maybeSingle();

      let conversationId = existingConv?.id;
      if (!conversationId) {
        const ins = await service
          .from("conversations")
          .insert({
            user_id: userId,
            contact_phone: contactPhone || "unknown",
            contact_name: msg?.sender?.name || null,
            evolution_instance: instanceName,
            openlines_chat_id: null,
            last_message_at: new Date().toISOString(),
            status: "open"
          })
          .select("id")
          .maybeSingle();
        if (ins.error) throw ins.error;
        conversationId = ins.data?.id;
      } else {
        await service
          .from("conversations")
          .update({ last_message_at: new Date().toISOString() })
          .eq("id", conversationId);
      }

      // Ensure Bitrix chat via bitrix-openlines wrapper
      let chatId = existingConv?.openlines_chat_id || null;
      if (!chatId) {
        const ensureRes = await fetch(
          `https://${new URL(SUPABASE_URL).host.replace(".supabase.co", "")}.functions.supabase.co/bitrix-openlines`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              action: "openlines.ensureSession",
              payload: { 
                tenantId: userId, 
                lineId: bitrixLineId || undefined,
                instanceId: null,
                contact: { phone: contactPhone } 
              },
            }),
          },
        ).then((r) => r.json()).catch((e) => ({ success: false, error: String(e) }));

        if (ensureRes?.success && ensureRes?.data?.chatId) {
          chatId = String(ensureRes.data.chatId);
          await service.from("conversations").update({ openlines_chat_id: chatId }).eq("id", conversationId);
        }
      }

      // Persist inbound message
      await service.from("messages").insert({
        conversation_id: conversationId,
        direction,
        message_type: mediaUrl ? "media" : "text",
        content: text || (mediaUrl ? "[media]" : ""),
        media_url: mediaUrl || null,
        evolution_message_id: evolutionMessageId || null,
        sender_name: msg?.sender?.name || null,
        status: "received",
        delivery_status: "received"
      });

      await logStructured(service, {
        category: "INBOUND",
        tenantId: userId,
        instanceId: instanceName,
        conversationId,
        chatId,
        direction: "in",
        provider: "evolution",
        msgKey: evolutionMessageId,
        data: { text, mediaUrl, contactPhone }
      });

      // Deliver to Open Lines
      await fetch(
        `https://${new URL(SUPABASE_URL).host.replace(".supabase.co", "")}.functions.supabase.co/bitrix-openlines`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "openlines.sendMessage",
            payload: {
              tenantId: userId,
              bitrixChatId: chatId || null,
              text: text || (mediaUrl ? mediaUrl : undefined),
              fileUrl: mediaUrl || undefined,
              ensure: chatId
                ? undefined
                : {
                    tenantId: userId,
                    lineId: bitrixLineId || undefined,
                    instanceId: null,
                    contact: { phone: contactPhone, name: msg?.sender?.name || null },
                  },
            },
          }),
        },
      )
        .then((r) => r.json())
        .then(async (sendRes) => {
          const returnedChatId = sendRes?.data?.chatId;
          if (!chatId && returnedChatId && conversationId) {
            await service.from("conversations").update({ openlines_chat_id: returnedChatId }).eq("id", conversationId);
          }
        })
        .catch((e) => console.error("[evolution-webhook-v2] OL send error:", e));
    }

    return new Response(
      JSON.stringify({ ok: true }),
      { headers: corsHeaders }
    );

  } catch (error: any) {
    console.error("[evolution-webhook-v2] Error:", error);
    await logStructured(service, {
      category: "SECURITY",
      provider: "evolution",
      valid_signature: false,
      data: { error: error.message }
    });

    return new Response(
      JSON.stringify({ ok: false, error: error.message }),
      { status: 500, headers: corsHeaders }
    );
  }
});
