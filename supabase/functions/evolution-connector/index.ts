
/*
  Supabase Edge Function: evolution-connector
  - Authenticated (verify_jwt = true in config.toml)
  - Proxies calls to Evolution API using user_configurations (per-user)
  - Manages instance lifecycle (createOrAttach, qr, status, logout)
  - Updates wa_sessions records (user-bound binding to Bitrix line)
  - Backward compatibility: support existing actions used by the frontend
    * ensure_line_session, start_session_for_line, get_status_for_line, get_qr_for_line
    * proxy, send_message
  Response shape: { ok: boolean, data?: any, error?: string }
*/

import "https://deno.land/x/xhr@0.4.0/mod.ts";
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
};

function ok(data: any, status = 200) {
  return new Response(JSON.stringify({ ok: true, data }), { status, headers: corsHeaders });
}
function ko(message: string, status = 400, details?: any) {
  return new Response(JSON.stringify({ ok: false, error: message, details }), { status, headers: corsHeaders });
}

async function getUser(authorization?: string | null) {
  if (!authorization) throw new Error("Missing Authorization header");
  const anon = createClient(SUPABASE_URL, ANON_KEY, { global: { headers: { Authorization: authorization } } });
  const { data, error } = await anon.auth.getUser();
  if (error || !data?.user) throw new Error("Unauthorized");
  return data.user;
}

async function getServiceClient() {
  return createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
}

async function getEvolutionConfig(service: ReturnType<typeof createClient>, userId: string) {
  const { data, error } = await service
    .from("user_configurations")
    .select("evolution_base_url, evolution_api_key")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw new Error(`DB error (user_configurations): ${error.message}`);
  const base = data?.evolution_base_url || "";
  const key = data?.evolution_api_key || "";
  if (!base || !key) throw new Error("Evolution API não configurada");
  return { baseUrl: String(base).replace(/\/+$/, ""), apiKey: String(key) };
}

async function evoFetch(
  cfg: { baseUrl: string; apiKey: string },
  path: string,
  method: string = "GET",
  payload?: any,
) {
  const url = `${cfg.baseUrl}${path}`;
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "Authorization": `Bearer ${cfg.apiKey}`,
  };
  const res = await fetch(url, {
    method,
    headers,
    body: method === "GET" ? undefined : JSON.stringify(payload ?? {}),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data?.message || data?.error || `Evolution API error ${res.status}`);
  }
  return data;
}

// Update/create wa_sessions for this user/line
async function upsertSessionForLine(
  service: ReturnType<typeof createClient>,
  userId: string,
  lineId: string,
  instanceName: string,
  patch: Partial<{ status: string; qr_code: string | null; last_sync_at: string }>,
) {
  // Try to find existing
  const { data: existing } = await service
    .from("wa_sessions")
    .select("id")
    .eq("user_id", userId)
    .eq("bitrix_line_id", lineId)
    .maybeSingle();

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
    const { error: upErr } = await service.from("wa_sessions").update(payload).eq("id", existing.id);
    if (upErr) throw upErr;
  } else {
    payload.created_at = new Date().toISOString();
    const { error: insErr } = await service.from("wa_sessions").insert(payload);
    if (insErr) throw insErr;
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders });
  if (req.method !== "POST") return ko("Method not allowed", 405);

  let user;
  const service = await getServiceClient();

  try {
    const authHeader = req.headers.get("authorization");
    user = await getUser(authHeader);

    const body = await req.json().catch(() => ({}));
    const action = body?.action as string;

    console.log("[evolution-connector] action:", action, "by user:", user.id);

    // Generic proxy to Evolution API (already used by frontend)
    if (action === "proxy") {
      const { path, method = "GET", payload } = body;
      const cfg = await getEvolutionConfig(service, user.id);
      const data = await evoFetch(cfg, path, method, payload);
      return ok(data);
    }

    // Create/attach instance (ensures it exists on provider side)
    if (action === "instance.createOrAttach") {
      const { instanceName, lineId } = body;
      if (!instanceName) return ko("instanceName is required");
      const cfg = await getEvolutionConfig(service, user.id);

      // Try create ensuring QR support enabled on provider (best-effort)
      await evoFetch(cfg, "/instance/create", "POST", { instanceName, qrcode: true }).catch((e) => {
        console.warn("create instance warning:", e?.message || e);
      });

      if (lineId) {
        await upsertSessionForLine(service, user.id, String(lineId), instanceName, { status: "PENDING_QR" });
      }
      return ok({ instanceName });
    }

    if (action === "instance.qr") {
      const { instanceName } = body;
      if (!instanceName) return ko("instanceName is required");
      const cfg = await getEvolutionConfig(service, user.id);

      // Attempt to connect to trigger QR on some providers
      await evoFetch(cfg, `/instance/connect/${encodeURIComponent(instanceName)}`, "GET").catch(() => {});

      const qr = await evoFetch(cfg, `/instance/qrcode/${encodeURIComponent(instanceName)}`, "GET").catch(() => ({}));
      const base64 = qr?.base64 || qr?.qrcode || null;
      return ok({ base64 });
    }

    if (action === "instance.status") {
      const { instanceName } = body;
      if (!instanceName) return ko("instanceName is required");
      const cfg = await getEvolutionConfig(service, user.id);
      const st = await evoFetch(cfg, `/instance/status/${encodeURIComponent(instanceName)}`, "GET").catch(() => ({}));
      // Normalize
      const sRaw = String(st?.state || st?.status || "").toLowerCase();
      const status =
        sRaw === "open" || sRaw === "connected"
          ? "active"
          : sRaw.includes("qr")
          ? "qr_required"
          : sRaw || "disconnected";
      return ok({ status, raw: st });
    }

    if (action === "instance.logout") {
      const { instanceName } = body;
      if (!instanceName) return ko("instanceName is required");
      const cfg = await getEvolutionConfig(service, user.id);
      const res = await evoFetch(cfg, `/instance/logout/${encodeURIComponent(instanceName)}`, "POST").catch(() => ({}));
      return ok({ result: res });
    }

    if (action === "send_message") {
      const { instance, number, text, fileUrl } = body;
      if (!instance || (!text && !fileUrl)) return ko("instance and text|fileUrl required");
      const cfg = await getEvolutionConfig(service, user.id);
      const res = await evoFetch(cfg, "/message/send", "POST", {
        instance,
        number,
        text,
        fileUrl,
      });
      return ok(res);
    }

    // Backward-compatible helpers used by the UI services
    if (action === "ensure_line_session") {
      const { bitrix_line_id, bitrix_line_name, instanceName } = body;
      const name = instanceName || `evo_line_${bitrix_line_id}`;
      // Ensure we have a session row linked to this line
      await upsertSessionForLine(service, user.id, String(bitrix_line_id), name, { status: "PENDING_QR" });
      return ok({ line: bitrix_line_id, instance: name });
    }

    if (action === "start_session_for_line") {
      const { bitrix_line_id, bitrix_line_name } = body;
      const instanceName = `evo_line_${bitrix_line_id}`;
      const cfg = await getEvolutionConfig(service, user.id);

      await evoFetch(cfg, "/instance/create", "POST", { instanceName, qrcode: true }).catch(() => {});
      await evoFetch(cfg, `/instance/connect/${encodeURIComponent(instanceName)}`, "GET").catch(() => {});

      await upsertSessionForLine(service, user.id, String(bitrix_line_id), instanceName, { status: "CONNECTING" });
      return ok({ line: bitrix_line_id, instance: instanceName });
    }

    if (action === "get_status_for_line") {
      const { bitrix_line_id } = body;
      const instanceName = `evo_line_${bitrix_line_id}`;
      const cfg = await getEvolutionConfig(service, user.id);
      const st = await evoFetch(cfg, `/instance/status/${encodeURIComponent(instanceName)}`, "GET").catch(() => ({}));
      const sRaw = String(st?.state || st?.status || "").toLowerCase();
      const status =
        sRaw === "open" || sRaw === "connected"
          ? "active"
          : sRaw.includes("qr")
          ? "qr_required"
          : sRaw || "disconnected";

      await upsertSessionForLine(service, user.id, String(bitrix_line_id), instanceName, {
        status: status.toUpperCase(),
        last_sync_at: new Date().toISOString(),
      });

      return ok({ line: bitrix_line_id, status, raw: st });
    }

    if (action === "get_qr_for_line") {
      const { bitrix_line_id } = body;
      const instanceName = `evo_line_${bitrix_line_id}`;
      const cfg = await getEvolutionConfig(service, user.id);

      await evoFetch(cfg, `/instance/connect/${encodeURIComponent(instanceName)}`, "GET").catch(() => {});
      const qr = await evoFetch(cfg, `/instance/qrcode/${encodeURIComponent(instanceName)}`, "GET").catch(() => ({}));
      const base64 = qr?.base64 || qr?.qrcode || null;

      await upsertSessionForLine(service, user.id, String(bitrix_line_id), instanceName, {
        status: base64 ? "PENDING_QR" : "CONNECTING",
        qr_code: base64 || null,
      });

      return ok({ line: bitrix_line_id, base64 });
    }

    return ko(`Unknown action: ${action}`, 404);
  } catch (e: any) {
    console.error("[evolution-connector] error:", e?.message || e);
    return ko(e?.message || "Internal error", 500);
  }
});
