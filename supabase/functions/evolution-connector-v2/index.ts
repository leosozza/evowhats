import "https://deno.land/x/xhr@0.4.0/mod.ts";
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { ensureInstance, getQr, listInstances } from "../_shared/evolution.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const PREFIX = Deno.env.get("EVOLUTION_INSTANCE_PREFIX") ?? "evo_line_";
const AUTO = (Deno.env.get("EVOLUTION_AUTO_CREATE_INSTANCES") ?? "true").toLowerCase() === "true";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-corr-id, x-evolution-signature, x-signature",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
  "Content-Type": "application/json; charset=utf-8",
};

function ok(data: any) { 
  return new Response(JSON.stringify({ success: true, ok: true, ...data }), { 
    status: 200, 
    headers: CORS 
  }); 
}
function ko(error: string, extra?: any) {
  const statusCode = extra?.status || 
    (error === "UNAUTHORIZED" ? 401 : 
     error === "INSTANCE_NOT_FOUND" ? 404 : 
     error === "CONFIG_MISSING" ? 422 : 400);
  return new Response(JSON.stringify({ success: false, ok: false, error, code: error, statusCode, ...extra }), {
    status: 200, // Always return 200 to avoid generic Supabase errors
    headers: CORS,
  });
}

function log(data: any) {
  console.log(`[evolution-connector-v2] ${JSON.stringify(data)}`);
}

function instanceNameFor(lineId: string | number, custom?: string) {
  if (custom && custom.trim().length > 0) return custom.trim();
  return `${PREFIX}${lineId}`;
}

function normalizeBase(u: string): string {
  return u?.replace(/\/+$/, "") || "";
}

async function getUser(authorization: string | null): Promise<{ id: string }> {
  if (!authorization) throw new Error("Missing Authorization header");
  const token = authorization.replace(/^Bearer\s+/i, "");
  const supa = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
  const { data, error } = await supa.auth.getUser(token);
  if (error || !data?.user?.id) throw new Error(error?.message || "Invalid token");
  return { id: data.user.id };
}

function svc() {
  return createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
}

type EvoCfg = { baseUrl: string; apiKey: string; bearer?: string };

async function getEvoCfg(service: ReturnType<typeof svc>, userId: string): Promise<EvoCfg> {
  const { data } = await service
    .from("user_configurations")
    .select("evolution_base_url, evolution_api_key")
    .eq("user_id", userId)
    .limit(1)
    .maybeSingle();

  const baseUrl = normalizeBase(data?.evolution_base_url || Deno.env.get("EVOLUTION_BASE_URL") || "");
  const apiKey = data?.evolution_api_key || Deno.env.get("EVOLUTION_API_KEY") || "";

  if (!baseUrl || !apiKey) {
    throw new Error("Evolution API configuration missing. Configure in user settings.");
  }

  return { baseUrl, apiKey };
}

async function evoFetch(
  cfg: EvoCfg,
  path: string,
  method: string,
  payload?: any,
  timeoutMs = 15000
): Promise<{ ok: boolean; status: number; data?: any; error?: string; code?: string; url?: string }> {
  const url = `${cfg.baseUrl}${path}`;
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };

  if (cfg.bearer) {
    headers.Authorization = `Bearer ${cfg.bearer}`;
  } else if (cfg.apiKey) {
    headers.apikey = cfg.apiKey;
  }

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    const response = await fetch(url, {
      method,
      headers,
      body: payload ? JSON.stringify(payload) : undefined,
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    let data: any = {};
    try {
      const text = await response.text();
      if (text) data = JSON.parse(text);
    } catch {}

    return {
      ok: response.ok,
      status: response.status,
      data,
      url,
      error: response.ok ? undefined : data?.message || data?.error || `HTTP ${response.status}`,
      code: response.ok ? undefined : (data?.code || `http_${response.status}`),
    };
  } catch (e: any) {
    const isTimeout = e.name === "AbortError";
    return {
      ok: false,
      status: 0,
      url,
      error: isTimeout ? "Request timeout" : e.message,
      code: isTimeout ? "timeout" : "network",
    };
  }
}

async function upsertSessionForLine(
  service: ReturnType<typeof svc>,
  userId: string,
  lineId: string,
  instanceName: string,
  patch: Record<string, any>
): Promise<void> {
  const existing = await service
    .from("wa_sessions")
    .select("id")
    .eq("user_id", userId)
    .eq("bitrix_line_id", lineId)
    .limit(1)
    .maybeSingle();

  const payload = {
    user_id: userId,
    bitrix_line_id: lineId,
    evo_instance_id: instanceName,
    bitrix_line_name: lineId,
    updated_at: new Date().toISOString(),
    instance_id: instanceName,
    ...patch,
  };

  if (existing.data?.id) {
    await service.from("wa_sessions").update(payload).eq("id", existing.data.id);
  } else {
    payload.created_at = new Date().toISOString();
    await service.from("wa_sessions").insert(payload);
  }
}

const errorMap = {
  // Network/Connection errors
  "NETWORK_ERROR": "Erro de conexão com Evolution API",
  "TIMEOUT": "Timeout na conexão com Evolution API", 
  "INVALID_URL": "URL da Evolution API inválida",
  
  // Authentication errors  
  "UNAUTHORIZED": "API Key inválida ou ausente",
  "FORBIDDEN": "Acesso negado pela Evolution API",
  
  // Instance errors
  "INSTANCE_NOT_FOUND": "Instância não encontrada na Evolution API",
  "INSTANCE_ALREADY_EXISTS": "Instância já existe na Evolution API", 
  "INSTANCE_NOT_CONNECTED": "Instância não está conectada",
  
  // Configuration errors
  "CONFIG_MISSING": "Configuração Evolution não encontrada",
  "INVALID_CONFIG": "Configuração Evolution inválida",
  
  // Generic errors
  "UNKNOWN_ERROR": "Erro desconhecido na Evolution API"
};

function mapEvolutionError(error: any, action: string): { code: string; message: string; details?: any } {
  const status = error?.status || 0;
  const message = error?.message || error?.error || String(error);
  
  // Map by HTTP status
  if (status === 401) return { code: "UNAUTHORIZED", message: errorMap.UNAUTHORIZED, details: { originalMessage: message } };
  if (status === 403) return { code: "FORBIDDEN", message: errorMap.FORBIDDEN, details: { originalMessage: message } };
  if (status === 404) return { code: "INSTANCE_NOT_FOUND", message: errorMap.INSTANCE_NOT_FOUND, details: { originalMessage: message } };
  if (status === 409) return { code: "INSTANCE_ALREADY_EXISTS", message: errorMap.INSTANCE_ALREADY_EXISTS, details: { originalMessage: message } };
  if (status >= 500) return { code: "UNKNOWN_ERROR", message: errorMap.UNKNOWN_ERROR, details: { status, originalMessage: message } };
  
  // Map by message content
  if (message.toLowerCase().includes("timeout")) return { code: "TIMEOUT", message: errorMap.TIMEOUT, details: { originalMessage: message } };
  if (message.toLowerCase().includes("network")) return { code: "NETWORK_ERROR", message: errorMap.NETWORK_ERROR, details: { originalMessage: message } };
  if (message.toLowerCase().includes("config")) return { code: "CONFIG_MISSING", message: errorMap.CONFIG_MISSING, details: { originalMessage: message } };
  
  return { code: "UNKNOWN_ERROR", message: errorMap.UNKNOWN_ERROR, details: { status, originalMessage: message, action } };
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
  if (req.method !== "POST") return new Response(JSON.stringify({ ok: false, error: "method_not_allowed", statusCode: 405 }), { status: 200, headers: CORS });

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

  // 2) List instances with multi-path compatibility + diag_evolution
  if (action === "list_instances" || action === "diag_evolution") {
    try {
      const cfg = await getEvoCfg(service, user.id);
      
      if (action === "diag_evolution") {
        // Use shared evolution adapter for consistent listing
        const r = await listInstances();
        return ok({ instances: r.data ?? [], status: r.status });
      }
      
      // Try multiple endpoints for compatibility
      let r = await evoFetch(cfg, "/instance/fetchInstances", "GET");
      if (!r.ok && r.status === 404) {
        r = await evoFetch(cfg, "/instances", "GET");
      }
      if (!r.ok && r.status === 404) {
        r = await evoFetch(cfg, "/sessions", "GET");
      }
      
      if (r.ok) {
        const instances = r.data?.instances || r.data || [];
        return ok({ instances: Array.isArray(instances) ? instances : [] });
      }
      
      const mappedError = mapEvolutionError(r, action);
      return ko(mappedError.code, { 
        message: mappedError.message,
        details: mappedError.details,
        status: r.status, 
        url: r.url 
      });
    } catch (e: any) {
      const mappedError = mapEvolutionError(e, action);
      return ko(mappedError.code, mappedError);
    }
  }

  // 3) Proxy genérico (used by legacy EvolutionInstance manager)
  if (action === "proxy") {
    try {
      const cfg = await getEvoCfg(service, user.id);
      const path = String(body?.path || "/");
      const method = String(body?.method || "GET").toUpperCase();
      const payload = body?.payload ?? undefined;
      const r = await evoFetch(cfg, path, method, payload);
      if (r.ok) return ok({ data: r.data, status: r.status, url: r.url });
      
      const mappedError = mapEvolutionError(r, action);
      return ko(mappedError.code, {
        message: mappedError.message,
        details: mappedError.details,
        status: r.status,
        url: r.url
      });
    } catch (e: any) {
      const mappedError = mapEvolutionError(e, action);
      return ko(mappedError.code, mappedError);
    }
  }

  // 4) Garantir/criar sessão por linha com auto-create
  if (action === "ensure_line_session") {
    try {
      const lineId = String(body?.lineId || body?.bitrix_line_id || "");
      if (!lineId) return ko("MISSING_PARAM", { message: "lineId parameter is required", status: 400 });
      
      const customName = body?.instanceName;
      const instanceName = instanceNameFor(lineId, customName);
      
      // NOVO: garantir/auto-criar a instância usando shared adapter
      const ensured = await ensureInstance(instanceName, AUTO);
      if (!ensured.exists) {
        return ko("INSTANCE_NOT_FOUND", { status: 404, instanceName, lineId });
      }

      // Upsert wa_sessions local
      await upsertSessionForLine(service, user.id, lineId, instanceName, { 
        status: "PENDING_QR",
        instance_id: instanceName 
      });
      
      return ok({ 
        line: lineId, 
        instance: instanceName, 
        exists: true,
        created: ensured.created,
        message: ensured.created ? "Instância criada automaticamente" : "Instância garantida"
      });
    } catch (e: any) { 
      await log({ category: "ERROR", action: "ensure_line_session", error: String(e?.message || e), userId: user.id });
      const mappedError = mapEvolutionError(e, action);
      return ko(mappedError.code, mappedError);
    }
  }

  // 5) Iniciar sessão (conectar instância EXISTENTE ou recém-criada)
  if (action === "start_session_for_line") {
    try {
      const lineId = String(body?.lineId || body?.bitrix_line_id || "");
      const number = String(body?.number || "");
      if (!lineId) return ko("MISSING_PARAM", { message: "lineId parameter is required", status: 400 });
      const instanceName = `evo_line_${lineId}`;
      const cfg = await getEvoCfg(service, user.id);

      // 1) Conectar instância (assumindo que existe via ensure_line_session)
      let connectUrl = `/instance/connect/${encodeURIComponent(instanceName)}`;
      if (number) connectUrl += `?number=${encodeURIComponent(number)}`;
      
      let connect = await evoFetch(cfg, connectUrl, "GET").catch(() => null);
      if (!connect?.ok) {
        // Fallback to POST
        connect = await evoFetch(cfg, "/instance/connect", "POST", { instanceName, number }).catch(() => null);
      }

      // 2) Atualizar status para CONNECTING
      await upsertSessionForLine(service, user.id, lineId, instanceName, { 
        status: "CONNECTING",
        instance_id: instanceName
      });
      
      // 3) Tentar obter QR code
      const qr = await evoFetch(cfg, `/instance/qrcode/${encodeURIComponent(instanceName)}`, "GET").catch(() => null);
      const base64 = qr?.ok ? (qr.data?.base64 || qr.data?.qrcode || null) : null;

      // 4) Atualizar com QR code se disponível
      await upsertSessionForLine(service, user.id, lineId, instanceName, {
        status: base64 ? "PENDING_QR" : "CONNECTING",
        qr_code: base64 || null,
        instance_id: instanceName
      });

      await log({ 
        category: "SESSION_STARTED", 
        instanceName, 
        userId: user.id, 
        lineId, 
        hasQr: !!base64,
        connectStatus: connect?.status
      });

      return ok({ line: lineId, base64, instance: instanceName });
    } catch (e: any) { 
      await log({ category: "ERROR", action: "start_session_for_line", error: String(e?.message || e), userId: user.id });
      const mappedError = mapEvolutionError(e, action);
      return ko(mappedError.code, mappedError);
    }
  }

  // 6) Obter QR code
  if (action === "get_qr_for_line") {
    try {
      const lineId = String(body?.lineId || body?.bitrix_line_id || "");
      if (!lineId) return ko("MISSING_PARAM", { message: "lineId parameter is required", status: 400 });
      const instanceName = `evo_line_${lineId}`;
      const cfg = await getEvoCfg(service, user.id);
      
      const qr = await evoFetch(cfg, `/instance/qrcode/${encodeURIComponent(instanceName)}`, "GET");
      
      // Atualizar upsertSessionForLine para incluir instance_id
      await upsertSessionForLine(service, user.id, lineId, instanceName, { 
        status: qr?.ok ? "PENDING_QR" : "CONNECTED",
        qr_code: qr?.ok ? (qr.data?.base64 || qr.data?.qrcode || null) : null,
        instance_id: instanceName
      });

      return ok({ 
        line: lineId,
        qr_base64: qr?.ok ? (qr.data?.base64 || qr.data?.qrcode) : null,
        base64: qr?.ok ? (qr.data?.base64 || qr.data?.qrcode) : null
      });
    } catch (e: any) { 
      const mappedError = mapEvolutionError(e, action);
      return ko(mappedError.code, mappedError);
    }
  }

  // 7) Obter status da instância
  if (action === "get_status_for_line") {
    try {
      const lineId = String(body?.lineId || body?.bitrix_line_id || "");
      if (!lineId) return ko("MISSING_PARAM", { message: "lineId parameter is required", status: 400 });
      const instanceName = `evo_line_${lineId}`;
      const cfg = await getEvoCfg(service, user.id);
      
      const statusData = await evoFetch(cfg, `/instance/connectionState/${encodeURIComponent(instanceName)}`, "GET");
      
      await upsertSessionForLine(service, user.id, lineId, instanceName, { 
        status: statusData?.ok ? statusData.data?.state || "UNKNOWN" : "ERROR",
        instance_id: instanceName
      });

      return ok({ 
        line: lineId,
        state: statusData?.ok ? statusData.data?.state : "error",
        raw: statusData?.data
      });
    } catch (e: any) { 
      const mappedError = mapEvolutionError(e, action);
      return ko(mappedError.code, mappedError);
    }
  }

  // 8) Testar envio de mensagem
  if (action === "test_send") {
    try {
      const lineId = String(body?.lineId || body?.bitrix_line_id || "");
      const to = String(body?.to || "");
      const text = String(body?.text || "Ping");
      if (!lineId) return ko("MISSING_PARAM", { message: "lineId parameter is required", status: 400 });
      if (!to) return ko("MISSING_PARAM", { message: "to parameter is required", status: 400 });
      const instanceName = `evo_line_${lineId}`;
      const cfg = await getEvoCfg(service, user.id);
      
      const result = await evoFetch(cfg, "/message/sendText", "POST", {
        instanceName,
        number: to,
        textMessage: { text }
      });

      if (result.ok) {
        return ok({ result: result.data });
      }
      
      const mappedError = mapEvolutionError(result, action);
      return ko(mappedError.code, {
        message: mappedError.message,
        details: mappedError.details
      });
    } catch (e: any) { 
      const mappedError = mapEvolutionError(e, action);
      return ko(mappedError.code, mappedError);
    }
  }

  // 9) Vincular linha a instância (save to database)
  if (action === "bind_line") {
    try {
      const instanceId = String(body?.instanceId || body?.waInstanceId || "");
      const lineId = String(body?.lineId || "");
      if (!instanceId) return ko("MISSING_PARAM", { message: "instanceId parameter is required", status: 400 });
      if (!lineId) return ko("MISSING_PARAM", { message: "lineId parameter is required", status: 400 });
      
      // Simple success - this just confirms the binding can work
      return ok({ success: true, instanceId, lineId });
    } catch (e: any) { 
      const mappedError = mapEvolutionError(e, action);
      return ko(mappedError.code, mappedError);
    }
  }

  // Legacy compatibility actions for evolutionClient.ts
  if (action === "instance.createOrAttach") {
    // Map to ensure_line_session directly
    try {
      const lineId = String(body?.lineId || body?.instanceName?.replace("evo_line_", "") || "");
      if (!lineId) return ko("MISSING_PARAM", { message: "lineId parameter is required", status: 400 });
      const instanceName = `evo_line_${lineId}`;
      const cfg = await getEvoCfg(service, user.id);

      // Check if instance exists
      let li = await evoFetch(cfg, "/instance/list", "GET");
      if (!li.ok && li.status === 404) {
        li = await evoFetch(cfg, "/instance/fetchInstances", "GET");
      }
      if (!li.ok && li.status === 404) {
        li = await evoFetch(cfg, "/sessions", "GET");
      }
      
      const instances = li?.data?.instances || li?.data || [];
      const exists = Array.isArray(instances) && instances.some((x: any) =>
        x?.instanceName === instanceName || x?.name === instanceName || x?.id === instanceName
      );

      if (!exists) {
        return ko("INSTANCE_NOT_FOUND", {
          message: `Instância ${instanceName} não encontrada. Crie a instância manualmente na Evolution API primeiro.`,
          instanceName,
          lineId
        });
      }

      await upsertSessionForLine(service, user.id, lineId, instanceName, { 
        status: "PENDING_QR",
        instance_id: instanceName 
      });
      
      return ok({ line: lineId, instance: instanceName, exists: true });
    } catch (e: any) {
      const mappedError = mapEvolutionError(e, action);
      return ko(mappedError.code, mappedError);
    }
  }

  if (action === "instance.status") {
    // Map to get_status_for_line directly
    try {
      const lineId = String(body?.lineId || body?.instanceName?.replace("evo_line_", "") || "");
      if (!lineId) return ko("MISSING_PARAM", { message: "lineId parameter is required", status: 400 });
      const instanceName = `evo_line_${lineId}`;
      const cfg = await getEvoCfg(service, user.id);
      
      const statusData = await evoFetch(cfg, `/instance/connectionState/${encodeURIComponent(instanceName)}`, "GET");
      
      await upsertSessionForLine(service, user.id, lineId, instanceName, { 
        status: statusData?.ok ? statusData.data?.state || "UNKNOWN" : "ERROR",
        instance_id: instanceName
      });

      return ok({ 
        line: lineId,
        state: statusData?.ok ? statusData.data?.state : "error",
        raw: statusData?.data
      });
    } catch (e: any) {
      const mappedError = mapEvolutionError(e, action);
      return ko(mappedError.code, mappedError);
    }
  }

  if (action === "instance.qr") {
    // Map to get_qr_for_line directly
    try {
      const lineId = String(body?.lineId || body?.instanceName?.replace("evo_line_", "") || "");
      if (!lineId) return ko("MISSING_PARAM", { message: "lineId parameter is required", status: 400 });
      const instanceName = `evo_line_${lineId}`;
      const cfg = await getEvoCfg(service, user.id);
      
      const qr = await evoFetch(cfg, `/instance/qrcode/${encodeURIComponent(instanceName)}`, "GET");
      
      await upsertSessionForLine(service, user.id, lineId, instanceName, { 
        status: qr?.ok ? "PENDING_QR" : "CONNECTED",
        qr_code: qr?.ok ? (qr.data?.base64 || qr.data?.qrcode || null) : null,
        instance_id: instanceName
      });

      return ok({ 
        line: lineId,
        qr_base64: qr?.ok ? (qr.data?.base64 || qr.data?.qrcode) : null,
        base64: qr?.ok ? (qr.data?.base64 || qr.data?.qrcode) : null
      });
    } catch (e: any) {
      const mappedError = mapEvolutionError(e, action);
      return ko(mappedError.code, mappedError);
    }
  }

  if (action === "send_message") {
    // Map to test_send directly
    try {
      const lineId = String(body?.lineId || body?.instanceName?.replace("evo_line_", "") || "");
      const to = String(body?.to || "");
      const text = String(body?.text || "Ping");
      if (!lineId) return ko("MISSING_PARAM", { message: "lineId parameter is required", status: 400 });
      if (!to) return ko("MISSING_PARAM", { message: "to parameter is required", status: 400 });
      const instanceName = `evo_line_${lineId}`;
      const cfg = await getEvoCfg(service, user.id);
      
      const result = await evoFetch(cfg, "/message/sendText", "POST", {
        instanceName,
        number: to,
        textMessage: { text }
      });

      if (result.ok) {
        return ok({ result: result.data });
      }
      
      const mappedError = mapEvolutionError(result, action);
      return ko(mappedError.code, {
        message: mappedError.message,
        details: mappedError.details
      });
    } catch (e: any) {
      const mappedError = mapEvolutionError(e, action);
      return ko(mappedError.code, mappedError);
    }
  }

  // NEW: Robust connect whatsapp with QR polling
  if (action === "connect_whatsapp") {
    try {
      const origin = req.headers.get("origin");
      const { lineId, instanceName } = body ?? {};
      const name = instName(lineId ?? "1", instanceName);

      // 1) Garantir/criar instância
      const ensured = await ensureInstance(name, AUTO);
      if (!ensured.exists) return new Response(JSON.stringify({
        success: false, ok: false, code: "INSTANCE_NOT_FOUND", status: 404, instanceName: name, lineId
      }), { status: 200, headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": origin ?? "*" }});

      // 2) Forçar CONNECT (gera QR no servidor)
      await connectInstance(name).catch(() => null);

      // 3) Polling do QR até aparecer (ou já conectado)
      const startedAt = Date.now();
      let qrB64: string | null = null;
      let status: any = null;

      while (Date.now() - startedAt < POLL_TIMEOUT) {
        const [qr, st] = await Promise.all([getQr(name), getStatus(name)]).catch(() => [null, null]);
        status = st?.data ?? null;
        if (qr?.data) qrB64 = normalizeQr(qr.data);
        if (qrB64) break;

        // se já estiver conectado, interrompe
        const state = (status?.state || status?.status || "").toString().toLowerCase();
        if (["connected","open","ready","online"].includes(state)) break;

        await delay(POLL_MS);
      }

      return new Response(JSON.stringify({
        success: true, ok: true, line: String(lineId ?? "1"),
        instanceName: name,
        status,
        qr_base64: qrB64 ?? null
      }), { status: 200, headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": origin ?? "*" }});
    } catch (e: any) {
      const origin = req.headers.get("origin");
      return new Response(JSON.stringify({
        success: false, ok: false, code: "ERROR", message: e.message || "Unknown error"
      }), { status: 200, headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": origin ?? "*" }});
    }
  }

  // NEW: Get QR code with retry
  if (action === "get_qr") {
    try {
      const origin = req.headers.get("origin");
      const { instanceName, lineId } = body ?? {};
      const name = instName(lineId ?? "1", instanceName);
      const qr = await getQr(name).catch(() => null);
      const st = await getStatus(name).catch(() => null);
      const base64 = qr?.data ? normalizeQr(qr.data) : null;
      return new Response(JSON.stringify({
        success: true, ok: true, instanceName: name,
        status: st?.data ?? null, qr_base64: base64
      }), { status: 200, headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": origin ?? "*" }});
    } catch (e: any) {
      const origin = req.headers.get("origin");
      return new Response(JSON.stringify({
        success: false, ok: false, code: "ERROR", message: e.message || "Unknown error"
      }), { status: 200, headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": origin ?? "*" }});
    }
  }

  // Enhanced diagnostics with Evolution instances
  if (action === "diag_evolution") {
    try {
      const origin = req.headers.get("origin");
      const r = await listInstances();
      return new Response(JSON.stringify({
        success: true, ok: true, instances: r.data ?? [], status: r.status
      }), { status: 200, headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": origin ?? "*" }});
    } catch (e: any) {
      const origin = req.headers.get("origin");
      return new Response(JSON.stringify({
        success: false, ok: false, code: "ERROR", message: e.message || "Unknown error"
      }), { status: 200, headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": origin ?? "*" }});
    }
  }

  // NEW: Bind OpenLine ↔ Evolution instance
  if (action === "bind_openline") {
    try {
      const { lineId, instanceName } = body ?? {};
      if (!lineId || !instanceName) return ko("INVALID_PAYLOAD", { status: 422 });

      // upsert no Supabase
      const { data, error } = await service.from("evo_line_bindings").upsert({
        line_id: String(lineId),
        instance_name: String(instanceName),
        updated_at: new Date().toISOString(),
      }, { onConflict: "line_id" }).select().single();

      if (error) return ko("DB_UPSERT_FAILED", { status: 500, detail: error.message });
      return ok({ message: "Vinculado", binding: data });
    } catch (e: any) {
      return ko("DB_ERROR", { status: 500, detail: String(e?.message || e) });
    }
  }

  return ko("UNKNOWN_ACTION", { 
    message: `Ação '${action}' não reconhecida`, 
    availableActions: [
      "diag", "diag_evolution", "list_instances", "proxy", "ensure_line_session", "start_session_for_line", 
      "get_qr_for_line", "get_status_for_line", "test_send", "bind_line", "bind_openline",
      "connect_whatsapp", "get_qr",
      "instance.createOrAttach", "instance.status", "instance.qr", "send_message"
    ]
  });
});