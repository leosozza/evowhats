
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
    const cbDomain: string | undefined = body?.domain; // do callback ?domain=...

    if (!code) return json({ ok: false, error: "missing_code" }, 400);

    const res = await fetch("https://oauth.bitrix.info/oauth/token/", {
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

    const tok = await res.json();
    if (!res.ok) return json({ ok: false, error: tok }, 400);

    // Melhor fonte para descobrir o portal:
    // 1) tok.client_endpoint (ex.: https://xxx.bitrix24.com.br/rest/) -> origin
    // 2) tok.domain (fallback)
    // 3) cbDomain (fallback)
    let portal_url: string | null = null;
    try {
      if (tok.client_endpoint) {
        portal_url = new URL(tok.client_endpoint).origin;
      } else if (tok.domain) {
        portal_url = `https://${tok.domain}`;
      } else if (cbDomain) {
        portal_url = `https://${cbDomain}`;
      }
    } catch {
      // ignore
    }
    if (!portal_url) return json({ ok: false, error: "missing_portal_from_response" }, 400);

    const expires_at = new Date(Date.now() + (tok.expires_in - 60) * 1000).toISOString();

    const supa = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
    const { error } = await supa.from("bitrix_credentials").upsert({
      portal_url,
      access_token: tok.access_token,
      refresh_token: tok.refresh_token,
      expires_at,
      updated_at: new Date().toISOString(),
    }, { onConflict: "portal_url" });
    if (error) return json({ ok: false, error: String(error) }, 500);

    return json({ ok: true, portal_url });
  } catch (e) {
    return json({ ok: false, error: String(e) }, 500);
  }
});

function json(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), { status, headers: { ...CORS, "Content-Type": "application/json" } });
}
