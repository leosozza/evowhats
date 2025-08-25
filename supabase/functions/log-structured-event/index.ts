
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response(
      JSON.stringify({ error: "Method not allowed" }),
      { status: 405, headers: corsHeaders }
    );
  }

  const service = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

  try {
    const logData = await req.json();

    await service.from("webhook_logs").insert({
      provider: logData.provider || "system",
      payload_json: {
        category: logData.category,
        tenantId: logData.tenantId,
        instanceId: logData.instanceId,
        conversationId: logData.conversationId,
        chatId: logData.chatId,
        direction: logData.direction,
        provider: logData.provider,
        msgKey: logData.msgKey,
        data: logData.data || {}
      },
      valid_signature: logData.valid_signature ?? true,
      received_at: new Date().toISOString()
    });

    return new Response(
      JSON.stringify({ success: true }),
      { status: 200, headers: corsHeaders }
    );
  } catch (error: any) {
    console.error("[log-structured-event] Error:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: corsHeaders }
    );
  }
});
