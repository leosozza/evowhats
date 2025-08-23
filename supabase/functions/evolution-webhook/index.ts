
/*
  Supabase Edge Function: evolution-webhook
  - Public endpoint (verify_jwt = false in config.toml)
  - Receives events from Evolution API (messages/status)
  - Updates wa_sessions status/heartbeat and persists inbound messages
  - Ensures Bitrix Open Lines chat and forwards messages via bitrix-openlines
  Response: { success: boolean }
*/

import "https://deno.land/x/xhr@0.4.0/mod.ts";
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
  "Content-Type": "application/json",
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: corsHeaders });
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders });
  if (req.method === "GET") return jsonResponse({ ok: true, message: "evolution-webhook alive" });
  if (req.method !== "POST") return jsonResponse({ ok: false, error: "Method not allowed" }, 405);

  const service = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

  try {
    const payload = await req.json().catch(() => ({}));
    console.log("[evolution-webhook] incoming:", payload);

    const instanceName: string | undefined =
      payload?.instanceName || payload?.instance || payload?.instance_id || payload?.instance_name;
    const eventType: string = payload?.event || payload?.type || "unknown";
    const state = payload?.state || payload?.status;

    if (!instanceName) {
      return jsonResponse({ ok: false, error: "Missing instanceName" }, 400);
    }

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
      console.warn("[evolution-webhook] No session/user found for instance:", instanceName);
      return jsonResponse({ ok: true, info: "No owner session found" });
    }

    // Handle message events (inbound)
    if (eventType.toLowerCase().includes("message") || payload?.message) {
      const msg = payload?.message || payload;
      const direction = "in";
      const evolutionMessageId = String(msg?.id || msg?.messageId || msg?.message_id || "");

      const text: string | undefined = msg?.text || msg?.body || msg?.content;
      const mediaUrl: string | undefined = msg?.mediaUrl || msg?.fileUrl || msg?.file_url || undefined;
      const fromNumber: string | undefined = msg?.from || msg?.sender?.phone || msg?.sender?.id || "";
      const contactPhone = String(fromNumber || "").replace(/[^\d+]/g, "");

      // Idempotency: skip if already stored
      if (evolutionMessageId) {
        const { data: dup } = await service
          .from("messages")
          .select("id")
          .eq("user_id", userId)
          .eq("evolution_message_id", evolutionMessageId)
          .limit(1)
          .maybeSingle();
        if (dup?.id) {
          return jsonResponse({ ok: true, info: "Duplicate ignored" });
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
            bitrix_chat_id: null,
            last_message_at: new Date().toISOString(),
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

      // Ensure Bitrix chat via bitrix-openlines wrapper (uses tenantId=userId)
      let chatId = existingConv?.bitrix_chat_id || null;
      if (!chatId) {
        const ensureRes = await fetch(
          `https://${new URL(SUPABASE_URL).host.replace(".supabase.co", "")}.functions.supabase.co/bitrix-openlines`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              action: "openlines.ensureSession",
              payload: { tenantId: userId, lineId: bitrixLineId || undefined, contact: { phone: contactPhone } },
            }),
          },
        ).then((r) => r.json()).catch((e) => ({ success: false, error: String(e) }));

        if (ensureRes?.success && ensureRes?.data?.chatId) {
          chatId = String(ensureRes.data.chatId);
          await service.from("conversations").update({ bitrix_chat_id: chatId }).eq("id", conversationId);
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
      });

      // Deliver to Open Lines (fallback to ensure if chatId missing)
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
                    contact: { phone: contactPhone, name: msg?.sender?.name || null },
                  },
            },
          }),
        },
      ).catch((e) => console.error("[evolution-webhook] OL send error:", e));
    }

    return jsonResponse({ ok: true });
  } catch (e: any) {
    console.error("[evolution-webhook] error:", e?.message || e);
    return jsonResponse({ ok: false, error: e?.message || "Internal error" }, 500);
  }
});
