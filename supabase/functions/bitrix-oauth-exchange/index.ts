import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const BITRIX_APP_ID = Deno.env.get("BITRIX_APP_ID") || Deno.env.get("BITRIX_CLIENT_ID") || "";
const BITRIX_APP_SECRET = Deno.env.get("BITRIX_APP_SECRET") || Deno.env.get("BITRIX_CLIENT_SECRET") || "";
const REDIRECT_URL = Deno.env.get("BITRIX_REDIRECT_URL") || "";

const ALLOWED_ORIGINS = (Deno.env.get("ALLOWED_ORIGINS") || "").split(/[\s,]+/).filter(Boolean);

function cors(origin?: string | null) {
  const allowed = origin && (ALLOWED_ORIGINS.includes("*") || ALLOWED_ORIGINS.includes(origin)) ? origin : "";
  return {
    "Access-Control-Allow-Origin": allowed || ALLOWED_ORIGINS[0] || "",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-corr-id",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    Vary: "Origin",
  } as Record<string, string>;
}

function j(body: unknown, status = 200, origin?: string | null) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors(origin), "Content-Type": "application/json" },
  });
}

serve(async (req) => {
  const origin = req.headers.get("origin");
  const corr = req.headers.get("x-corr-id") || crypto.randomUUID();

  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors(origin) });
  if (req.method !== "POST") return j({ error: "method_not_allowed" }, 405, origin);

  if (!BITRIX_APP_ID || !BITRIX_APP_SECRET || !REDIRECT_URL) {
    return j({ error: "missing_backend_env", need: ["BITRIX_APP_ID","BITRIX_APP_SECRET","BITRIX_REDIRECT_URL"] }, 500, origin);
  }

  try {
    const body = await req.json().catch(() => ({}));
    const code = String(body.code || "").trim();
    const state = String(body.state || "").trim();
    const domain = String(body.domain || body.portal || "").trim();

    console.log(JSON.stringify({ category: "BITRIX_OAUTH", step: "exchange_start", corr, hasCode: !!code, hasState: !!state, domain }));

    if (!code) return j({ ok: false, error: "missing_authorization_code" }, 400, origin);

    const tokenRes = await fetch("https://oauth.bitrix.info/oauth/token/", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        client_id: BITRIX_APP_ID,
        client_secret: BITRIX_APP_SECRET,
        redirect_uri: REDIRECT_URL,
        code,
      }),
    });

    const tokenData = await tokenRes.json();
    console.log(JSON.stringify({ category: "BITRIX_OAUTH", step: "exchange_response", corr, status: tokenRes.status, ok: tokenRes.ok, hasAccess: !!tokenData.access_token }));

    if (!tokenRes.ok || !tokenData.access_token) {
      return j({ ok: false, error: "token_exchange_failed", details: tokenData }, 400, origin);
    }

    // Determine portal_url
    let portal_url: string | null = null;
    try {
      if (tokenData.client_endpoint) {
        portal_url = new URL(tokenData.client_endpoint).origin;
      } else if (tokenData.domain) {
        portal_url = tokenData.domain.startsWith("http") ? tokenData.domain : `https://${tokenData.domain}`;
      } else if (domain) {
        portal_url = domain.startsWith("http") ? domain : `https://${domain}`;
      }
    } catch (_) {}

    if (!portal_url) return j({ ok: false, error: "could_not_determine_portal_url" }, 400, origin);

    const member_id = tokenData.member_id || tokenData.installation_id || null;
    const scope = Array.isArray(tokenData.scope) ? tokenData.scope.join(",") : (tokenData.scope || null);
    const expires_in = Number(tokenData.expires_in || 3600);
    const expires_at = new Date(Date.now() + (expires_in - 60) * 1000).toISOString();

    const service = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

    // Try bitrix_tokens first
    const insertTokens = async () => {
      try {
        const { error } = await service.from("bitrix_tokens").upsert({
          tenant_id: state || null,
          member_id,
          portal_url,
          access_token: tokenData.access_token,
          refresh_token: tokenData.refresh_token || null,
          scope,
          expires_at,
          updated_at: new Date().toISOString(),
        }, { onConflict: "tenant_id" });
        if (error) throw error;
        return true;
      } catch (e) {
        console.log(JSON.stringify({ category: "BITRIX_OAUTH", step: "tokens_upsert_failed", corr, table: "bitrix_tokens", error: String(e) }));
        return false;
      }
    };

    const ensuredTokens = await insertTokens();

    // Fallback to legacy table
    if (!ensuredTokens) {
      await service.from("bitrix_credentials").upsert({
        user_id: state || null,
        portal_url,
        client_id: BITRIX_APP_ID,
        client_secret: BITRIX_APP_SECRET,
        access_token: tokenData.access_token,
        refresh_token: tokenData.refresh_token || null,
        expires_at,
        scope,
        is_active: true,
        updated_at: new Date().toISOString(),
      }, { onConflict: "user_id,portal_url" });
    }

    console.log(JSON.stringify({ category: "BITRIX_OAUTH", step: "exchange_done", corr, portal_url, member_id, usedTable: ensuredTokens ? "bitrix_tokens" : "bitrix_credentials" }));

    return j({ ok: true, portal_url, member_id }, 200, origin);
  } catch (e) {
    console.error("[bitrix-oauth-exchange] Exception:", e);
    return j({ ok: false, error: String(e) }, 500, origin);
  }
});