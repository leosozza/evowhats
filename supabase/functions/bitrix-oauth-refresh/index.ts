import "jsr:@supabase/functions-js/edge-runtime.d.ts";

Deno.serve(async (req) => {
  const origin = req.headers.get("origin") ?? "*";
  const headers = {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Content-Type": "application/json",
  };
  
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers });
  }

  try {
    const { portalUrl, refreshToken, clientId, clientSecret } = await req.json();
    
    if (!portalUrl || !refreshToken || !clientId || !clientSecret) {
      return new Response(JSON.stringify({ 
        success: false, 
        ok: false, 
        code: "INVALID_PAYLOAD",
        error: "Missing required parameters"
      }), { status: 200, headers });
    }

    const body = new URLSearchParams({
      grant_type: "refresh_token",
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
    });

    const resp = await fetch(`${portalUrl.replace(/\/$/, "")}/oauth/token/`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
    });
    
    const json = await resp.json().catch(() => ({}));

    if (!resp.ok || json.error) {
      return new Response(JSON.stringify({ 
        success: false, 
        ok: false, 
        code: "TOKEN_REFRESH_FAILED", 
        error: json.error || `HTTP ${resp.status}`, 
        data: json 
      }), { status: 200, headers });
    }

    return new Response(JSON.stringify({ 
      success: true, 
      ok: true, 
      data: json 
    }), { status: 200, headers });
    
  } catch (e: any) {
    return new Response(JSON.stringify({ 
      success: false, 
      ok: false, 
      code: "REFRESH_ERROR", 
      error: e?.message || String(e) 
    }), { status: 200, headers });
  }
});