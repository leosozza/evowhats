
import "https://deno.land/x/xhr@0.4.0/mod.ts";
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const EVOLUTION_BASE_URL = Deno.env.get("EVOLUTION_BASE_URL") || "";
const EVOLUTION_API_KEY = Deno.env.get("EVOLUTION_API_KEY") || "";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
};

async function logStructured(service: any, log: any) {
  try {
    await service.from("webhook_logs").insert({
      provider: "evolution",
      payload_json: {
        category: log.category,
        action: log.action,
        lineId: log.lineId,
        instanceName: log.instanceName,
        state: log.state,
        provider: "evolution",
        data: log.data || {}
      },
      valid_signature: true,
      received_at: new Date().toISOString()
    });
  } catch (e) {
    console.error("[evolution-connector-v2] Log error:", e);
  }
}

async function callEvolutionAPI(path: string, method = "GET", body?: any) {
  const url = `${EVOLUTION_BASE_URL}${path}`;
  const options: RequestInit = {
    method,
    headers: {
      "Content-Type": "application/json",
      "apikey": EVOLUTION_API_KEY,
    },
  };

  if (body && method !== "GET") {
    options.body = JSON.stringify(body);
  }

  console.log(`[evolution-connector-v2] ${method} ${url}`);
  const response = await fetch(url, options);
  const data = await response.json().catch(() => ({}));
  
  return { ok: response.ok, status: response.status, data };
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

  const service = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

  try {
    const body = await req.json();
    const { action } = body;

    await logStructured(service, {
      category: "REQUEST",
      action,
      data: { action, ...body }
    });

    if (action === "list_instances") {
      const result = await callEvolutionAPI("/instance/fetchInstances");
      
      if (result.ok) {
        const instances = Array.isArray(result.data) ? result.data : [];
        
        // Get bindings from database
        const { data: bindings } = await service
          .from("open_channel_bindings")
          .select("*")
          .eq("provider", "evolution");

        const bindingMap = (bindings || []).reduce((acc: any, binding: any) => {
          acc[binding.instance_id] = binding.line_id;
          return acc;
        }, {});

        const enhancedInstances = instances.map((inst: any) => ({
          id: inst.instanceName || inst.instance || inst.name,
          label: inst.instanceName || inst.instance || inst.name,
          status: inst.state || inst.status || "unknown",
          bound_line_id: bindingMap[inst.instanceName || inst.instance || inst.name] || null,
        }));

        return new Response(
          JSON.stringify({ ok: true, instances: enhancedInstances }),
          { headers: corsHeaders }
        );
      }

      return new Response(
        JSON.stringify({ ok: false, error: "Failed to fetch instances" }),
        { status: 500, headers: corsHeaders }
      );
    }

    if (action === "ensure_line_session") {
      const { bitrix_line_id, bitrix_line_name } = body;
      const instanceName = `evo_line_${bitrix_line_id}`;

      await logStructured(service, {
        category: "EVOLUTION",
        action: "ensure_line_session",
        lineId: bitrix_line_id,
        instanceName,
        data: { bitrix_line_name }
      });

      const result = await callEvolutionAPI("/instance/create", "POST", {
        instanceName,
        integration: "WHATSAPP_BAILEYS"
      });

      if (result.ok || result.status === 409 || result.status === 400) {
        return new Response(
          JSON.stringify({ 
            ok: true, 
            instanceName,
            warn: result.status === 409 ? "already_exists" : undefined
          }),
          { headers: corsHeaders }
        );
      }

      return new Response(
        JSON.stringify({ ok: false, error: result.data?.message || "Failed to create instance" }),
        { status: 500, headers: corsHeaders }
      );
    }

    if (action === "start_session_for_line") {
      const { lineId, number } = body;
      const instanceName = `evo_line_${lineId}`;

      await logStructured(service, {
        category: "EVOLUTION",
        action: "start_session_for_line",
        lineId,
        instanceName,
        data: { number }
      });

      const connectPath = number 
        ? `/instance/connect/${instanceName}?number=${encodeURIComponent(number)}`
        : `/instance/connect/${instanceName}`;

      const result = await callEvolutionAPI(connectPath);

      return new Response(
        JSON.stringify({ 
          ok: result.ok, 
          data: result.data,
          error: result.ok ? undefined : result.data?.message || "Failed to start session"
        }),
        { headers: corsHeaders }
      );
    }

    if (action === "get_status_for_line") {
      const { lineId } = body;
      const instanceName = `evo_line_${lineId}`;

      const result = await callEvolutionAPI(`/instance/connectionState/${instanceName}`);

      if (result.ok) {
        const state = result.data?.state || result.data?.status || "unknown";
        const normalizedState = state === "open" ? "open" : 
                               state === "connecting" ? "connecting" : 
                               state === "close" ? "close" : "error";

        return new Response(
          JSON.stringify({ 
            ok: true, 
            data: { 
              state: normalizedState,
              instanceName
            }
          }),
          { headers: corsHeaders }
        );
      }

      return new Response(
        JSON.stringify({ ok: false, error: "Failed to get status" }),
        { headers: corsHeaders }
      );
    }

    if (action === "get_qr_for_line") {
      const { lineId } = body;
      const instanceName = `evo_line_${lineId}`;

      const result = await callEvolutionAPI(`/instance/connectionState/${instanceName}`);

      if (result.ok) {
        const qrCode = result.data?.qrcode?.base64 || result.data?.base64 || result.data?.qr_base64;
        
        return new Response(
          JSON.stringify({ 
            ok: true, 
            data: { 
              qr_base64: qrCode ? `data:image/png;base64,${qrCode}` : null,
              state: result.data?.state || "unknown"
            }
          }),
          { headers: corsHeaders }
        );
      }

      return new Response(
        JSON.stringify({ ok: false, error: "Failed to get QR" }),
        { headers: corsHeaders }
      );
    }

    if (action === "bind_line") {
      const { instanceId, lineId } = body;

      const { error } = await service
        .from("open_channel_bindings")
        .upsert({
          provider: "evolution",
          instance_id: instanceId,
          line_id: lineId,
          updated_at: new Date().toISOString()
        }, {
          onConflict: "provider,instance_id"
        });

      if (error) {
        return new Response(
          JSON.stringify({ ok: false, error: error.message }),
          { status: 500, headers: corsHeaders }
        );
      }

      await logStructured(service, {
        category: "BINDING",
        action: "bind_line",
        lineId,
        instanceName: instanceId,
        data: { bound: true }
      });

      return new Response(
        JSON.stringify({ ok: true }),
        { headers: corsHeaders }
      );
    }

    if (action === "test_send") {
      const { lineId, to, text = "Ping de teste" } = body;
      const instanceName = `evo_line_${lineId}`;

      const delays = [1000, 3000, 7000];
      let lastError;

      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          const result = await callEvolutionAPI(`/message/sendText/${instanceName}`, "POST", {
            number: to,
            text
          });

          if (result.ok) {
            await logStructured(service, {
              category: "OUTBOUND",
              action: "test_send",
              lineId,
              instanceName,
              data: { success: true, attempt: attempt + 1, to, text }
            });

            return new Response(
              JSON.stringify({ ok: true, data: result.data }),
              { headers: corsHeaders }
            );
          }

          lastError = result.data?.message || "Send failed";
        } catch (error: any) {
          lastError = error.message;
        }

        if (attempt < 2) {
          await new Promise(resolve => setTimeout(resolve, delays[attempt]));
        }
      }

      await logStructured(service, {
        category: "OUTBOUND",
        action: "test_send",
        lineId,
        instanceName,
        data: { success: false, error: lastError, to }
      });

      return new Response(
        JSON.stringify({ ok: false, error: lastError }),
        { status: 500, headers: corsHeaders }
      );
    }

    return new Response(
      JSON.stringify({ ok: false, error: "Unknown action" }),
      { status: 400, headers: corsHeaders }
    );

  } catch (error: any) {
    console.error("[evolution-connector-v2] Error:", error);
    
    await logStructured(service, {
      category: "ERROR",
      action: "unknown",
      data: { error: error.message }
    });

    return new Response(
      JSON.stringify({ ok: false, error: error.message }),
      { status: 500, headers: corsHeaders }
    );
  }
});
