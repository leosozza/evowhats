
import "https://deno.land/x/xhr@0.4.0/mod.ts";
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const EVOLUTION_API_KEY = Deno.env.get("EVOLUTION_API_KEY") || "";
const EVOLUTION_BASE_URL = Deno.env.get("EVOLUTION_BASE_URL") || "https://evolution-api.example.com";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
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
    console.error("[evolution-connector-v2] Log error:", e);
  }
}

async function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function sendWithRetries(instanceName: string, phoneNumber: string, message: string, service: any, tenantId: string): Promise<any> {
  const maxRetries = 3;
  const backoffDelays = [1000, 3000, 7000]; // 1s, 3s, 7s
  
  let lastError;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const response = await fetch(`${EVOLUTION_BASE_URL}/message/sendText/${instanceName}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "apikey": EVOLUTION_API_KEY,
        },
        body: JSON.stringify({
          number: phoneNumber,
          text: message,
        }),
      });

      if (response.ok) {
        const result = await response.json();
        
        await logStructured(service, {
          category: "OUTBOUND",
          tenantId,
          instanceId: instanceName,
          direction: "out",
          provider: "evolution",
          data: { 
            attempt: attempt + 1, 
            success: true, 
            phoneNumber, 
            message: message.substring(0, 100) 
          }
        });

        return { success: true, data: result };
      } else {
        throw new Error(`HTTP ${response.status}: ${await response.text()}`);
      }
    } catch (error: any) {
      lastError = error;
      
      await logStructured(service, {
        category: "OUTBOUND",
        tenantId,
        instanceId: instanceName,
        direction: "out",
        provider: "evolution",
        data: { 
          attempt: attempt + 1, 
          success: false, 
          error: error.message,
          phoneNumber 
        }
      });

      console.error(`[evolution-connector-v2] Attempt ${attempt + 1} failed:`, error.message);

      if (attempt < maxRetries - 1) {
        await sleep(backoffDelays[attempt]);
      }
    }
  }

  // All retries failed
  await logStructured(service, {
    category: "OUTBOUND",
    tenantId,
    instanceId: instanceName,
    direction: "out",
    provider: "evolution",
    data: { 
      final_failure: true, 
      error: lastError?.message,
      phoneNumber,
      attempts: maxRetries 
    }
  });

  return { success: false, error: lastError?.message || "All retries failed" };
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  if (req.method === "GET") {
    return new Response(
      JSON.stringify({ ok: true, message: "evolution-connector-v2 alive" }),
      { headers: corsHeaders }
    );
  }

  if (req.method !== "POST") {
    return new Response(
      JSON.stringify({ error: "Method not allowed" }),
      { status: 405, headers: corsHeaders }
    );
  }

  const service = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

  try {
    const body = await req.json();
    const { action } = body;

    if (action === "send_message") {
      const { bitrix_line_id, phone_number, message, tenantId } = body;

      if (!bitrix_line_id || !phone_number || !message || !tenantId) {
        return new Response(
          JSON.stringify({ error: "Missing required fields" }),
          { status: 400, headers: corsHeaders }
        );
      }

      // Get session for this line
      const { data: session } = await service
        .from("wa_sessions")
        .select("*")
        .eq("bitrix_line_id", bitrix_line_id)
        .eq("user_id", tenantId)
        .limit(1)
        .maybeSingle();

      if (!session) {
        return new Response(
          JSON.stringify({ error: "No session found for this line" }),
          { status: 404, headers: corsHeaders }
        );
      }

      const instanceName = session.evo_instance_id;

      // Find or create conversation
      const { data: conversation } = await service
        .from("conversations")
        .select("*")
        .eq("user_id", tenantId)
        .eq("contact_phone", phone_number)
        .eq("evolution_instance", instanceName)
        .limit(1)
        .maybeSingle();

      let conversationId = conversation?.id;
      if (!conversationId) {
        const ins = await service
          .from("conversations")
          .insert({
            user_id: tenantId,
            contact_phone: phone_number,
            evolution_instance: instanceName,
            openlines_chat_id: null,
            last_message_at: new Date().toISOString(),
            status: "open"
          })
          .select("id")
          .maybeSingle();
        
        if (ins.error) throw ins.error;
        conversationId = ins.data?.id;
      }

      // Create message record with queued status
      const { data: messageRecord } = await service
        .from("messages")
        .insert({
          conversation_id: conversationId,
          direction: "out",
          message_type: "text",
          content: message,
          sender_name: "System",
          status: "sending",
          delivery_status: "queued",
          retry_count: 0
        })
        .select("id")
        .single();

      // Send with retries
      const result = await sendWithRetries(instanceName, phone_number, message, service, tenantId);

      // Update message status
      await service
        .from("messages")
        .update({
          delivery_status: result.success ? "sent" : "failed",
          status: result.success ? "sent" : "failed",
          error_details: result.success ? null : result.error,
          retry_count: 3 // Max attempts made
        })
        .eq("id", messageRecord.id);

      return new Response(
        JSON.stringify({
          success: result.success,
          message_id: messageRecord.id,
          delivery_status: result.success ? "sent" : "failed",
          error: result.error
        }),
        { headers: corsHeaders }
      );
    }

    if (action === "get_status_for_line") {
      const { bitrix_line_id, tenantId } = body;

      if (!bitrix_line_id || !tenantId) {
        return new Response(
          JSON.stringify({ error: "Missing required fields" }),
          { status: 400, headers: corsHeaders }
        );
      }

      // Get session for this line
      const { data: session } = await service
        .from("wa_sessions")
        .select("*")
        .eq("bitrix_line_id", bitrix_line_id)
        .eq("user_id", tenantId)
        .limit(1)
        .maybeSingle();

      if (!session) {
        return new Response(
          JSON.stringify({ 
            success: false, 
            status: "not_found",
            error: "No session found for this line" 
          }),
          { headers: corsHeaders }
        );
      }

      const instanceName = session.evo_instance_id;

      try {
        // Get instance status from Evolution API
        const response = await fetch(`${EVOLUTION_BASE_URL}/instance/connectionState/${instanceName}`, {
          headers: { "apikey": EVOLUTION_API_KEY },
        });

        if (response.ok) {
          const data = await response.json();
          return new Response(
            JSON.stringify({
              success: true,
              status: data.state || "unknown",
              instance_name: instanceName,
              line_id: bitrix_line_id,
              session_data: session
            }),
            { headers: corsHeaders }
          );
        } else {
          throw new Error(`HTTP ${response.status}`);
        }
      } catch (error: any) {
        return new Response(
          JSON.stringify({
            success: false,
            status: "error",
            error: error.message,
            instance_name: instanceName,
            line_id: bitrix_line_id
          }),
          { headers: corsHeaders }
        );
      }
    }

    return new Response(
      JSON.stringify({ error: "Unknown action" }),
      { status: 400, headers: corsHeaders }
    );

  } catch (error: any) {
    console.error("[evolution-connector-v2] Error:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: corsHeaders }
    );
  }
});
