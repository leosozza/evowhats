
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const CLIENT_ID = Deno.env.get("BITRIX_CLIENT_ID")!;
const CLIENT_SECRET = Deno.env.get("BITRIX_CLIENT_SECRET")!;
const REDIRECT_URI = Deno.env.get("BITRIX_REDIRECT_URI")!;

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });

  try {
    const body = await req.json();
    const code: string | undefined = body?.code;
    const cbDomain: string | undefined = body?.domain;

    console.log("[bitrix-oauth-exchange] Starting token exchange", {
      hasCode: !!code,
      hasDomain: !!cbDomain,
      redirectUri: REDIRECT_URI
    });

    if (!code) {
      return json({ ok: false, error: "missing_authorization_code" }, 400);
    }

    // Trocar código por tokens
    const tokenResponse = await fetch("https://oauth.bitrix.info/oauth/token/", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        client_id: CLIENT_ID,
        client_secret: CLIENT_SECRET,
        redirect_uri: REDIRECT_URI,
        code,
      }),
    });

    const tokenData = await tokenResponse.json();
    
    console.log("[bitrix-oauth-exchange] Token response", {
      ok: tokenResponse.ok,
      status: tokenResponse.status,
      hasAccessToken: !!tokenData.access_token,
      hasRefreshToken: !!tokenData.refresh_token,
      domain: tokenData.domain,
      clientEndpoint: tokenData.client_endpoint
    });

    if (!tokenResponse.ok) {
      return json({ ok: false, error: `token_exchange_failed: ${JSON.stringify(tokenData)}` }, 400);
    }

    if (!tokenData.access_token) {
      return json({ ok: false, error: "no_access_token_in_response" }, 400);
    }

    // Determinar portal_url
    let portal_url: string | null = null;
    try {
      if (tokenData.client_endpoint) {
        portal_url = new URL(tokenData.client_endpoint).origin;
      } else if (tokenData.domain) {
        portal_url = tokenData.domain.startsWith('http') ? tokenData.domain : `https://${tokenData.domain}`;
      } else if (cbDomain) {
        portal_url = cbDomain.startsWith('http') ? cbDomain : `https://${cbDomain}`;
      }
    } catch (error) {
      console.error("[bitrix-oauth-exchange] Error parsing portal URL:", error);
    }

    if (!portal_url) {
      return json({ ok: false, error: "could_not_determine_portal_url" }, 400);
    }

    console.log("[bitrix-oauth-exchange] Determined portal_url:", portal_url);

    // Calcular expiração
    const expiresIn = Number(tokenData.expires_in) || 3600;
    const expires_at = new Date(Date.now() + (expiresIn - 60) * 1000).toISOString();

    // Salvar no banco
    const supa = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
    
    const { error: upsertError } = await supa.from("bitrix_credentials").upsert({
      portal_url,
      access_token: tokenData.access_token,
      refresh_token: tokenData.refresh_token || '',
      expires_at,
      is_active: true,
      updated_at: new Date().toISOString(),
    }, { onConflict: "portal_url" });

    if (upsertError) {
      console.error("[bitrix-oauth-exchange] Database error:", upsertError);
      return json({ ok: false, error: `database_error: ${upsertError.message}` }, 500);
    }

    console.log("[bitrix-oauth-exchange] Tokens saved successfully");

    return json({ ok: true, portal_url });
  } catch (e) {
    console.error("[bitrix-oauth-exchange] Exception:", e);
    return json({ ok: false, error: `exception: ${String(e)}` }, 500);
  }
});

function json(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), { 
    status, 
    headers: { ...CORS, "Content-Type": "application/json" } 
  });
}
