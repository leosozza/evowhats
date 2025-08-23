
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
} as const;

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function optionsResponse() {
  return new Response(null, {
    status: 204,
    headers: corsHeaders,
  });
}

async function getServiceClient() {
  return createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
}

// Get Evolution API configuration from environment or database
function getEvolutionConfig() {
  return {
    baseUrl: Deno.env.get("EVO_BASE_URL") || "https://evolution.example.com",
    apiKey: Deno.env.get("EVO_API_KEY") || "change-me",
  };
}

async function callEvolutionAPI(endpoint: string, method: string, data?: any, config?: any) {
  const evoConfig = getEvolutionConfig();
  const instanceConfig = config || {};
  
  // Use instance-specific config if available
  const baseUrl = instanceConfig.baseUrl || evoConfig.baseUrl;
  const apiKey = instanceConfig.apiKey || evoConfig.apiKey;
  const instanceName = instanceConfig.instanceName || "default";

  const url = `${baseUrl.replace(/\/$/, "")}/${endpoint.replace(/^\//, "")}`;
  
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };

  // Add authentication header (format may vary by Evolution API version)
  if (apiKey) {
    headers["apikey"] = apiKey;
    headers["Authorization"] = `Bearer ${apiKey}`;
  }

  console.log(`[evolution-connector] Calling Evolution API: ${method} ${url}`);

  const response = await fetch(url, {
    method,
    headers,
    body: data ? JSON.stringify(data) : undefined,
  });

  const responseText = await response.text();
  let responseData;

  try {
    responseData = JSON.parse(responseText);
  } catch {
    responseData = { raw: responseText };
  }

  if (!response.ok) {
    console.error(`[evolution-connector] API Error:`, response.status, responseData);
    throw new Error(`Evolution API error: ${response.status} - ${responseData?.message || responseText}`);
  }

  return responseData;
}

async function sendTextMessage(instance: string, number: string, text: string, config?: any) {
  const cleanNumber = number.replace(/\D/g, "");
  const jid = cleanNumber.includes("@") ? cleanNumber : `${cleanNumber}@s.whatsapp.net`;

  const payload = {
    number: cleanNumber,
    text: text,
    delay: 0,
  };

  const result = await callEvolutionAPI(`/message/sendText/${instance}`, "POST", payload, config);
  return result;
}

async function sendMediaMessage(instance: string, number: string, mediaUrl: string, caption?: string, config?: any) {
  const cleanNumber = number.replace(/\D/g, "");
  
  const payload = {
    number: cleanNumber,
    mediatype: "image", // This should be detected from URL/mime type
    media: mediaUrl,
    caption: caption || "",
    delay: 0,
  };

  const result = await callEvolutionAPI(`/message/sendMedia/${instance}`, "POST", payload, config);
  return result;
}

async function getInstanceStatus(instance: string, config?: any) {
  try {
    const result = await callEvolutionAPI(`/instance/connectionState/${instance}`, "GET", undefined, config);
    return result;
  } catch (e) {
    console.error(`[evolution-connector] Error getting instance status:`, e);
    return { state: "error", error: String(e) };
  }
}

async function createInstance(instance: string, config?: any) {
  const payload = {
    instanceName: instance,
    qrcode: true,
    integration: "WHATSAPP-BAILEYS",
  };

  const result = await callEvolutionAPI(`/instance/create`, "POST", payload, config);
  return result;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return optionsResponse();
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);

  try {
    const { action, instance, number, text, mediaUrl, caption, config } = await req.json();
    const supabase = await getServiceClient();

    console.log(`[evolution-connector] Action: ${action}, Instance: ${instance}`);

    // Log the request
    await supabase.from("webhook_logs").insert({
      provider: "evolution-connector",
      payload_json: { action, instance, number: number ? "***" : undefined },
      received_at: new Date().toISOString(),
      valid_signature: true,
    });

    switch (action) {
      case "send_message": {
        if (!instance || !number || !text) {
          return jsonResponse({ success: false, error: "Missing required fields: instance, number, text" }, 400);
        }

        const result = await sendTextMessage(instance, number, text, config);
        return jsonResponse({ success: true, data: result });
      }

      case "send_media": {
        if (!instance || !number || !mediaUrl) {
          return jsonResponse({ success: false, error: "Missing required fields: instance, number, mediaUrl" }, 400);
        }

        const result = await sendMediaMessage(instance, number, mediaUrl, caption, config);
        return jsonResponse({ success: true, data: result });
      }

      case "get_status": {
        if (!instance) {
          return jsonResponse({ success: false, error: "Missing required field: instance" }, 400);
        }

        const result = await getInstanceStatus(instance, config);
        return jsonResponse({ success: true, data: result });
      }

      case "create_instance": {
        if (!instance) {
          return jsonResponse({ success: false, error: "Missing required field: instance" }, 400);
        }

        const result = await createInstance(instance, config);
        return jsonResponse({ success: true, data: result });
      }

      case "ensure_line_session": {
        // Legacy compatibility
        const { bitrix_line_id, bitrix_line_name } = await req.json();
        if (!bitrix_line_id) {
          return jsonResponse({ success: false, error: "bitrix_line_id is required" }, 400);
        }

        // Create or get WA session for this line
        const sessionData = {
          evo_instance_id: bitrix_line_id,
          bitrix_line_id,
          bitrix_line_name: bitrix_line_name || `Line ${bitrix_line_id}`,
          status: "PENDING_QR",
        };

        const { data: existing } = await supabase
          .from("wa_sessions")
          .select("*")
          .eq("bitrix_line_id", bitrix_line_id)
          .maybeSingle();

        if (existing) {
          return jsonResponse({ success: true, session: existing });
        }

        const { data: newSession, error } = await supabase
          .from("wa_sessions")
          .insert(sessionData)
          .select("*")
          .maybeSingle();

        if (error) {
          return jsonResponse({ success: false, error: error.message }, 500);
        }

        return jsonResponse({ success: true, session: newSession });
      }

      case "start_session_for_line": {
        // Legacy compatibility  
        const { bitrix_line_id } = await req.json();
        if (!bitrix_line_id) {
          return jsonResponse({ success: false, error: "bitrix_line_id is required" }, 400);
        }

        try {
          const status = await getInstanceStatus(bitrix_line_id, config);
          return jsonResponse({ success: true, status });
        } catch (e) {
          // Try to create instance if it doesn't exist
          try {
            const created = await createInstance(bitrix_line_id, config);
            return jsonResponse({ success: true, created, status: "created" });
          } catch (createError) {
            return jsonResponse({ success: false, error: String(createError) }, 500);
          }
        }
      }

      case "get_status_for_line": {
        // Legacy compatibility
        const { bitrix_line_id } = await req.json();
        if (!bitrix_line_id) {
          return jsonResponse({ success: false, error: "bitrix_line_id is required" }, 400);
        }

        const status = await getInstanceStatus(bitrix_line_id, config);
        return jsonResponse({ success: true, status });
      }

      case "get_qr_for_line": {
        // Legacy compatibility
        const { bitrix_line_id } = await req.json();
        if (!bitrix_line_id) {
          return jsonResponse({ success: false, error: "bitrix_line_id is required" }, 400);
        }

        // Get QR from database
        const { data: session } = await supabase
          .from("wa_sessions")
          .select("qr_code, status")
          .eq("bitrix_line_id", bitrix_line_id)
          .maybeSingle();

        return jsonResponse({ 
          success: true, 
          qr: session?.qr_code || null,
          status: session?.status || "DISCONNECTED"
        });
      }

      default:
        return jsonResponse({ success: false, error: `Unknown action: ${action}` }, 400);
    }
  } catch (error: any) {
    console.error("[evolution-connector] Error:", error);
    return jsonResponse({ success: false, error: error.message || "Internal error" }, 500);
  }
});
