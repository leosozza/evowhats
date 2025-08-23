
/* Supabase Edge Function: bitrix-events-bind
   - Authenticated endpoint
   - Binds OpenLines and IM events to bitrix-events handler
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
  const { data: tokenRecord, error: tokenError } = await serviceClient
    .from("bitrix_tokens")
    .select("*")
    .eq("tenant_id", userId) // Assuming userId is tenantId for this context
    .limit(1)
    .maybeSingle();

  if (tokenError || !tokenRecord) {
    // Try to find by user relationship
    const { data: tenant, error: tenantError } = await serviceClient
      .from("tenants")
      .select("id")
      .limit(1)
      .maybeSingle();

    if (tenantError || !tenant) {
      throw new Error("No tenant found");
    }

    const { data: tokens, error: tokensError } = await serviceClient
      .from("bitrix_tokens")
      .select("*")
      .eq("tenant_id", tenant.id)
      .limit(1)
      .maybeSingle();

    if (tokensError || !tokens) {
      throw new Error("Credentials not found");
    }

    const cred = tokens;
    const { data: tenantData } = await serviceClient
      .from("tenants")
      .select("portal_url, client_id, client_secret")
      .eq("id", tenant.id)
      .single();

    if (!tenantData) throw new Error("Tenant data not found");

    const now = Date.now();
    const exp = cred.expires_at ? new Date(cred.expires_at).getTime() : 0;
    
    if (!cred.access_token || now > exp - 60_000) {
      if (!cred.refresh_token) throw new Error("Token expired and no refresh_token");

      const url = new URL(`${tenantData.portal_url}/oauth/token/`);
      url.searchParams.set("grant_type", "refresh_token");
      url.searchParams.set("client_id", tenantData.client_id);
      url.searchParams.set("client_secret", tenantData.client_secret);
      url.searchParams.set("refresh_token", cred.refresh_token);

      const resp = await fetch(url.toString());
      if (!resp.ok) throw new Error(`Refresh failed: ${resp.status} ${resp.statusText}`);
      const json = await resp.json();
      const access_token = json.access_token as string;
      const refresh_token = json.refresh_token as string | undefined;
      const expires_in = Number(json.expires_in ?? 3600);
      const expires_at = new Date(Date.now() + expires_in * 1000).toISOString();

      const { error: upErr } = await serviceClient
        .from("bitrix_tokens")
        .update({ access_token, refresh_token, expires_at, updated_at: new Date().toISOString() })
        .eq("id", cred.id);
      if (upErr) throw upErr;

      return { ...cred, access_token, portal_url: tenantData.portal_url };
    }
    return { ...cred, portal_url: tenantData.portal_url };
  }

  // Get tenant info for existing token
  const { data: tenantData } = await serviceClient
    .from("tenants")
    .select("portal_url, client_id, client_secret")
    .eq("id", tokenRecord.tenant_id)
    .single();

  if (!tenantData) throw new Error("Tenant data not found");

  const now = Date.now();
  const exp = tokenRecord.expires_at ? new Date(tokenRecord.expires_at).getTime() : 0;
  
  if (!tokenRecord.access_token || now > exp - 60_000) {
    if (!tokenRecord.refresh_token) throw new Error("Token expired and no refresh_token");

    const url = new URL(`${tenantData.portal_url}/oauth/token/`);
    url.searchParams.set("grant_type", "refresh_token");
    url.searchParams.set("client_id", tenantData.client_id);
    url.searchParams.set("client_secret", tenantData.client_secret);
    url.searchParams.set("refresh_token", tokenRecord.refresh_token);

    const resp = await fetch(url.toString());
    if (!resp.ok) throw new Error(`Refresh failed: ${resp.status} ${resp.statusText}`);
    const json = await resp.json();
    const access_token = json.access_token as string;
    const refresh_token = json.refresh_token as string | undefined;
    const expires_in = Number(json.expires_in ?? 3600);
    const expires_at = new Date(Date.now() + expires_in * 1000).toISOString();

    const { error: upErr } = await serviceClient
      .from("bitrix_tokens")
      .update({ access_token, refresh_token, expires_at, updated_at: new Date().toISOString() })
      .eq("id", tokenRecord.id);
    if (upErr) throw upErr;

    return { ...tokenRecord, access_token, portal_url: tenantData.portal_url };
  }
  
  return { ...tokenRecord, portal_url: tenantData.portal_url };
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
  
  try {
    const cred = await ensureValidAccessToken(serviceClient, userId);

    // Events to bind for complete WhatsApp integration
    const events = [
      "OnImMessageAdd",           // Message added to chat
      "OnImOpenLinesMessageAdd",  // Message added to Open Lines chat
      "OnImOpenLinesSessionStart", // Session started
      "OnImOpenLinesSessionClose", // Session closed
      "OnCrmLeadAdd",             // Lead created (for CRM integration)
      "OnCrmLeadUpdate",          // Lead updated
    ];

    const results = [];
    
    for (const ev of events) {
      try {
        const bindUrl = `${cred.portal_url}/rest/event.bind?auth=${encodeURIComponent(cred.access_token!)}`;
        const body = new URLSearchParams({ EVENT: ev, HANDLER: EVENTS_HANDLER });
        const resp = await fetch(bindUrl, { method: "POST", body });
        const json = await resp.json().catch(() => ({}));
        
        console.log("[bitrix-events-bind]", ev, json);
        results.push({ event: ev, success: !json.error, result: json });

        // Log success in webhook_logs
        await serviceClient.from("webhook_logs").insert({
          provider: "bitrix-bind",
          payload_json: { event: ev, result: json },
          received_at: new Date().toISOString(),
          valid_signature: true,
        });

      } catch (e) {
        console.error("[bitrix-events-bind] Error binding", ev, e);
        results.push({ event: ev, success: false, error: String(e) });
      }
    }

    const successCount = results.filter(r => r.success).length;
    const totalCount = results.length;

    return jsonResponse({ 
      success: true, 
      message: `Eventos vinculados: ${successCount}/${totalCount}`,
      results 
    });

  } catch (error: any) {
    console.error("[bitrix-events-bind] Error:", error);
    return jsonResponse({ error: error.message || "Internal error" }, 500);
  }
});
