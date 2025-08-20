
/* Supabase Edge Function: bitrix-events-bind
   - Authenticated endpoint
   - Binds onCrmLeadAdd and onCrmLeadUpdate to our bitrix-events handler
*/
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const PROJECT_ID = "twqcybbjyhcokcrdfgkk";
const EVENTS_HANDLER = `https://${PROJECT_ID}.functions.supabase.co/bitrix-events`;

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    },
  });
}

function optionsResponse() {
  return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
    },
  });
}

async function ensureValidAccessToken(serviceClient: ReturnType<typeof createClient>, userId: string) {
  const { data: cred, error } = await serviceClient
    .from("bitrix_credentials")
    .select("id, portal_url, client_id, client_secret, access_token, refresh_token, expires_at")
    .eq("user_id", userId)
    .eq("is_active", true)
    .maybeSingle();
  if (error || !cred) throw new Error("Credentials not found");

  const now = Date.now();
  const exp = cred.expires_at ? new Date(cred.expires_at).getTime() : 0;
  if (!cred.access_token || now > exp - 60_000) {
    if (!cred.refresh_token) throw new Error("Token expired and no refresh_token");

    const url = new URL("https://oauth.bitrix.info/oauth/token/");
    url.searchParams.set("grant_type", "refresh_token");
    url.searchParams.set("client_id", cred.client_id);
    url.searchParams.set("client_secret", cred.client_secret);
    url.searchParams.set("refresh_token", cred.refresh_token);

    const resp = await fetch(url.toString());
    if (!resp.ok) throw new Error(`Refresh failed: ${resp.status} ${resp.statusText}`);
    const json = await resp.json();
    const access_token = json.access_token as string;
    const refresh_token = json.refresh_token as string | undefined;
    const expires_in = Number(json.expires_in ?? 3600);
    const expires_at = new Date(Date.now() + expires_in * 1000).toISOString();

    const { error: upErr } = await serviceClient
      .from("bitrix_credentials")
      .update({ access_token, refresh_token, expires_at, updated_at: new Date().toISOString() })
      .eq("id", cred.id);
    if (upErr) throw upErr;

    return { ...cred, access_token };
  }
  return cred;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return optionsResponse();
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);

  const authHeader = req.headers.get("authorization");
  if (!authHeader) return jsonResponse({ error: "Missing Authorization header" }, 401);

  const anonClient = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: userData, error: userErr } = await anonClient.auth.getUser();
  if (userErr || !userData.user) return jsonResponse({ error: "Unauthorized" }, 401);
  const userId = userData.user.id;

  const serviceClient = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
  const cred = await ensureValidAccessToken(serviceClient, userId);

  // Bind events
  const events = ["onCrmLeadAdd", "onCrmLeadUpdate"];
  for (const ev of events) {
    const bindUrl = `${cred.portal_url}/rest/event.bind?auth=${encodeURIComponent(cred.access_token!)}`;
    const body = new URLSearchParams({ EVENT: ev, HANDLER: EVENTS_HANDLER });
    const resp = await fetch(bindUrl, { method: "POST", body });
    const json = await resp.json().catch(() => ({}));
    console.log("[bitrix-events-bind]", ev, json);
  }

  return jsonResponse({ success: true, message: "Eventos vinculados" });
});
