
/* Supabase Edge Function: bitrix-openlines-webhook
   - Endpoint público para receber callbacks do Bitrix Open Channels (Inbox).
   - Faz parse de JSON ou form-urlencoded.
   - Associa o evento ao usuário a partir do portal_url (domain) usando bitrix_credentials.
   - Loga todos os eventos em bitrix_event_logs para auditoria/diagnóstico.
*/
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
  "Content-Type": "application/json",
} as const;

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: corsHeaders,
  });
}

function optionsResponse() {
  return new Response(null, {
    status: 204,
    headers: corsHeaders,
  });
}

// Parse keys like "auth[domain]" into nested objects { auth: { domain: "..." } }
function parseFormEncoded(params: URLSearchParams) {
  const result: Record<string, any> = {};

  const parseKey = (key: string) =>
    key
      .split("[")
      .map((k) => k.replace(/\]?$/, ""))
      .filter((k) => k.length > 0);

  const setNested = (obj: Record<string, any>, keys: string[], value: any) => {
    let current = obj;
    keys.forEach((k, idx) => {
      const isLast = idx === keys.length - 1;
      if (isLast) {
        current[k] = value;
      } else {
        if (typeof current[k] !== "object" || current[k] === null) {
          current[k] = {};
        }
        current = current[k];
      }
    });
  };

  for (const [key, value] of params.entries()) {
    const keys = parseKey(key);
    if (keys.length === 0) continue;
    setNested(result, keys, value);
  }

  return result;
}

async function parseIncomingBody(req: Request) {
  const contentType = req.headers.get("content-type")?.toLowerCase() || "";
  console.log("[openlines-webhook] Content-Type:", contentType);

  if (contentType.includes("application/json")) {
    try {
      const json = await req.json();
      return { payload: json, contentType };
    } catch (e) {
      console.error("[openlines-webhook] Failed to parse JSON body:", e);
      return { payload: null, contentType, error: "Invalid JSON" };
    }
  }

  if (contentType.includes("application/x-www-form-urlencoded")) {
    try {
      const text = await req.text();
      const params = new URLSearchParams(text);
      const formObject = parseFormEncoded(params);
      return { payload: formObject, contentType };
    } catch (e) {
      console.error("[openlines-webhook] Failed to parse form body:", e);
      return { payload: null, contentType, error: "Invalid form payload" };
    }
  }

  // Fallback: try JSON first, then form, then plain text wrapper
  try {
    const json = await req.json();
    return { payload: json, contentType };
  } catch {
    try {
      const text = await req.text();
      const params = new URLSearchParams(text);
      if ([...params.keys()].length > 0) {
        const formObject = parseFormEncoded(params);
        return { payload: formObject, contentType };
      }
      return { payload: { raw: text }, contentType };
    } catch (e) {
      console.error("[openlines-webhook] Failed to parse unknown body:", e);
      return { payload: null, contentType, error: "Unsupported body" };
    }
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") return optionsResponse();

  // Simple health check for configuration in Bitrix (some setups do a GET ping)
  if (req.method === "GET") {
    return jsonResponse({ ok: true, message: "Bitrix OpenLines webhook is up" });
  }

  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);

  const { payload, error: parseError } = await parseIncomingBody(req);
  if (!payload) {
    return jsonResponse({ error: parseError || "Invalid request body" }, 400);
  }

  // Try to extract domain from multiple possible places (JSON or form-encoded)
  const domain =
    payload?.auth?.domain ||
    payload?.auth?.server_domain ||
    payload?.domain ||
    payload?.["auth"]?.["server_domain"] ||
    payload?.["auth[domain]"] ||
    payload?.["auth[server_domain]"] ||
    "";

  const portalUrl = domain ? `https://${domain}` : null;
  console.log("[openlines-webhook] Extracted portalUrl:", portalUrl ?? "(none)");

  const serviceClient = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

  let userId: string | null = null;
  if (portalUrl) {
    const { data: creds, error: credErr } = await serviceClient
      .from("bitrix_credentials")
      .select("user_id")
      .eq("portal_url", portalUrl)
      .eq("is_active", true)
      .limit(1);

    if (credErr) {
      console.error("[openlines-webhook] bitrix_credentials query error:", credErr);
    }
    if (creds && creds.length > 0) userId = creds[0].user_id as string;
  }

  const eventType =
    payload?.event ||
    payload?.type ||
    payload?.command ||
    "openlines_event";

  const { error: insErr } = await serviceClient
    .from("bitrix_event_logs")
    .insert({
      user_id: userId ?? crypto.randomUUID(), // fallback para não bloquear o log
      event_type: eventType,
      event_data: payload,
      status: "pending",
    });

  if (insErr) {
    console.error("[openlines-webhook] insert error:", insErr);
    return jsonResponse({ error: "Failed to log event" }, 500);
  }

  // Retornar formato simples. Muitos conectores aceitam 200/OK com JSON.
  return jsonResponse({ ok: true });
});
