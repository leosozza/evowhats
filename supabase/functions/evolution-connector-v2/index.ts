import "https://deno.land/x/xhr@0.4.0/mod.ts";
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
};

type EvoCfg = { baseUrl: string; apiKey: string };

function ok(data: any = {}) {
  return new Response(JSON.stringify({ ok: true, ...data }), { status: 200, headers: { ...CORS, "Content-Type": "application/json" }});
}
function ko(error: string, extra: any = {}) {
  return new Response(JSON.stringify({ ok: false, error, ...extra }), { status: 200, headers: { ...CORS, "Content-Type": "application/json" }});
}

function normalizeBase(u: string) {
  let s = String(u || "").trim();
  if (!s) return s;
  s = s.replace(/\/+$/, "");
  if (!/^https?:\/\//i.test(s)) s = `https://${s}`;
  return s;
}

async function getUser(authorization?: string | null) {
  if (!authorization) throw new Error("Missing Authorization header");
  const anon = createClient(SUPABASE_URL, ANON_KEY, { global: { headers: { Authorization: authorization } } });
  const { data, error } = await anon.auth.getUser();
  if (error || !data?.user) throw new Error("Unauthorized");
  return data.user;
}

function svc() {
  return createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
}

async function getEvoCfg(service: ReturnType<typeof svc>, userId: string): Promise<EvoCfg> {
  const { data, error } = await service
    .from("user_configurations")
    .select("evolution_base_url, evolution_api_key")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw new Error(`DB error (user_configurations): ${error.message}`);
  const base = normalizeBase(data?.evolution_base_url || "");
  const key  = String(data?.evolution_api_key || "");
  if (!base || !key) throw new Error("Evolution API não configurada");
  return { baseUrl: base, apiKey: key };
}

// ---- Evolutions calls (header padronizado: apikey) ----
async function evoFetch(cfg: EvoCfg, path: string, method = "GET", payload?: any, timeoutMs = 8000) {
  const url = `${cfg.baseUrl}${path.startsWith("/") ? "" : "/"}${path}`;
  const ctrl = new AbortController();
  const t  = setTimeout(() => ctrl.abort("timeout"), timeoutMs);
  try {
    const res = await fetch(url, {
      method,
      headers: {
        "Accept": "application/json",
        "Content-Type": payload ? "application/json" : "application/json",
        "apikey": cfg.apiKey, // 🔑 PADRÃO: Evolution usa header apikey
      },
      body: payload ? JSON.stringify(payload) : undefined,
      signal: ctrl.signal,
    });
    const ct = String(res.headers.get("content-type") || "");
    const body = ct.includes("application/json") ? await res.json().catch(()=> ({})) : await res.text().catch(()=> "");
    return { status: res.status, ok: res.ok, url, data: body };
  } catch (e) {
    const msg = String(e?.message || e);
    const code = msg.includes("timeout") ? "timeout" :
                 msg.includes("TLS") ? "tls" :
                 msg.includes("resolve") || msg.includes("dns") ? "dns" :
                 msg.includes("fetch") || msg.includes("network") ? "connect" : "network";
    return { status: 0, ok: false, url, error: msg, code };
  } finally {
    clearTimeout(t);
  }
}

// ---- DB helpers (compat wa_sessions) ----
async function upsertSessionForLine(service: ReturnType<typeof svc>, userId: string, lineId: string, instanceName: string, patch: any) {
  const { data: existing } = await service
    .from("wa_sessions").select("id").eq("user_id", userId).eq("bitrix_line_id", lineId).maybeSingle();

  const payload: any = {
    user_id: userId,
    bitrix_line_id: lineId,
    evo_instance_id: instanceName,
    updated_at: new Date().toISOString(),
    ...(patch.status ? { status: patch.status } : {}),
    ...(patch.qr_code !== undefined ? { qr_code: patch.qr_code } : {}),
    ...(patch.last_sync_at ? { last_sync_at: patch.last_sync_at } : {}),
  };

  if (existing?.id) {
    await service.from("wa_sessions").update(payload).eq("id", existing.id);
  } else {
    payload.created_at = new Date().toISOString();
    await service.from("wa_sessions").insert(payload);
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
  if (req.method !== "POST") return ko("Method not allowed");

  const service = svc();
  let user;
  try { user = await getUser(req.headers.get("Authorization")); }
  catch (e: any) { return ko(e?.message || "Unauthorized"); }

  let body: any = {};
  try { body = await req.json(); } catch {}

  const action = String(body?.action || "");

  // --------- AÇÕES ---------

  // 1) Diagnóstico (sempre 200)
  if (action === "diag") {
    const steps: any = {};
    try {
      const cfg = await getEvoCfg(service, user.id);
      steps.config = { ok: true, baseUrl: cfg.baseUrl };

      // Ping leve: tenta /status e fallback / (não falhar a function)
      let ping = await evoFetch(cfg, "/status", "GET");
      if (!ping.ok && ping.status === 404) ping = await evoFetch(cfg, "/", "GET");

      steps.ping = ping.ok
        ? { ok: true, status: ping.status }
        : { ok: false, status: ping.status || 0, reason: ping.code || "network", url: ping.url, error: ping.error };

      // Lista instâncias (se existir)
      const li = await evoFetch(cfg, "/instance/list", "GET");
      steps.fetchInstances = li.ok
        ? { ok: true, status: li.status, instanceCount: Array.isArray(li.data?.instances) ? li.data.instances.length : null }
        : { ok: false, status: li.status || 0, reason: li.code || "network", url: li.url, error: li.error };

      const healthy = !!(steps.config?.ok && steps.ping?.ok);
      return ok({ steps, ok: healthy });
    } catch (e: any) {
      steps.config = { ok: false, error: String(e?.message || e) };
      return ko("diag_failed", { steps });
    }
  }

  // 2) Proxy genérico (usado por EvolutionInstance manager)
  if (action === "proxy") {
    try {
      const cfg = await getEvoCfg(service, user.id);
      const path = String(body?.path || "/");
      const method = String(body?.method || "GET").toUpperCase();
      const payload = body?.payload ?? undefined;
      const r = await evoFetch(cfg, path, method, payload);
      if (r.ok) return ok({ data: r.data, status: r.status, url: r.url });
      return ko("proxy_failed", { status: r.status, reason: r.code || "network", url: r.url, detail: r.error || r.data });
    } catch (e: any) {
      return ko(String(e?.message || e));
    }
  }

  // 3) Garantir sessão por linha (cria/atualiza wa_sessions)
  if (action === "ensure_line_session") {
    try {
      const lineId = String(body?.lineId || body?.bitrix_line_id || "");
      if (!lineId) return ko("lineId required");
      const instanceName = `evo_line_${lineId}`;
      await upsertSessionForLine(service, user.id, lineId, instanceName, { status: "PENDING_QR" });
      return ok({ line: lineId, instance: instanceName });
    } catch (e: any) { return ko(String(e?.message || e)); }
  }

  // 4) Iniciar sessão (cria/conecta e tenta QR)
  if (action === "start_session_for_line") {
    try {
      const lineId = String(body?.lineId || body?.bitrix_line_id || "");
      if (!lineId) return ko("lineId required");
      const instanceName = `evo_line_${lineId}`;
      const cfg = await getEvoCfg(service, user.id);

      await evoFetch(cfg, "/instance/create", "POST", { instanceName, qrcode: true }).catch(()=>{});
      await evoFetch(cfg, `/instance/connect/${encodeURIComponent(instanceName)}`, "GET").catch(()=>{});

      await upsertSessionForLine(service, user.id, lineId, instanceName, { status: "CONNECTING" });
      const qr = await evoFetch(cfg, `/instance/qrcode/${encodeURIComponent(instanceName)}`, "GET").catch(()=>null);
      const base64 = qr?.ok ? (qr.data?.base64 || qr.data?.qrcode || null) : null;

      await upsertSessionForLine(service, user.id, lineId, instanceName, {
        status: base64 ? "PENDING_QR" : "CONNECTING",
        qr_code: base64 || null,
      });

      return ok({ line: lineId, base64 });
    } catch (e: any) { return ko(String(e?.message || e)); }
  }

  // 5) Status por linha
  if (action === "get_status_for_line") {
    try {
      const lineId = String(body?.lineId || "");
      if (!lineId) return ko("lineId required");
      const instanceName = `evo_line_${lineId}`;
      const cfg = await getEvoCfg(service, user.id);
      const r = await evoFetch(cfg, `/instance/status/${encodeURIComponent(instanceName)}`, "GET");
      const state = r?.data?.state || r?.data?.status || (r.ok ? "unknown" : "disconnected");
      return ok({ line: lineId, state, raw: r.data });
    } catch (e: any) { return ko(String(e?.message || e)); }
  }

  // 6) QR por linha
  if (action === "get_qr_for_line") {
    try {
      const lineId = String(body?.lineId || "");
      if (!lineId) return ko("lineId required");
      const instanceName = `evo_line_${lineId}`;
      const cfg = await getEvoCfg(service, user.id);
      const r = await evoFetch(cfg, `/instance/qrcode/${encodeURIComponent(instanceName)}`, "GET");
      const qr = r?.data?.base64 || r?.data?.qrcode || null;
      return ok({ line: lineId, qr_base64: qr });
    } catch (e: any) { return ko(String(e?.message || e)); }
  }

  // 7) Envio de teste
  if (action === "test_send") {
    try {
      const lineId = String(body?.lineId || "");
      const to = String(body?.to || "");
      const text = String(body?.text || "ping");
      if (!lineId || !to) return ko("lineId and to required");
      const instance = `evo_line_${lineId}`;
      const cfg = await getEvoCfg(service, user.id);
      const r = await evoFetch(cfg, "/message/send", "POST", { instance, number: to, text });
      return r.ok ? ok({ result: r.data }) : ko("send_failed", { status: r.status, detail: r.data || r.error });
    } catch (e: any) { return ko(String(e?.message || e)); }
  }

  return ko(`unknown_action: ${action}`);
});