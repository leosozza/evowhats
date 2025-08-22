
// /supabase/functions/evolution-connector/index.ts
// Deno Edge Function (Supabase) — Proxy resiliente para Evolution API (v1/v2)

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

const EVOLUTION_BASE_URL = Deno.env.get("EVOLUTION_BASE_URL")!;
const EVOLUTION_API_KEY  = Deno.env.get("EVOLUTION_API_KEY")!;

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET,POST,PUT,PATCH,DELETE,OPTIONS",
};

function ok(data: any, status = 200) {
  return new Response(JSON.stringify({ ok: true, data }), { status, headers: { ...cors, "Content-Type": "application/json" } });
}
function ko(msg: string, status = 200, details?: any) {
  return new Response(JSON.stringify({ ok: false, error: msg, details }), { status, headers: { ...cors, "Content-Type": "application/json" } });
}

async function evoFetch(path: string, method: string, payload?: any) {
  const url = `${EVOLUTION_BASE_URL.replace(/\/$/, "")}${path}`;
  const headers: Record<string,string> = { "Content-Type": "application/json" };
  // Evolution aceita apikey por header "apikey" OU Authorization Bearer — deixe os dois por compat.
  headers["apikey"] = EVOLUTION_API_KEY;
  headers["Authorization"] = `Bearer ${EVOLUTION_API_KEY}`;

  console.log(`[evolution-connector] ${method} ${url}`);

  const res = await fetch(url, {
    method,
    headers,
    body: payload ? JSON.stringify(payload) : undefined,
  });
  const text = await res.text();
  let data: any = null;
  try { data = text ? JSON.parse(text) : null; } catch {}
  
  console.log(`[evolution-connector] Response ${res.status}:`, data);
  
  if (!res.ok) {
    return { ok: false, status: res.status, data };
  }
  return { ok: true, status: res.status, data };
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });

  try {
    const body = await req.json().catch(()=> ({}));
    const action = body?.action as string | undefined;

    console.log(`[evolution-connector] Action: ${action}`, body);

    if (!action || action === "proxy") {
      // fallback genérico
      const path   = body?.path as string;
      const method = (body?.method as string || "GET").toUpperCase();
      const resp = await evoFetch(path, method, body?.payload);
      if (resp.ok) return ok(resp.data, resp.status);
      return ko(`EVOLUTION_ERROR_${resp.status}`, 200, resp.data);
    }

    // Ações padrão (opcional — usa /action p/ facilitar frontend)
    if (action === "instance_create") {
      const name = body?.instanceName;
      const resp = await evoFetch("/instance/create", "POST", { instanceName: name, qrcode: true });
      return resp.ok ? ok(resp.data) : ko(`CREATE_FAIL_${resp.status}`, 200, resp.data);
    }

    if (action === "instance_connect") {
      const name = body?.instanceName;
      const resp = await evoFetch(`/instance/connect/${encodeURIComponent(name)}`, "GET");
      return resp.ok ? ok(resp.data) : ko(`CONNECT_FAIL_${resp.status}`, 200, resp.data);
    }

    if (action === "instance_fetch") {
      const name = body?.instanceName;
      const path = name ? `/instance/fetchInstances?instanceName=${encodeURIComponent(name)}` : "/instance/fetchInstances";
      const resp = await evoFetch(path, "GET");
      return resp.ok ? ok(resp.data) : ko(`FETCH_FAIL_${resp.status}`, 200, resp.data);
    }

    if (action === "instance_qr") {
      const name = body?.instanceName;
      const resp = await evoFetch(`/instance/qrcode/${encodeURIComponent(name)}`, "GET");
      return resp.ok ? ok(resp.data) : ko(`QR_FAIL_${resp.status}`, 200, resp.data); // v2 pode retornar 404 — o front deve depender do WS QRCODE_UPDATED
    }

    if (action === "send_text") {
      const name = body?.instanceName;
      const number = body?.number;
      const text   = body?.text;
      const resp = await evoFetch(`/message/sendText/${encodeURIComponent(name)}`, "POST", { number, text });
      return resp.ok ? ok(resp.data) : ko(`SEND_FAIL_${resp.status}`, 200, resp.data);
    }

    // Manter compatibilidade com ações antigas para não quebrar funcionalidade existente
    if (action === "ensure_line_session" || action === "start_session_for_line" || 
        action === "get_status_for_line" || action === "get_qr_for_line") {
      // Delegar para a implementação existente se necessário
      const lineId = body?.bitrix_line_id;
      if (!lineId) return ko("bitrix_line_id é obrigatório");
      
      const instanceName = `evo_line_${lineId}`;
      
      if (action === "ensure_line_session" || action === "start_session_for_line") {
        const resp = await evoFetch("/instance/create", "POST", { instanceName, qrcode: true });
        return resp.ok ? ok({ ...resp.data, instanceName }) : ko(`CREATE_FAIL_${resp.status}`, 200, resp.data);
      }
      
      if (action === "get_status_for_line") {
        const resp = await evoFetch(`/instance/fetchInstances?instanceName=${encodeURIComponent(instanceName)}`, "GET");
        return resp.ok ? ok(resp.data) : ko(`STATUS_FAIL_${resp.status}`, 200, resp.data);
      }
      
      if (action === "get_qr_for_line") {
        const resp = await evoFetch(`/instance/qrcode/${encodeURIComponent(instanceName)}`, "GET");
        return resp.ok ? ok(resp.data) : ko(`QR_FAIL_${resp.status}`, 200, resp.data);
      }
    }

    return ko("UNKNOWN_ACTION");
  } catch (e: any) {
    console.error("[evolution-connector] Error:", e);
    return ko(e?.message || "Internal error", 200);
  }
});
