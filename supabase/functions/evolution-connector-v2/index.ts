// redeploy trigger
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const RAW = Deno.env.get("EVOLUTION_BASE_URL") || "";
const BASE = RAW.replace(/\/+$/, ""); // remove trailing slashes
const KEY = Deno.env.get("EVOLUTION_API_KEY") || "";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
};

const ok = (data: any, status = 200) => 
  new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" }
  });

function authHeaders(primary = true) {
  return primary
    ? { "Content-Type": "application/json", apikey: KEY }
    : { "Content-Type": "application/json", Authorization: `Bearer ${KEY}` };
}

async function evo(path: string, init?: RequestInit) {
  const url = `${BASE}${path}`;
  
  const go = async (usePrimary: boolean) => {
    console.log(JSON.stringify({
      category: 'EVO',
      action: 'REQUEST',
      url,
      method: init?.method || 'GET',
      authType: usePrimary ? 'apikey' : 'bearer'
    }));

    const res = await fetch(url, {
      ...init,
      headers: {
        ...(init?.headers || {}),
        ...authHeaders(usePrimary)
      }
    });
    
    const text = await res.text().catch(() => "");
    
    console.log(JSON.stringify({
      category: 'EVO',
      action: 'RESPONSE',
      status: res.status,
      ok: res.ok,
      url,
      responseSize: text.length
    }));

    if (!res.ok) {
      throw { status: res.status, body: text || null, url };
    }
    
    try {
      return JSON.parse(text);
    } catch {
      return text || {};
    }
  };

  try {
    return await go(true);
  } catch (e: any) {
    // If unauthorized, try alternate auth method
    if (e?.status === 401 || e?.status === 403) {
      return await go(false);
    }
    throw e;
  }
}

const instanceFor = (lineId: string) => `evo_line_${lineId}`;

async function listCompat() {
  // Try different versions/forks paths in order
  try {
    return await evo("/instance/fetchInstances", { method: "GET" });
  } catch (_) {
    try {
      return await evo("/instances", { method: "GET" });
    } catch (_) {
      try {
        return await evo("/sessions", { method: "GET" });
      } catch (e) {
        throw e;
      }
    }
  }
}

async function connectCompat(name: string, number?: string) {
  // Some forks require GET, others POST
  try {
    const qs = number ? `?number=${encodeURIComponent(number)}` : "";
    return await evo(`/instance/connect/${encodeURIComponent(name)}${qs}`, { method: "GET" });
  } catch (_) {
    return await evo(`/instance/connect`, {
      method: "POST",
      body: JSON.stringify({ instanceName: name, number })
    });
  }
}

async function stateCompat(name: string) {
  try {
    return await evo(`/instance/connectionState/${encodeURIComponent(name)}`, { method: "GET" });
  } catch (_) {
    try {
      return await evo(`/instance/connectionState?instanceName=${encodeURIComponent(name)}`, { method: "GET" });
    } catch (e) {
      throw e;
    }
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: CORS });
  }

  // Validate environment
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
    return ok({
      ok: false,
      statusCode: 500,
      error: "Supabase configuration missing"
    }, 500);
  }

  const supa = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
  
  const err = (e: any) => ok({
    ok: false,
    statusCode: e?.status ?? 500,
    error: String(e),
    details: e?.body ?? null,
    url: e?.url ?? null
  }, e?.status ?? 500);

  let body: any = {};
  
  try {
    body = await req.json().catch(() => ({}));
    const { action, lineId, instanceId, to, text, number } = body;

    console.log(JSON.stringify({
      category: 'EVO',
      action,
      lineId,
      instanceId,
      timestamp: new Date().toISOString(),
      hasConfig: !!(BASE && KEY)
    }));

    // Comprehensive diagnostic - ALWAYS returns 200
    if (action === "diag") {
      const steps: any = {};
      const startTime = Date.now();

      // Check configuration
      steps.config = {
        ok: !!(BASE && KEY),
        hasBaseUrl: !!BASE,
        hasApiKey: !!KEY,
        baseUrl: BASE ? `${BASE.substring(0, 30)}...` : "missing"
      };

      if (steps.config.ok) {
        // Test fetchInstances
        try {
          const t = Date.now();
          const instances = await listCompat();
          steps.fetchInstances = {
            ok: true,
            status: 200,
            ms: Date.now() - t,
            instanceCount: Array.isArray(instances) ? instances.length : 0
          };
        } catch (e: any) {
          steps.fetchInstances = {
            ok: false,
            status: e?.status ?? 500,
            details: e?.body ?? null,
            url: e?.url
          };
        }

        // Test create instance (only if fetch worked)
        if (steps.fetchInstances.ok) {
          const diagName = `evo_diag_${Date.now()}`;
          try {
            const t = Date.now();
            await evo("/instance/create", {
              method: "POST",
              body: JSON.stringify({
                instanceName: diagName,
                integration: "WHATSAPP_BAILEYS"
              })
            });
            steps.create = {
              ok: true,
              status: 200,
              ms: Date.now() - t,
              name: diagName
            };

            // Test connection state
            try {
              const t2 = Date.now();
              await stateCompat(diagName);
              steps.connectionState = {
                ok: true,
                status: 200,
                ms: Date.now() - t2
              };
            } catch (e: any) {
              steps.connectionState = {
                ok: false,
                status: e?.status ?? 500,
                details: e?.body ?? null
              };
            }
          } catch (e: any) {
            const isAlreadyExists = /exist|already/i.test(String(e?.body || e));
            steps.create = {
              ok: isAlreadyExists,
              status: e?.status ?? 500,
              details: e?.body ?? null,
              note: isAlreadyExists ? "Already exists (expected)" : undefined
            };
            if (isAlreadyExists) {
              // If exists, try connectionState anyway
              try {
                const t2 = Date.now();
                await stateCompat(diagName);
                steps.connectionState = {
                  ok: true,
                  status: 200,
                  ms: Date.now() - t2
                };
              } catch (e: any) {
                steps.connectionState = {
                  ok: false,
                  status: e?.status ?? 500,
                  details: e?.body ?? null
                };
              }
            } else {
              steps.connectionState = {
                ok: false,
                status: 0,
                error: "Skipped due to create failure"
              };
            }
          }
        }
      }

      const okAll = Object.values(steps).every((s: any) => s.ok);
      return ok({
        ok: okAll,
        steps,
        totalMs: Date.now() - startTime,
        evolutionBaseUrl: BASE,
        apiKeyConfigured: !!KEY
      });
    }

    if (action === "list_instances") {
      try {
        const data = await listCompat();
        return ok({ ok: true, instances: data });
      } catch (e) {
        return err(e);
      }
    }

    if (action === "ensure_line_session") {
      if (!lineId) return ok({ ok: false, statusCode: 400, error: "missing lineId" }, 400);
      const name = instanceFor(String(lineId));
      try {
        await evo("/instance/create", {
          method: "POST",
          body: JSON.stringify({
            instanceName: name,
            integration: "WHATSAPP-BAILEYS"
          })
        });
      } catch (e: any) {
        const b = (e?.body || "").toString().toLowerCase();
        if (!b.includes("exist")) return err(e); // tolerate "already exists"
      }
      
        // Best-effort binding
        try {
          await supa
            .from("open_channel_bindings")
            .upsert(
              { provider: "evolution", instance_id: name, line_id: String(lineId) },
              { onConflict: "provider,line_id" }
            );
        } catch (e) {
          console.log(JSON.stringify({
            category: 'EVO',
            action: 'BINDING_WARNING',
            msg: 'Failed to bind - table may not exist',
            error: String(e)
          }));
        } // ignore binding errors
      
      return ok({ ok: true, instanceName: name });
    }

    if (action === "start_session_for_line") {
      if (!lineId) return ok({ ok: false, statusCode: 400, error: "missing lineId" }, 400);
      const name = instanceFor(String(lineId));
      try {
        const data = await connectCompat(name, number);
        return ok({ ok: true, instanceName: name, data });
      } catch (e) {
        return err(e);
      }
    }

    if (action === "get_status_for_line") {
      if (!lineId) return ok({ ok: false, statusCode: 400, error: "missing lineId" }, 400);
      const name = instanceFor(String(lineId));
      try {
        const data = await stateCompat(name);
        const state = (
          data?.instance?.state || 
          data?.instance?.status || 
          data?.state || 
          "unknown"
        ).toLowerCase();
        return ok({ ok: true, instanceName: name, state, data });
      } catch (e) {
        return err(e);
      }
    }

    if (action === "get_qr_for_line") {
      if (!lineId) return ok({ ok: false, statusCode: 400, error: "missing lineId" }, 400);
      const name = instanceFor(String(lineId));
      try {
        const data = await stateCompat(name);
        const q = data?.qrcode ?? data?.qrCode ?? data?.qRCode ?? null;
        const qr_base64 = q?.base64 ?? null;
        const pairingCode = q?.pairingCode ?? null;
        return ok({ ok: true, instanceName: name, qr_base64, pairingCode });
      } catch (e) {
        return err(e);
      }
    }

    if (action === "test_send") {
      if (!lineId || !to) return ok({ ok: false, statusCode: 400, error: "missing lineId/to" }, 400);
      const name = instanceFor(String(lineId));
      const payload = { number: String(to), text: String(text ?? "Ping de teste") };
      try {
        // Try with retry for robustness
        try {
          await evo(`/message/sendText/${encodeURIComponent(name)}`, {
            method: "POST",
            body: JSON.stringify(payload)
          });
        } catch {
          // Fallback method for different API versions
          await evo(`/message/sendText`, {
            method: "POST",
            body: JSON.stringify({ instanceName: name, ...payload })
          });
        }
        return ok({ ok: true, instanceName: name });
      } catch (e) {
        return err(e);
      }
    }

    if (action === "bind_line") {
      if (!instanceId || !lineId) return ok({ ok: false, statusCode: 400, error: "missing instanceId/lineId" }, 400);
      try {
        await supa
          .from("open_channel_bindings")
          .upsert(
            { provider: "evolution", instance_id: String(instanceId), line_id: String(lineId) },
            { onConflict: "provider,line_id" }
          );
        return ok({ ok: true });
      } catch (e) {
        console.log(JSON.stringify({
          category: 'EVO',
          action: 'BIND_WARNING',
          msg: 'binding_not_persisted',
          error: String(e)
        }));
        return ok({ ok: false, warn: "binding_not_persisted" });
      }
    }

    return ok({
      ok: false,
      statusCode: 400,
      error: "unknown_action",
      availableActions: [
        "diag", "list_instances", "ensure_line_session", 
        "start_session_for_line", "get_status_for_line", 
        "get_qr_for_line", "test_send", "bind_line"
      ]
    }, 400);

  } catch (e: any) {
    console.error("Evolution connector error:", e);
    return ok({
      ok: false,
      statusCode: 500,
      error: String(e),
      timestamp: new Date().toISOString(),
      action: body.action || "unknown"
    }, 500);
  }
});