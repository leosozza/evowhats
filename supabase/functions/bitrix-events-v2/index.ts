
import "https://deno.land/x/xhr@0.4.0/mod.ts";
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { createHmac } from "https://deno.land/std@0.224.0/crypto/mod.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-signature",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
};

async function logStructured(service: any, log: any) {
  try {
    await service.from("webhook_logs").insert({
      provider: log.provider || "bitrix",
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
    console.error("[bitrix-events-v2] Log error:", e);
  }
}

async function validateSignature(req: Request, payload: any): Promise<boolean> {
  const signature = req.headers.get("x-signature");
  if (!signature) return true; // No signature required

  // Get app secret from environment or database
  const appSecret = Deno.env.get("BITRIX_APP_SECRET");
  if (!appSecret) return true; // No secret configured

  try {
    const expectedSig = await createHmac("sha256", new TextEncoder().encode(appSecret))
      .update(new TextEncoder().encode(JSON.stringify(payload)))
      .digest("hex");
    
    return signature === `sha256=${expectedSig}`;
  } catch (e) {
    console.error("[bitrix-events-v2] Signature validation error:", e);
    return false;
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  if (req.method === "GET") {
    return new Response(
      JSON.stringify({ ok: true, message: "bitrix-events-v2 alive" }),
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
    const isValidSignature = await validateSignature(req, payload);

    await logStructured(service, {
      category: "SECURITY",
      provider: "bitrix",
      valid_signature: isValidSignature,
      data: { event: payload.event, signature_valid: isValidSignature }
    });

    if (!isValidSignature) {
      return new Response(
        JSON.stringify({ ok: false, error: "Invalid signature" }),
        { status: 403, headers: corsHeaders }
      );
    }

    console.log("[bitrix-events-v2] Incoming event:", payload);

    const eventType = payload?.event || payload?.EVENT || "";
    const chatId = payload?.data?.CHAT?.ID || payload?.data?.chatId;
    const messageId = String(payload?.data?.MESSAGE?.ID || payload?.data?.messageId || "");

    if (!chatId) {
      return new Response(
        JSON.stringify({ ok: false, error: "Missing chat ID" }),
        { status: 400, headers: corsHeaders }
      );
    }

    // Find conversation by openlines_chat_id
    const { data: conversation } = await service
      .from("conversations")
      .select("*")
      .eq("openlines_chat_id", chatId)
      .limit(1)
      .maybeSingle();

    if (!conversation) {
      console.warn("[bitrix-events-v2] No conversation found for chat:", chatId);
      return new Response(
        JSON.stringify({ ok: true, info: "No conversation found" }),
        { headers: corsHeaders }
      );
    }

    const tenantId = conversation.user_id;

    await logStructured(service, {
      category: "OL",
      tenantId,
      conversationId: conversation.id,
      chatId,
      provider: "bitrix",
      msgKey: messageId,
      data: { event: eventType, payload }
    });

    // Handle session closure events
    if (eventType.toLowerCase().includes("close") || eventType.toLowerCase().includes("finish")) {
      await service
        .from("conversations")
        .update({ 
          status: "closed",
          updated_at: new Date().toISOString()
        })
        .eq("id", conversation.id);

      await logStructured(service, {
        category: "OL",
        tenantId,
        conversationId: conversation.id,
        chatId,
        provider: "bitrix",
        data: { action: "session_closed" }
      });
    }

    // Handle transfer events
    if (eventType.toLowerCase().includes("transfer") || eventType.toLowerCase().includes("assign")) {
      const assignedUserId = payload?.data?.USER?.ID || payload?.data?.assignedUserId;
      
      if (assignedUserId) {
        await service
          .from("conversations")
          .update({ 
            assigned_user_id: String(assignedUserId),
            updated_at: new Date().toISOString()
          })
          .eq("id", conversation.id);

        await logStructured(service, {
          category: "OL",
          tenantId,
          conversationId: conversation.id,
          chatId,
          provider: "bitrix",
          data: { action: "session_transferred", assignedUserId }
        });
      }
    }

    // Handle message events (existing logic)
    if (eventType.toLowerCase().includes("message")) {
      const message = payload?.data?.MESSAGE || payload?.data?.message;
      const messageText = message?.MESSAGE || message?.text || "";
      const authorId = String(message?.AUTHOR_ID || message?.authorId || "");

      // Skip if from bot/system or already processed
      if (authorId === "0" || !messageText.trim()) {
        return new Response(
          JSON.stringify({ ok: true, info: "System message ignored" }),
          { headers: corsHeaders }
        );
      }

      // Idempotency check
      if (messageId) {
        const { data: existing } = await service
          .from("messages")
          .select("id")
          .eq("bitrix_message_id", messageId)
          .limit(1)
          .maybeSingle();

        if (existing) {
          return new Response(
            JSON.stringify({ ok: true, info: "Message already processed" }),
            { headers: corsHeaders }
          );
        }
      }

      // Create outbound message record
      await service.from("messages").insert({
        conversation_id: conversation.id,
        direction: "out",
        message_type: "text",
        content: messageText,
        bitrix_message_id: messageId || null,
        sender_name: `User ${authorId}`,
        status: "sent",
        delivery_status: "sent"
      });

      await logStructured(service, {
        category: "OUTBOUND",
        tenantId,
        conversationId: conversation.id,
        chatId,
        direction: "out",
        provider: "bitrix",
        msgKey: messageId,
        data: { messageText, authorId }
      });
    }

    return new Response(
      JSON.stringify({ ok: true }),
      { headers: corsHeaders }
    );

  } catch (error: any) {
    console.error("[bitrix-events-v2] Error:", error);
    await logStructured(service, {
      category: "SECURITY",
      provider: "bitrix",
      valid_signature: false,
      data: { error: error.message }
    });

    return new Response(
      JSON.stringify({ ok: false, error: error.message }),
      { status: 500, headers: corsHeaders }
    );
  }
});
