
import "https://deno.land/x/xhr@0.4.0/mod.ts";
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const ALLOWED_ORIGINS = (Deno.env.get("ALLOWED_ORIGINS") || "").split(/[,\s]+/).filter(Boolean);
function cors(origin?: string | null) {
  const allowed = origin && (ALLOWED_ORIGINS.includes("*") || ALLOWED_ORIGINS.includes(origin)) ? origin : "";
  return {
    "Access-Control-Allow-Origin": allowed || ALLOWED_ORIGINS[0] || "",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-corr-id",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    Vary: "Origin",
  } as Record<string, string>;
}

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

import { callBitrixAPI, setCorrelationId } from "../_shared/bitrix/callBitrixAPI.ts";

serve(async (req) => {
  const origin = req.headers.get("origin");
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: cors(origin) });
  }

  if (req.method !== "POST") {
    return new Response(
      JSON.stringify({ error: "Method not allowed" }),
      { status: 405, headers: cors(origin) }
    );
  }

  const service = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
  setCorrelationId(req.headers.get("x-corr-id") || "");

  try {
    const body = await req.json();
    const { portalUrl, accessToken, tenantId } = body;

    if (!tenantId) {
      return new Response(
        JSON.stringify({ error: "Missing tenantId" }),
        { status: 400, headers: cors(origin) }
      );
    }

    // Webhook URL pointing to bitrix-events-v2
    const webhookUrl = `https://${new URL(SUPABASE_URL).host.replace(".supabase.co", "")}.functions.supabase.co/bitrix-events-v2`;

    // Events to bind (including outbound message events)
    const eventsToReregister = [
      "OnImOpenLinesMessageAdd",
      "OnImMessageAdd", 
      "OnImOpenLinesSessionClose",
      "OnImOpenLinesSessionFinish",
      "OnImOpenLinesSessionTransfer",
      "OnImOpenLinesOperatorAssign",
      "OnImOpenLinesMessageSend"  // Added for outbound messages
    ];

    const results = [];

    for (const eventName of eventsToReregister) {
      try {
        // First unbind any existing handler for this event
        try {
          await callBitrixAPI(tenantId, "event.unbind", { event: eventName, handler: webhookUrl });
        } catch (_) {
          // ignore errors on unbind
        }

        // Then bind to new handler (bitrix-events-v2)
        const bindResult = await callBitrixAPI(tenantId, "event.bind", { event: eventName, handler: webhookUrl });
        
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
      { headers: cors(origin) }
    );

  } catch (error: any) {
    console.error("[bitrix-events-bind-v2] Error:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: cors(origin) }
    );
  }
});
