
import "https://deno.land/x/xhr@0.4.0/mod.ts";
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

async function logStructured(service: any, log: any) {
  try {
    await service.from("webhook_logs").insert({
      provider: "bitrix",
      payload_json: {
        category: log.category,
        tenantId: log.tenantId,
        data: log.data || {}
      },
      valid_signature: true,
      received_at: new Date().toISOString()
    });
  } catch (e) {
    console.error("[bitrix-events-bind-v2] Log error:", e);
  }
}

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
    const body = await req.json();
    const { portalUrl, accessToken, tenantId } = body;

    if (!portalUrl || !accessToken || !tenantId) {
      return new Response(
        JSON.stringify({ error: "Missing required fields" }),
        { status: 400, headers: corsHeaders }
      );
    }

    // Webhook URL pointing to bitrix-events-v2
    const webhookUrl = `https://${new URL(SUPABASE_URL).host.replace(".supabase.co", "")}.functions.supabase.co/bitrix-events-v2`;

    // Events to bind (including closure and transfer events)
    const eventsToReregister = [
      "OnImOpenLinesMessageAdd",
      "OnImMessageAdd", 
      "OnImOpenLinesSessionClose",
      "OnImOpenLinesSessionFinish",
      "OnImOpenLinesSessionTransfer",
      "OnImOpenLinesOperatorAssign"
    ];

    const results = [];

    for (const eventName of eventsToReregister) {
      try {
        // First unbind any existing handler for this event
        const unbindUrl = `${portalUrl}/rest/event.unbind?auth=${accessToken}`;
        const unbindResponse = await fetch(unbindUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            event: eventName,
            handler: webhookUrl
          })
        });

        // Then bind to new handler (bitrix-events-v2)
        const bindUrl = `${portalUrl}/rest/event.bind?auth=${accessToken}`;
        const bindResponse = await fetch(bindUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            event: eventName,
            handler: webhookUrl
          })
        });

        const bindResult = await bindResponse.json();
        
        if (bindResult.result === true) {
          results.push({ event: eventName, status: "success" });
          
          await logStructured(service, {
            category: "BIND",
            tenantId,
            data: { 
              event: eventName, 
              status: "success", 
              webhook_url: webhookUrl 
            }
          });
        } else {
          results.push({ 
            event: eventName, 
            status: "error", 
            error: bindResult.error_description || "Bind failed" 
          });
        }

      } catch (error: any) {
        results.push({ 
          event: eventName, 
          status: "error", 
          error: error.message 
        });
        console.error(`[bitrix-events-bind-v2] Error binding ${eventName}:`, error);
      }
    }

    const successCount = results.filter(r => r.status === "success").length;
    
    await logStructured(service, {
      category: "BIND",
      tenantId,
      data: { 
        total_events: eventsToReregister.length,
        success_count: successCount,
        webhook_url: webhookUrl,
        results 
      }
    });

    return new Response(
      JSON.stringify({
        success: successCount > 0,
        message: `${successCount}/${eventsToReregister.length} events bound successfully`,
        webhook_url: webhookUrl,
        results
      }),
      { headers: corsHeaders }
    );

  } catch (error: any) {
    console.error("[bitrix-events-bind-v2] Error:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: corsHeaders }
    );
  }
});
