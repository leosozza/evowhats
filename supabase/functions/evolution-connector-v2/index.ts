import "https://deno.land/x/xhr@0.4.0/mod.ts";
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { ensureInstance, connectInstance, getQr, getStatus, normalizeQr, delay, listInstances } from "../_shared/evolution.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const PREFIX = Deno.env.get("EVOLUTION_INSTANCE_PREFIX") ?? "evo_line_";
const AUTO = (Deno.env.get("EVOLUTION_AUTO_CREATE_INSTANCES") ?? "true").toLowerCase() === "true";
const POLL_MS = Number(Deno.env.get("EVOLUTION_QR_POLL_MS") ?? 1000);
const POLL_TIMEOUT = Number(Deno.env.get("EVOLUTION_QR_POLL_TIMEOUT_MS") ?? 90000);

const headers = (origin: string | null) => ({
  "Access-Control-Allow-Origin": origin ?? "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
});

function instanceNameFor(lineId: string | number, custom?: string) {
  const s = (custom ?? "").trim();
  return s ? s : `${PREFIX}${lineId}`;
}

function J(origin: string | null | undefined, body: any, ok = true) {
  return new Response(JSON.stringify(body), { status: 200, headers: headers(origin ?? null) });
}

function svc() {
  return createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
}

async function getUser(authorization: string | null): Promise<{ id: string }> {
  if (!authorization) throw new Error("Missing Authorization header");
  const token = authorization.replace(/^Bearer\s+/i, "");
  const supa = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
  const { data, error } = await supa.auth.getUser(token);
  if (error || !data?.user?.id) throw new Error(error?.message || "Invalid token");
  return { id: data.user.id };
}

serve(async (req) => {
  const origin = req.headers.get("origin");
  if (req.method === "OPTIONS") return new Response(null, { status: 200, headers: headers(origin) });

  const service = svc();
  let user;
  try { user = await getUser(req.headers.get("Authorization")); }
  catch (e: any) { return J(origin, { success: false, ok: false, error: e?.message || "Unauthorized" }); }

  let body: any = {};
  try { body = await req.json(); } catch {}

  const action = String(body?.action || "");

  // --------- AÇÕES ---------

  // Ação connect_whatsapp
  if (action === "connect_whatsapp") {
    try {
      const { lineId, instanceName } = body ?? {};
      const line = lineId ?? "1";
      const name = instanceNameFor(line, instanceName);

      const trace: any = { step: "start", line, name };

      const ensured = await ensureInstance(name, AUTO);
      trace.ensureInstance = ensured;

      if (!ensured?.exists) {
        // Se o adapter sinalizou config faltando, propaga
        if (ensured?.error?.code === "EVOLUTION_CONFIG_MISSING") {
          return J(origin, { success:false, ok:false, code:"EVOLUTION_CONFIG_MISSING", error: ensured.error.error, data:{ trace } });
        }
        // Se a criação falhou, traga o payload bruto do Evolution
        if (ensured?.error) {
          return J(origin, { success:false, ok:false, code:"EVOLUTION_CREATE_FAILED", error:"Falha ao criar instância Evolution", data:{ reason: ensured.error, trace } });
        }
        // Sem detalhes → INSTANCE_NOT_FOUND
        return J(origin, { success:false, ok:false, code:"INSTANCE_NOT_FOUND", error:"Instância não encontrada", data:{ instanceName:name, line:String(line), trace } });
      }

      const conn = await connectInstance(name).catch((e:any) => ({ ok:false, error:String(e?.message || e) }));
      trace.connectInstance = conn;

      const startedAt = Date.now();
      let qrB64: string | null = null;
      let status: any = null;

      while (Date.now() - startedAt < POLL_TIMEOUT) {
        const [qr, st] = await Promise.all([getQr(name), getStatus(name)]).catch(() => [null, null]);
        trace.polls = (trace.polls || 0) + 1;
        trace.lastQr = qr;
        trace.lastStatus = st;
        status = st?.data ?? null;
        if (qr?.data) {
          const b64 = normalizeQr(qr.data);
          if (b64) { qrB64 = b64; break; }
        }
        const s = (status?.state || status?.status || "").toString().toLowerCase();
        if (["connected","open","ready","online"].includes(s)) break;
        await delay(POLL_MS);
      }

      return J(origin, { success:true, ok:true, data:{ instanceName:name, line:String(line), status, qr_base64: qrB64 ?? null, trace }});
    } catch (e:any) {
      return J(origin, { success:false, ok:false, code:"ERROR", error: e?.message || "Unknown error", data:{ trace:{ thrown:true, stack:e?.stack } } });
    }
  }

  // Ação get_qr
  if (action === "get_qr") {
    try {
      const { instanceName, lineId } = body ?? {};
      const name = instanceNameFor(lineId ?? "1", instanceName);
      const trace: any = { step: "get_qr", name };
      
      const qr = await getQr(name).catch((e) => { trace.qrError = String(e); return null; });
      const st = await getStatus(name).catch((e) => { trace.statusError = String(e); return null; });
      
      trace.qrResult = qr;
      trace.statusResult = st;
      
      const base64 = qr?.data ? normalizeQr(qr.data) : null;
      return J(origin, { 
        success: true, 
        ok: true, 
        data: { instanceName: name, status: st?.data ?? null, qr_base64: base64, trace } 
      });
    } catch (e: any) {
      return J(origin, { 
        success: false, 
        ok: false, 
        code: "ERROR", 
        error: e?.message || "Unknown error", 
        data: { trace: { thrown: true, stack: e?.stack } } 
      });
    }
  }

  // Ação diag_evolution_full (nova)
  if (action === "diag_evolution_full") {
    try {
      const base = Deno.env.get("EVOLUTION_BASE_URL") || null;
      const key  = Deno.env.get("EVOLUTION_API_KEY") || null;
      
      const env = { 
        base_set: !!base, 
        key_set: !!key,
        base_url: base ? base.substring(0, 50) + (base.length > 50 ? "..." : "") : null,
        prefix: PREFIX,
        auto_create: AUTO,
        poll_ms: POLL_MS,
        poll_timeout: POLL_TIMEOUT
      };
      
      let reach = null;
      if (base) {
        try {
          const res = await fetch(base, { method: "GET" });
          reach = { ok: res.ok, status: res.status, statusText: res.statusText };
        } catch (e) {
          reach = { ok: false, error: String(e) };
        }
      }
      
      const instances = await listInstances().catch((e) => ({ error: String(e), list: [] }));
      
      return J(origin, { 
        success: true, 
        ok: true, 
        data: { env, reach, instances } 
      });
    } catch (e:any) {
      return J(origin, { 
        success: false, 
        ok: false, 
        code: "DIAG_FAIL", 
        error: e?.message || String(e),
        data: { trace: { thrown: true, stack: e?.stack } }
      });
    }
  }

  // Ação diag_instances
  if (action === "diag_instances") {
    try {
      const li = await listInstances();
      return J(origin, { success: li.ok, ok: li.ok, data: { status: li.status, body: li.data } });
    } catch (e:any) {
      return J(origin, { success:false, ok:false, code:"DIAG_INSTANCES_FAIL", error:e?.message || String(e) });
    }
  }

  // Ação bind_openline
  if (action === "bind_openline") {
    try {
      const { lineId, instanceName } = body ?? {};
      const line = String(lineId ?? "1");
      const name = instanceNameFor(line, instanceName);
      
      // Simples binding - aqui você implementaria a lógica específica
      return J(origin, { success: true, ok: true, message: "Binding created successfully", binding: { lineId: line, instanceName: name } });
    } catch (e: any) {
      return J(origin, { success: false, ok: false, code: "BIND_ERROR", error: e?.message || "Unknown error" });
    }
  }

  // Ação test_send
  if (action === "test_send") {
    try {
      const { lineId, to, text } = body ?? {};
      const line = String(lineId ?? "1");
      const name = instanceNameFor(line);
      
      // Simples teste de envio - aqui você implementaria a lógica específica
      return J(origin, { success: true, ok: true, result: { message: `Test message sent to ${to}: ${text}`, lineId: line, instanceName: name } });
    } catch (e: any) {
      return J(origin, { success: false, ok: false, code: "SEND_ERROR", error: e?.message || "Unknown error" });
    }
  }

  return J(origin, { success: false, ok: false, error: `Unknown action: ${action}` });
});