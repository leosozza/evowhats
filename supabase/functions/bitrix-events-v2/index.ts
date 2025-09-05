
import "https://deno.land/x/xhr@0.4.0/mod.ts";
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { createHmac } from "https://deno.land/std@0.224.0/crypto/mod.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-signature, x-corr-id",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
};

import { callBitrixAPI, setCorrelationId } from "../_shared/bitrix/callBitrixAPI.ts";

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
  const corrId = req.headers.get("x-corr-id") || crypto.randomUUID();
  setCorrelationId(corrId);
  
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
      data: { event: payload.event, signature_valid: isValidSignature, corrId }
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

    // Handle message events (existing and new outbound logic)
    if (eventType.toLowerCase().includes("message")) {
    if (eventType.toLowerCase().includes("message")) {
      const message = payload?.data?.MESSAGE || payload?.data?.message;
      const messageText = message?.MESSAGE || message?.text || "";
      const authorId = String(message?.AUTHOR_ID || message?.authorId || "");
      const messageFiles = message?.FILES || message?.files || [];

      // Determine direction: if authorId is "0" or system, it's likely inbound processing
      // If authorId > 0, it's an outbound message from an agent
      const isOutbound = authorId !== "0" && authorId && eventType.toLowerCase().includes("send");

      if (isOutbound) {
        // OUTBOUND: Agent sent message in Open Lines, deliver to WhatsApp via Evolution
        await handleOutboundMessage(service, conversation, messageText, messageFiles, messageId, chatId, tenantId);
      } else {
        // INBOUND: Existing logic for processing inbound messages
        await handleInboundMessage(service, conversation, messageText, messageId, authorId, chatId, tenantId);
      }
    }

    return new Response(
      JSON.stringify({ ok: true, corrId }),
      { headers: corsHeaders }
    );

  } catch (error: any) {
    console.error("[bitrix-events-v2] Error:", error);
    await logStructured(service, {
      category: "SECURITY",
      provider: "bitrix",
      valid_signature: false,
      data: { error: error.message, corrId }
    });

    return new Response(
      JSON.stringify({ ok: false, error: error.message, corrId }),
      { status: 500, headers: corsHeaders }
    );
  }
});

// Helper functions for message handling
async function handleInboundMessage(service: any, conversation: any, messageText: string, messageId: string, authorId: string, chatId: string, tenantId: string) {
  // Skip if from bot/system or already processed
  if (authorId === "0" || !messageText.trim()) {
    return;
  }

  // Idempotency check
  if (messageId) {
    const { data: existing } = await service
      .from("messages")
      .select("id")
      .eq("bitrix_message_id", messageId)
      .limit(1)
      .maybeSingle();

    if (existing?.id) return;
  }

  // Create inbound message record
  await service.from("messages").insert({
    conversation_id: conversation.id,
    direction: "in",
    message_type: "text",
    content: messageText,
    bitrix_message_id: messageId || null,
    sender_name: `User ${authorId}`,
    status: "received",
    delivery_status: "received"
  });

  await logStructured(service, {
    category: "INBOUND",
    tenantId,
    conversationId: conversation.id,
    chatId,
    direction: "in",
    provider: "bitrix",
    msgKey: messageId,
    data: { messageText, authorId }
  });
}

async function handleOutboundMessage(service: any, conversation: any, messageText: string, messageFiles: any[], messageId: string, chatId: string, tenantId: string) {
  if (!messageText.trim() && (!messageFiles || messageFiles.length === 0)) {
    return; // No content to send
  }

  // Idempotency check
  if (messageId) {
    const { data: existing } = await service
      .from("messages")
      .select("id")
      .eq("bitrix_message_id", messageId)
      .limit(1)
      .maybeSingle();

    if (existing?.id) return;
  }

  // Find Evolution instance for this conversation
  const { data: instance } = await service
    .from("wa_instances")
    .select("label, tenant_id")
    .eq("id", conversation.instance_id)
    .limit(1)
    .maybeSingle();

  if (!instance) {
    console.error(`[bitrix-events-v2] No wa_instance found for conversation ${conversation.id}`);
    return;
  }

  // Get contact phone
  const { data: contact } = await service
    .from("contacts")
    .select("phone_e164")
    .eq("id", conversation.contact_id)
    .limit(1)
    .maybeSingle();

  if (!contact?.phone_e164) {
    console.error(`[bitrix-events-v2] No contact phone found for conversation ${conversation.id}`);
    return;
  }

  try {
    // Send via Evolution API
    const evolutionPayload = {
      action: "send_message",
      instanceName: instance.label,
      to: contact.phone_e164,
      message: {
        text: messageText
      }
    };

    // Try media files if present
    if (messageFiles && messageFiles.length > 0) {
      const firstFile = messageFiles[0];
      if (firstFile?.URL || firstFile?.url) {
        evolutionPayload.message = {
          mediaUrl: firstFile.URL || firstFile.url,
          caption: messageText || undefined
        };
      }
    }

    const evolutionResult = await fetch(
      `https://${new URL(Deno.env.get("SUPABASE_URL")!).host.replace(".supabase.co", "")}.functions.supabase.co/evolution-connector-v2`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(evolutionPayload)
      }
    );

    const evolutionResponse = await evolutionResult.json();
    const deliveryStatus = evolutionResult.ok && evolutionResponse?.ok ? "sent" : "failed";

    // Create outbound message record
    await service.from("messages").insert({
      conversation_id: conversation.id,
      direction: "out",
      message_type: messageFiles?.length > 0 ? "media" : "text",
      content: messageText || "[media]",
      media_url: messageFiles?.[0]?.URL || messageFiles?.[0]?.url || null,
      bitrix_message_id: messageId || null,
      sender_name: "Agent",
      status: "sent",
      delivery_status: deliveryStatus
    });

    await logStructured(service, {
      category: "OUTBOUND",
      tenantId,
      conversationId: conversation.id,
      chatId,
      direction: "out",
      provider: "evolution",
      msgKey: messageId,
      data: { 
        messageText, 
        deliveryStatus, 
        evolutionResult: evolutionResult.ok,
        instanceLabel: instance.label,
        contactPhone: contact.phone_e164
      }
    });

    console.log(`[bitrix-events-v2] Outbound message sent via Evolution: ${deliveryStatus}`);
  } catch (e) {
    console.error(`[bitrix-events-v2] Failed to send outbound message:`, e);
    
    // Still record the message with failed status
    await service.from("messages").insert({
      conversation_id: conversation.id,
      direction: "out",
      message_type: "text",
      content: messageText,
      bitrix_message_id: messageId || null,
      sender_name: "Agent",
      status: "failed",
      delivery_status: "failed"
    });
  }
}
