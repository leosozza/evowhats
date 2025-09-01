
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

// Get environment variables with fallbacks and validation
const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
const EVOLUTION_BASE_URL = Deno.env.get("EVOLUTION_BASE_URL"); // ex: https://api.evolution-api.com
const EVOLUTION_API_KEY = Deno.env.get("EVOLUTION_API_KEY");

// Validate required environment variables
if (!SUPABASE_URL || !SERVICE_ROLE_KEY || !EVOLUTION_BASE_URL || !EVOLUTION_API_KEY) {
  console.error("Missing required environment variables:", {
    SUPABASE_URL: !!SUPABASE_URL,
    SERVICE_ROLE_KEY: !!SERVICE_ROLE_KEY,
    EVOLUTION_BASE_URL: !!EVOLUTION_BASE_URL,
    EVOLUTION_API_KEY: !!EVOLUTION_API_KEY
  });
}

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
};

const BASE = EVOLUTION_BASE_URL ? EVOLUTION_BASE_URL.replace(/\/$/, "") : "";
const evoUrl = (p: string) => `${BASE}${p}`;
const instanceNameFor = (lineId: string) => `evo_line_${lineId}`;

function J(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), { 
    status, 
    headers: { ...CORS, "Content-Type": "application/json" } 
  });
}

async function evo(path: string, init?: RequestInit): Promise<any> {
  if (!EVOLUTION_BASE_URL || !EVOLUTION_API_KEY) {
    const error = new Error("Evolution API configuration missing");
    (error as any).status = 500;
    (error as any).body = { error: "EVOLUTION_BASE_URL or EVOLUTION_API_KEY not configured" };
    throw error;
  }

  try {
    const url = evoUrl(path);
    console.log(JSON.stringify({category: 'EVO_REQUEST', url, method: init?.method || 'GET'}));
    
    const res = await fetch(url, {
      ...init,
      headers: { 
        "Content-Type": "application/json", 
        apikey: EVOLUTION_API_KEY, 
        ...(init?.headers || {}) 
      },
    });
    
    const text = await res.text().catch(() => "");
    let data;
    try {
      data = text ? JSON.parse(text) : {};
    } catch {
      data = { raw: text };
    }
    
    console.log(JSON.stringify({
      category: 'EVO_RESPONSE', 
      status: res.status, 
      ok: res.ok,
      url,
      dataSize: text.length
    }));
    
    if (!res.ok) {
      const error = new Error(`Evolution API error: ${res.status} ${res.statusText}`);
      (error as any).status = res.status;
      (error as any).body = data;
      (error as any).url = url;
      throw error;
    }
    
    return data;
  } catch (fetchError: any) {
    if (fetchError.status) {
      throw fetchError; // Re-throw errors with status
    }
    
    // Network or other fetch errors
    const error = new Error(`Network error: ${String(fetchError)}`);
    (error as any).status = 500;
    (error as any).body = { error: "Failed to connect to Evolution API", details: String(fetchError) };
    throw error;
  }
}

serve(async (req) => {
  // Always handle CORS
  if (req.method === "OPTIONS") {
    return new Response(null, { 
      status: 200,
      headers: CORS 
    });
  }

  // Validate environment before proceeding
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
    return J({ 
      ok: false, 
      error: "Supabase configuration missing",
      statusCode: 500 
    }, 500);
  }

  const supa = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

  let body: any = {};
  
  try {
    body = await req.json().catch(() => ({}));
    const { action, lineId, instanceId, number, to, text } = body;

    console.log(JSON.stringify({
      category: 'EVO', 
      action, 
      lineId, 
      instanceId, 
      timestamp: new Date().toISOString(),
      hasEvolutionConfig: !!(EVOLUTION_BASE_URL && EVOLUTION_API_KEY)
    }));

    // Diagnostic action - comprehensive health check
    if (action === "diag") {
      const startTime = Date.now();
      const steps: any = {};
      let overallOk = true;

      // Check configuration first
      steps.config = {
        ok: !!(EVOLUTION_BASE_URL && EVOLUTION_API_KEY),
        status: !!(EVOLUTION_BASE_URL && EVOLUTION_API_KEY) ? 200 : 500,
        ms: 0,
        details: {
          hasBaseUrl: !!EVOLUTION_BASE_URL,
          hasApiKey: !!EVOLUTION_API_KEY,
          baseUrl: EVOLUTION_BASE_URL ? `${EVOLUTION_BASE_URL.substring(0, 20)}...` : "missing"
        }
      };
      
      if (!steps.config.ok) {
        overallOk = false;
        return J({ 
          ok: overallOk, 
          steps, 
          totalMs: Date.now() - startTime,
          error: "Configuration missing"
        });
      }

      // Test fetchInstances
      let start = Date.now();
      try {
        const result = await evo(`/instance/fetchInstances`, { method: "GET" });
        steps.fetchInstances = { 
          ok: true, 
          status: 200, 
          ms: Date.now() - start,
          instanceCount: Array.isArray(result) ? result.length : 0
        };
      } catch (e: any) {
        steps.fetchInstances = { 
          ok: false, 
          status: e.status || 500, 
          ms: Date.now() - start, 
          error: e.message || String(e),
          url: e.url || "unknown"
        };
        overallOk = false;
      }

      // Test create (with unique name) - only if fetchInstances worked
      if (steps.fetchInstances.ok) {
        const diagName = `evo_diag_${Date.now()}`;
        let createStart = Date.now();
        try {
          await evo(`/instance/create`, { 
            method: "POST", 
            body: JSON.stringify({ instanceName: diagName, integration: "WHATSAPP-BAILEYS" }) 
          });
          steps.create = { ok: true, status: 200, ms: Date.now() - createStart };
        } catch (e: any) {
          const isAlreadyExists = /exist|already/i.test(String(e));
          steps.create = { 
            ok: isAlreadyExists, 
            status: e.status || 500, 
            ms: Date.now() - createStart, 
            error: e.message || String(e),
            note: isAlreadyExists ? "Already exists (expected)" : undefined
          };
          if (!isAlreadyExists) overallOk = false;
        }

        // Test connectionState
        let connectionStart = Date.now();
        try {
          await evo(`/instance/connectionState/${encodeURIComponent(diagName)}`, { method: "GET" });
          steps.connectionState = { ok: true, status: 200, ms: Date.now() - connectionStart };
        } catch (e: any) {
          steps.connectionState = { 
            ok: false, 
            status: e.status || 500, 
            ms: Date.now() - connectionStart, 
            error: e.message || String(e)
          };
          overallOk = false;
        }
      }

      return J({ 
        ok: overallOk, 
        steps, 
        totalMs: Date.now() - startTime,
        evolutionBaseUrl: EVOLUTION_BASE_URL
      });
    }

    // 1) Health / Lista
    if (action === "list_instances") {
      const data = await evo(`/instance/fetchInstances`, { method: "GET" });
      return J({ ok: true, instances: data });
    }

    // 2) Garantir sessão
    if (action === "ensure_line_session") {
      if (!lineId) return J({ ok: false, error: "missing lineId" }, 400);
      const name = instanceNameFor(String(lineId));
      try {
        await evo(`/instance/create`, { method: "POST", body: JSON.stringify({ instanceName: name, integration: "WHATSAPP-BAILEYS" }) });
      } catch (e) {
        // aceitar "já existe"
        if (!/exist|already/i.test(String(e))) throw e;
      }
      // best-effort: gravar binding, se a tabela existir
      try { await supa.from("open_channel_bindings").upsert({ provider: "evolution", instance_id: name, line_id: String(lineId) }, { onConflict: "provider,line_id" }); } catch {}
      return J({ ok: true, instanceName: name });
    }

    // 3) Conectar
    if (action === "start_session_for_line") {
      if (!lineId) return J({ ok: false, error: "missing lineId" }, 400);
      const name = instanceNameFor(String(lineId));
      const qs = number ? `?number=${encodeURIComponent(number)}` : "";
      const data = await evo(`/instance/connect/${encodeURIComponent(name)}${qs}`, { method: "GET" });
      return J({ ok: true, instanceName: name, data });
    }

    // 4) Status
    if (action === "get_status_for_line") {
      if (!lineId) return J({ ok: false, error: "missing lineId" }, 400);
      const name = instanceNameFor(String(lineId));
      const data = await evo(`/instance/connectionState/${encodeURIComponent(name)}`, { method: "GET" });
      const state = (data?.instance?.state || data?.instance?.status || "unknown").toLowerCase();
      return J({ ok: true, instanceName: name, state, data });
    }

    // 5) QR
    if (action === "get_qr_for_line") {
      if (!lineId) return J({ ok: false, error: "missing lineId" }, 400);
      const name = instanceNameFor(String(lineId));
      const data = await evo(`/instance/connectionState/${encodeURIComponent(name)}`, { method: "GET" });
      const qr = data?.qrcode ?? data?.qRCode ?? data?.qrCode ?? null;
      const qr_base64 = qr?.base64 ?? null;
      const pairingCode = qr?.pairingCode ?? null;
      return J({ ok: true, instanceName: name, qr_base64, pairingCode });
    }

    // 6) Bind (persistência best-effort)
    if (action === "bind_line") {
      if (!instanceId || !lineId) return J({ ok: false, error: "missing instanceId/lineId" }, 400);
      try {
        await supa.from("open_channel_bindings").upsert({ provider: "evolution", instance_id: String(instanceId), line_id: String(lineId) }, { onConflict: "provider,line_id" });
        return J({ ok: true });
      } catch {
        // sem tabela? continue, o nome determinístico resolve nas demais ações
        return J({ ok: false, warn: "binding_not_persisted" });
      }
    }

    // 7) Test send (com retries simples)
    if (action === "test_send") {
      if (!lineId || !to) return J({ ok: false, error: "missing lineId/to" }, 400);
      const name = instanceNameFor(String(lineId));
      const messageBody = { number: String(to), textMessage: { text: String(text ?? "Ping de teste") } };
      try { 
        await evo(`/message/sendText/${encodeURIComponent(name)}`, { method: "POST", body: JSON.stringify(messageBody) }); 
      } catch { 
        await new Promise(r => setTimeout(r, 1000)); 
        await evo(`/message/sendText/${encodeURIComponent(name)}`, { method: "POST", body: JSON.stringify(messageBody) }); 
      }
      return J({ ok: true, instanceName: name });
    }

    return J({ ok: false, error: "unknown_action", availableActions: [
      "diag", "list_instances", "ensure_line_session", "start_session_for_line", 
      "get_status_for_line", "get_qr_for_line", "bind_line", "test_send"
    ] }, 400);
  } catch (e: any) {
    console.error("Evolution connector error:", e);
    const status = e.status || 500;
    
    // Enhanced error response with more debugging info
    const errorResponse = {
      ok: false, 
      statusCode: status,
      error: e.message || String(e), 
      details: e.body || null,
      timestamp: new Date().toISOString(),
      action: body.action || "unknown"
    };
    
    if (e.url) errorResponse.url = e.url;
    
    return J(errorResponse, status);
  }
});
