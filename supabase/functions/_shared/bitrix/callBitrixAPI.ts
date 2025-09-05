import "https://deno.land/x/xhr@0.4.0/mod.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const BITRIX_APP_ID = Deno.env.get("BITRIX_APP_ID") || Deno.env.get("BITRIX_CLIENT_ID") || "";
const BITRIX_APP_SECRET = Deno.env.get("BITRIX_APP_SECRET") || Deno.env.get("BITRIX_CLIENT_SECRET") || "";

let CURRENT_CORR_ID = "";
export function setCorrelationId(id: string) {
  CURRENT_CORR_ID = id || "";
}

function log(event: Record<string, unknown>) {
  try {
    console.log(JSON.stringify({ category: "BITRIX", correlation_id: CURRENT_CORR_ID || undefined, ...event }));
  } catch {
    // noop
  }
}

async function refreshTokenIfNeeded(supa: ReturnType<typeof createClient>, cred: any) {
  try {
    const nowSkew = (new Date(cred.expires_at).getTime() - Date.now()) / 1000;
    if (!cred.expires_at || nowSkew > 60) return cred; // still valid

    if (!BITRIX_APP_ID || !BITRIX_APP_SECRET) return cred; // cannot refresh without app creds

    const res = await fetch("https://oauth.bitrix.info/oauth/token/", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "refresh_token",
        client_id: BITRIX_APP_ID,
        client_secret: BITRIX_APP_SECRET,
        refresh_token: cred.refresh_token || "",
      }),
    });

    const tok = await res.json();
    if (!res.ok || !tok.access_token) {
      log({ level: "warn", action: "refresh_failed", status: res.status, tok });
      return cred;
    }

    const expires_at = new Date(Date.now() + (Number(tok.expires_in || 3600) - 60) * 1000).toISOString();
    const { data: updated, error } = await supa
      .from("bitrix_credentials")
      .update({
        access_token: tok.access_token,
        refresh_token: tok.refresh_token ?? cred.refresh_token,
        expires_at,
        updated_at: new Date().toISOString(),
      })
      .eq("id", cred.id)
      .select("*")
      .maybeSingle();

    if (error) {
      log({ level: "error", action: "refresh_update_error", error: error.message });
      return cred;
    }

    log({ level: "info", action: "token_refreshed" });
    return updated || cred;
  } catch (e) {
    log({ level: "error", action: "refresh_exception", error: String(e) });
    return cred;
  }
}

export async function callBitrixAPI(tenantId: string, method: string, params: Record<string, any> = {}): Promise<any> {
  const supa = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

  // Get latest active credentials for tenant (user_id)
  const { data: cred, error } = await supa
    .from("bitrix_credentials")
    .select("*")
    .eq("user_id", tenantId)
    .eq("is_active", true)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error || !cred) {
    log({ level: "error", action: "credentials_missing", tenantId });
    throw new Error("Credenciais Bitrix24 não encontradas para o tenant");
  }

  let creds = await refreshTokenIfNeeded(supa, cred);

  const portal = (creds.portal_url as string).replace(/\/$/, "");
  const url = `${portal}/rest/${method}.json`;

  // Attempt wrapper with one retry on 401/expired
  for (let attempt = 1; attempt <= 2; attempt++) {
    const callUrl = new URL(url);
    callUrl.searchParams.set("auth", creds.access_token);

    const resp = await fetch(callUrl.toString(), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(params || {}),
    });

    const text = await resp.text();
    let data: any = {};
    try { data = text ? JSON.parse(text) : {}; } catch { data = { raw: text }; }

    if (!resp.ok) {
      log({ level: "warn", action: "http_error", method, status: resp.status, attempt, body: data });
      if (resp.status === 401 && attempt === 1) {
        // refresh and retry
        creds = await refreshTokenIfNeeded(supa, creds);
        continue;
      }
      throw new Error(`HTTP ${resp.status}: ${text}`);
    }

    if (data?.error) {
      const err = String(data.error).toLowerCase();
      log({ level: "warn", action: "api_error", method, bitrix_error: data.error, attempt });
      if ((err.includes("expired") || err.includes("invalid")) && attempt === 1) {
        creds = await refreshTokenIfNeeded(supa, creds);
        continue;
      }
      throw new Error(data.error_description || data.error);
    }

    log({ level: "info", action: "api_ok", method, attempt });
    return data;
  }

  throw new Error("Falha ao chamar Bitrix API");
}
