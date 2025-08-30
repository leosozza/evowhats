
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const EVOLUTION_BASE_URL = Deno.env.get("EVOLUTION_BASE_URL")!; // ex: https://api.evolution-api.com
const EVOLUTION_API_KEY = Deno.env.get("EVOLUTION_API_KEY")!;

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
};

const evoUrl = (p: string) => `${EVOLUTION_BASE_URL.replace(/\/$/, "")}${p}`;
const instanceNameFor = (lineId: string) => `evo_line_${lineId}`;

function J(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { ...CORS, "Content-Type": "application/json" } });
}

async function evo(path: string, init?: RequestInit) {
  const res = await fetch(evoUrl(path), {
    ...init,
    headers: { "Content-Type": "application/json", apikey: EVOLUTION_API_KEY, ...(init?.headers || {}) },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(typeof data === "object" ? JSON.stringify(data) : String(data));
  return data;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
  const supa = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

  try {
    const body = await req.json().catch(() => ({}));
    const { action, lineId, instanceId, number, to, text } = body;

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
        await evo(`/instance/create`, { method: "POST", body: JSON.stringify({ instanceName: name, integration: "WHATSAPP_BAILEYS" }) });
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
      const body = { number: String(to), text: String(text ?? "Ping de teste") };
      try { await evo(`/message/sendText/${encodeURIComponent(name)}`, { method: "POST", body: JSON.stringify(body) }); }
      catch { await new Promise(r => setTimeout(r, 1000)); await evo(`/message/sendText/${encodeURIComponent(name)}`, { method: "POST", body: JSON.stringify(body) }); }
      return J({ ok: true, instanceName: name });
    }

    return J({ ok: false, error: "unknown_action" }, 400);
  } catch (e) {
    return J({ ok: false, error: String(e) }, 500);
  }
});
