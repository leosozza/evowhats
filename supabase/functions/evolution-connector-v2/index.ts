
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

async function logStructured(category: string, action: string, data: any = {}) {
  console.log(JSON.stringify({
    category,
    action,
    timestamp: new Date().toISOString(),
    ...data
  }));
}

async function callEvolutionAPI(path: string, method = "GET", body?: any) {
  const url = `${EVOLUTION_BASE_URL.replace(/\/$/, "")}${path}`;
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

const instanceNameForLine = (lineId: string) => `evo_line_${lineId}`;

// Tenta ler binding do DB; se não houver tabela, retorna null (fallback)
async function getBinding(service: any, lineId: string) {
  try {
    const { data } = await service
      .from("open_channel_bindings")
      .select("instance_id")
      .eq("provider", "evolution")
      .eq("line_id", lineId)
      .maybeSingle();
    return data?.instance_id || null;
  } catch {
    return null;
  }
}

// Upsert binding no DB; se a tabela não existir, apenas segue
async function upsertBinding(service: any, instanceId: string, lineId: string) {
  try {
    const { error } = await service
      .from("open_channel_bindings")
      .upsert({
        provider: "evolution",
        instance_id: instanceId,
        line_id: lineId,
        updated_at: new Date().toISOString(),
      }, {
        onConflict: "provider,line_id"
      });
    if (error) throw error;
    return true;
  } catch {
    return false; // fallback: ignorar erro de tabela inexistente
  }
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

    await logStructured("REQUEST", action, { action, ...body });

    if (action === "list_instances") {
      const result = await callEvolutionAPI("/instance/fetchInstances");
      
      if (result.ok) {
        const instances = Array.isArray(result.data) ? result.data : [];
        
        // Get bindings from database with fallback
        let bindingMap: any = {};
        try {
          const { data: bindings } = await service
            .from("open_channel_bindings")
            .select("*")
            .eq("provider", "evolution");

          bindingMap = (bindings || []).reduce((acc: any, binding: any) => {
            acc[binding.instance_id] = binding.line_id;
            return acc;
          }, {});
        } catch {
          // Fallback: sem bindings persistidos
        }

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
      const { lineId, lineName } = body;
      if (!lineId) {
        return new Response(
          JSON.stringify({ ok: false, error: "missing lineId" }),
          { status: 400, headers: corsHeaders }
        );
      }

      const instanceName = instanceNameForLine(String(lineId));

      await logStructured("EVO", "ensure_line_session", {
        lineId,
        instanceName,
        lineName
      });

      try {
        const result = await callEvolutionAPI("/instance/create", "POST", {
          instanceName,
          integration: "WHATSAPP_BAILEYS"
        });

        if (result.ok || result.status === 409 || result.status === 400) {
          // Grava binding (best effort)
          await upsertBinding(service, instanceName, String(lineId));
          
          return new Response(
            JSON.stringify({ 
              ok: true, 
              instanceName,
              warn: result.status === 409 ? "already_exists" : undefined
            }),
            { headers: corsHeaders }
          );
        }
      } catch (e) {
        const msg = String(e);
        if (/exist|already/i.test(msg)) {
          // Instância já existe
          await upsertBinding(service, instanceName, String(lineId));
          return new Response(
            JSON.stringify({ ok: true, instanceName, warn: "already_exists" }),
            { headers: corsHeaders }
          );
        }
        throw e;
      }

      return new Response(
        JSON.stringify({ ok: false, error: "Failed to create instance" }),
        { status: 500, headers: corsHeaders }
      );
    }

    if (action === "start_session_for_line") {
      const { lineId, number } = body;
      if (!lineId) {
        return new Response(
          JSON.stringify({ ok: false, error: "missing lineId" }),
          { status: 400, headers: corsHeaders }
        );
      }

      const instanceName = (await getBinding(service, String(lineId))) || instanceNameForLine(String(lineId));

      await logStructured("EVO", "start_session_for_line", {
        lineId,
        instanceName,
        number
      });

      const connectPath = number 
        ? `/instance/connect/${encodeURIComponent(instanceName)}?number=${encodeURIComponent(number)}`
        : `/instance/connect/${encodeURIComponent(instanceName)}`;

      const result = await callEvolutionAPI(connectPath);

      return new Response(
        JSON.stringify({ 
          ok: result.ok, 
          instanceName,
          data: result.data,
          error: result.ok ? undefined : result.data?.message || "Failed to start session"
        }),
        { headers: corsHeaders }
      );
    }

    if (action === "get_status_for_line") {
      const { lineId } = body;
      if (!lineId) {
        return new Response(
          JSON.stringify({ ok: false, error: "missing lineId" }),
          { status: 400, headers: corsHeaders }
        );
      }

      const instanceName = (await getBinding(service, String(lineId))) || instanceNameForLine(String(lineId));

      const result = await callEvolutionAPI(`/instance/connectionState/${encodeURIComponent(instanceName)}`);

      if (result.ok) {
        const state = result.data?.instance?.state || result.data?.instance?.status || result.data?.state || result.data?.status || "unknown";
        const normalizedState = state === "open" ? "open" : 
                               state === "connecting" ? "connecting" : 
                               state === "close" ? "close" : "error";

        return new Response(
          JSON.stringify({ 
            ok: true, 
            instanceName,
            state: normalizedState,
            data: result.data
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
      if (!lineId) {
        return new Response(
          JSON.stringify({ ok: false, error: "missing lineId" }),
          { status: 400, headers: corsHeaders }
        );
      }

      const instanceName = (await getBinding(service, String(lineId))) || instanceNameForLine(String(lineId));

      const result = await callEvolutionAPI(`/instance/connectionState/${encodeURIComponent(instanceName)}`);

      if (result.ok) {
        const qrData = result.data?.qrcode || result.data?.qRCode || result.data?.qrCode || null;
        const qrBase64 = qrData?.base64 || result.data?.base64 || result.data?.qr_base64 || null;
        const pairingCode = qrData?.pairingCode || result.data?.pairingCode || null;
        
        return new Response(
          JSON.stringify({ 
            ok: true, 
            instanceName,
            qr_base64: qrBase64 ? `data:image/png;base64,${qrBase64}` : null,
            pairing_code: pairingCode,
            state: result.data?.instance?.state || result.data?.state || "unknown"
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
      if (!instanceId || !lineId) {
        return new Response(
          JSON.stringify({ ok: false, error: "missing instanceId/lineId" }),
          { status: 400, headers: corsHeaders }
        );
      }

      const success = await upsertBinding(service, String(instanceId), String(lineId));

      await logStructured("BINDING", "bind_line", {
        lineId,
        instanceName: instanceId,
        bound: success
      });

      return new Response(
        JSON.stringify({ ok: success, instanceId, lineId }),
        { headers: corsHeaders }
      );
    }

    if (action === "test_send") {
      const { lineId, to, text = "Ping de teste" } = body;
      if (!lineId || !to) {
        return new Response(
          JSON.stringify({ ok: false, error: "missing lineId/to" }),
          { status: 400, headers: corsHeaders }
        );
      }

      const instanceName = (await getBinding(service, String(lineId))) || instanceNameForLine(String(lineId));
      const payload = { number: String(to), text: String(text) };

      const delays = [1000, 3000, 7000];
      let lastError;

      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          const result = await callEvolutionAPI(`/message/sendText/${encodeURIComponent(instanceName)}`, "POST", payload);

          if (result.ok) {
            await logStructured("OUTBOUND", "test_send", {
              success: true,
              attempt: attempt + 1,
              lineId,
              instanceName,
              to,
              text
            });

            return new Response(
              JSON.stringify({ ok: true, instanceName, data: result.data }),
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

      await logStructured("OUTBOUND", "test_send", {
        success: false,
        error: lastError,
        lineId,
        instanceName,
        to
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
    
    await logStructured("ERROR", "unknown", { error: error.message });

    return new Response(
      JSON.stringify({ ok: false, error: error.message }),
      { status: 500, headers: corsHeaders }
    );
  }
});
