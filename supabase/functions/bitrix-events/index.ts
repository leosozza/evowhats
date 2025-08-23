
/* Supabase Edge Function: bitrix-events
   - Public POST endpoint to receive Bitrix event webhooks
   - Handles agent messages from Open Lines
   - Sends replies back to WhatsApp via Evolution API
*/
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
} as const;

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: corsHeaders,
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
  console.log("[bitrix-events] Content-Type:", contentType);

  if (contentType.includes("application/json")) {
    try {
      const json = await req.json();
      return { payload: json, contentType };
    } catch (e) {
      console.error("[bitrix-events] Failed to parse JSON body:", e);
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
      console.error("[bitrix-events] Failed to parse form body:", e);
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
      console.error("[bitrix-events] Failed to parse unknown body:", e);
      return { payload: null, contentType, error: "Unsupported body" };
    }
  }
}

async function findConversationByChatId(supabase: any, chatId: string) {
  const { data, error } = await supabase
    .from("conversations")
    .select(`
      id, tenant_id, instance_id, contact_id,
      contacts!inner(phone_e164, wa_jid),
      wa_instances!inner(label, config_json)
    `)
    .eq("openlines_chat_id", chatId)
    .eq("status", "open")
    .maybeSingle();

  if (error) {
    console.error("[bitrix-events] Error finding conversation:", error);
    return null;
  }

  return data;
}

async function addOutboundMessage(supabase: any, tenantId: string, conversationId: string, text: string, bitrixMessageId?: string) {
  // Check for duplicate
  if (bitrixMessageId) {
    const { data: existing } = await supabase
      .from("messages")
      .select("id")
      .eq("bitrix_message_id", bitrixMessageId)
      .maybeSingle();
    
    if (existing) {
      console.log("[bitrix-events] Duplicate Bitrix message ignored:", bitrixMessageId);
      return existing;
    }
  }

  const { data, error } = await supabase.from("messages").insert({
    tenant_id: tenantId,
    conversation_id: conversationId,
    direction: "out",
    type: "text",
    text,
    bitrix_message_id: bitrixMessageId,
    created_at: new Date().toISOString(),
  }).select("id").maybeSingle();

  if (error) {
    console.error("[bitrix-events] Error adding outbound message:", error);
    return null;
  }

  // Update conversation timestamp
  await supabase
    .from("conversations")
    .update({ last_message_at: new Date().toISOString() })
    .eq("id", conversationId);

  return data;
}

async function sendToEvolution(supabase: any, instanceLabel: string, phone: string, text: string, config: any) {
  try {
    const { data, error } = await supabase.functions.invoke("evolution-connector", {
      body: {
        action: "send_message",
        instance: instanceLabel,
        number: phone,
        text,
        config
      }
    });

    if (error) {
      console.error("[bitrix-events] Error calling evolution-connector:", error);
      return { success: false, error: error.message };
    }

    return data || { success: true };
  } catch (e) {
    console.error("[bitrix-events] Exception calling evolution-connector:", e);
    return { success: false, error: String(e) };
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

  // Extract domain/portal from payload
  const domain =
    payload?.auth?.domain ||
    payload?.auth?.server_domain ||
    payload?.domain ||
    payload?.["auth"]?.["server_domain"] ||
    payload?.["auth[domain]"] ||
    payload?.["auth[server_domain]"] ||
    "";

  const portalUrl = domain ? `https://${domain}` : null;
  console.log("[bitrix-events] Extracted portalUrl:", portalUrl ?? "(none)");

  // Find tenant by portal URL
  let tenantId: string | null = null;
  if (portalUrl) {
    const { data: tenant, error: tenantErr } = await supabase
      .from("tenants")
      .select("id")
      .eq("portal_url", portalUrl)
      .limit(1)
      .maybeSingle();

    if (tenantErr) {
      console.error("[bitrix-events] tenant query error:", tenantErr);
    }
    if (tenant) tenantId = tenant.id;
  }

  const eventType =
    payload?.event ||
    payload?.type ||
    payload?.["event"] ||
    "unknown_event";

  // Log the event
  await supabase
    .from("bitrix_event_logs")
    .insert({
      user_id: tenantId ?? crypto.randomUUID(),
      event_type: eventType,
      event_data: payload,
      status: "pending",
    });

  console.log(`[bitrix-events] Event: ${eventType}, Tenant: ${tenantId || 'unknown'}`);

  // Handle message events from Open Lines
  if ((eventType === "OnImMessageAdd" || eventType === "OnImOpenLinesMessageAdd") && tenantId) {
    try {
      const messageData = payload?.data?.[0] || payload?.data || {};
      const chatId = messageData?.CHAT_ID || messageData?.chat_id;
      const messageText = messageData?.MESSAGE || messageData?.message || "";
      const messageId = messageData?.ID || messageData?.id;
      const fromUserId = messageData?.FROM_USER_ID || messageData?.from_user_id;

      console.log("[bitrix-events] Processing message:", { chatId, messageText, messageId, fromUserId });

      if (!chatId || !messageText || !messageId) {
        console.warn("[bitrix-events] Missing required message data");
        return jsonResponse({ ok: true, warning: "incomplete_data" });
      }

      // Find the conversation by chat ID
      const conversation = await findConversationByChatId(supabase, String(chatId));
      if (!conversation) {
        console.warn("[bitrix-events] Conversation not found for chatId:", chatId);
        return jsonResponse({ ok: true, warning: "conversation_not_found" });
      }

      console.log("[bitrix-events] Found conversation:", conversation.id);

      // Add message to our database
      const msgRecord = await addOutboundMessage(
        supabase,
        conversation.tenant_id,
        conversation.id,
        messageText,
        String(messageId)
      );

      if (!msgRecord) {
        console.warn("[bitrix-events] Failed to save message or duplicate");
        return jsonResponse({ ok: true, warning: "message_not_saved" });
      }

      // Send to Evolution API
      const phone = conversation.contacts.phone_e164;
      const instanceLabel = conversation.wa_instances.label;
      const instanceConfig = conversation.wa_instances.config_json || {};

      const evolutionResult = await sendToEvolution(
        supabase,
        instanceLabel,
        phone,
        messageText,
        instanceConfig
      );

      if (!evolutionResult.success) {
        console.error("[bitrix-events] Failed to send to Evolution:", evolutionResult.error);
        // Update message status if needed
        await supabase
          .from("messages")
          .update({ status: "failed" })
          .eq("id", msgRecord.id);

        return jsonResponse({ ok: true, warning: "evolution_send_failed", error: evolutionResult.error });
      }

      console.log("[bitrix-events] Message sent successfully to WhatsApp");
      return jsonResponse({ ok: true, sent: true });

    } catch (e) {
      console.error("[bitrix-events] Error processing message event:", e);
      return jsonResponse({ ok: true, error: String(e) });
    }
  }

  // Handle session close events
  if (eventType === "OnImOpenLinesSessionClose" && tenantId) {
    try {
      const sessionData = payload?.data?.[0] || payload?.data || {};
      const chatId = sessionData?.CHAT_ID || sessionData?.chat_id;

      if (chatId) {
        await supabase
          .from("conversations")
          .update({ status: "closed", updated_at: new Date().toISOString() })
          .eq("openlines_chat_id", String(chatId))
          .eq("tenant_id", tenantId);

        console.log("[bitrix-events] Closed conversation for chatId:", chatId);
      }
    } catch (e) {
      console.error("[bitrix-events] Error processing session close:", e);
    }
  }

  return jsonResponse({ ok: true });
});
