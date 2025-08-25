
// Deno Edge Function: troca "code" por tokens e grava em bitrix_tokens (Service Role)
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const CLIENT_ID = Deno.env.get("BITRIX_CLIENT_ID")!;
const CLIENT_SECRET = Deno.env.get("BITRIX_CLIENT_SECRET")!;
const REDIRECT_URI = `${Deno.env.get("SUPABASE_URL")?.replace("supabase.co", "lovable.app") || ""}/bitrix/callback`;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { code } = await req.json();
    if (!code) return new Response("missing code", { status: 400 });

    const tokenRes = await fetch("https://oauth.bitrix.info/oauth/token/", {
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
    const tok = await tokenRes.json();
    if (!tokenRes.ok) return new Response(JSON.stringify(tok), { status: 400, headers: corsHeaders });

    // tok contém: access_token, refresh_token, expires_in, domain, member_id, scope, user_id, ...
    const portal_url = `https://${tok.domain}`;
    const expires_at = new Date(Date.now() + (tok.expires_in - 60) * 1000).toISOString();

    const supa = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
    
    // Get current user from auth header
    const authHeader = req.headers.get('authorization');
    let userId = null;
    
    if (authHeader) {
      const token = authHeader.replace('Bearer ', '');
      const { data: { user } } = await supa.auth.getUser(token);
      userId = user?.id;
    }

    if (!userId) {
      // Fallback - try to get from bitrix_credentials or create new entry
      const { data: existingCreds } = await supa
        .from("bitrix_credentials")
        .select("user_id")
        .eq("portal_url", portal_url)
        .limit(1)
        .maybeSingle();
      
      if (existingCreds) {
        userId = existingCreds.user_id;
      }
    }

    if (userId) {
      const { error } = await supa.from("bitrix_credentials").upsert({
        user_id: userId,
        portal_url,
        access_token: tok.access_token,
        refresh_token: tok.refresh_token,
        expires_at,
        client_id: CLIENT_ID,
        client_secret: CLIENT_SECRET,
        scope: tok.scope,
        updated_at: new Date().toISOString(),
      }, { onConflict: "user_id,portal_url" });
      
      if (error) throw error;
    }

    return new Response(JSON.stringify({ ok: true, portal_url }), { 
      headers: { ...corsHeaders, "Content-Type": "application/json" } 
    });
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: String(e) }), { 
      status: 500, 
      headers: { ...corsHeaders, "Content-Type": "application/json" } 
    });
  }
});
