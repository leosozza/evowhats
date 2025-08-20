
/* Supabase Edge Function: bitrix-sync
   - Authenticated endpoint
   - Fetches CRM leads and upserts into bitrix_leads
*/
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const ANON_KEY = Deno.env.get("ANON_KEY") ?? Deno.env.get("SUPABASE_ANON_KEY")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

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

  // Fetch a first page of leads (you can expand later with full paging)
  const listUrl = `${cred.portal_url}/rest/crm.lead.list?auth=${encodeURIComponent(cred.access_token!)}`;
  const body = new URLSearchParams({
    select: ["ID","TITLE","NAME","LAST_NAME","STATUS_ID","SOURCE_ID","CREATED_BY_ID","ASSIGNED_BY_ID","DATE_CREATE","DATE_MODIFY","PHONE","EMAIL"].map((f)=>`select[]=${f}`).join("&"),
    // Bitrix expects specific format; simpler to request default set first:
  } as any);

  // Use GET with params for simplicity:
  const url = new URL(listUrl);
  // Basic select fields param format (Bitrix accepts multiple select[]=):
  ["ID","TITLE","NAME","LAST_NAME","STATUS_ID","SOURCE_ID","CREATED_BY_ID","ASSIGNED_BY_ID","DATE_CREATE","DATE_MODIFY"].forEach(f => url.searchParams.append("select[]", f));
  url.searchParams.append("start", "0");

  const resp = await fetch(url.toString());
  const json = await resp.json().catch(() => ({}));
  if (!resp.ok || json.error) {
    console.error("[bitrix-sync] list error:", json);
    return jsonResponse({ error: "Failed to fetch leads", details: json }, 500);
  }

  const results: any[] = Array.isArray(json.result) ? json.result : [];
  if (results.length === 0) return jsonResponse({ success: true, imported: 0 });

  // Upsert into bitrix_leads
  const rows = results.map((r) => ({
    user_id: userId,
    bitrix_lead_id: String(r.ID),
    title: r.TITLE ?? null,
    name: r.NAME ?? null,
    last_name: r.LAST_NAME ?? null,
    email: Array.isArray(r.EMAIL) ? (r.EMAIL[0]?.VALUE ?? null) : (r.EMAIL ?? null),
    phone: Array.isArray(r.PHONE) ? (r.PHONE[0]?.VALUE ?? null) : (r.PHONE ?? null),
    status_id: r.STATUS_ID ?? null,
    source_id: r.SOURCE_ID ?? null,
    created_by_id: r.CREATED_BY_ID ? String(r.CREATED_BY_ID) : null,
    assigned_by_id: r.ASSIGNED_BY_ID ? String(r.ASSIGNED_BY_ID) : null,
    date_create: r.DATE_CREATE ? new Date(r.DATE_CREATE).toISOString() : null,
    date_modify: r.DATE_MODIFY ? new Date(r.DATE_MODIFY).toISOString() : null,
    lead_data: r,
    updated_at: new Date().toISOString(),
  }));

  const { error: upErr } = await serviceClient
    .from("bitrix_leads")
    .upsert(rows, { onConflict: "user_id,bitrix_lead_id" });

  if (upErr) {
    console.error("[bitrix-sync] upsert error:", upErr);
    return jsonResponse({ error: "Failed to save leads" }, 500);
  }

  return jsonResponse({ success: true, imported: rows.length });
});
