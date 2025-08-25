
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const CLIENT_ID = Deno.env.get("BITRIX_CLIENT_ID")!;
const CLIENT_SECRET = Deno.env.get("BITRIX_CLIENT_SECRET")!;

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
    const supa = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
    
    // Get user from auth header
    const authHeader = req.headers.get('authorization');
    let userId = null;
    
    if (authHeader) {
      const token = authHeader.replace('Bearer ', '');
      const { data: { user } } = await supa.auth.getUser(token);
      userId = user?.id;
    }

    let query = supa.from("bitrix_credentials")
      .select("*")
      .eq("is_active", true)
      .order("updated_at", { ascending: false });
    
    if (userId) {
      query = query.eq("user_id", userId);
    }
    
    const { data, error } = await query.limit(1);
    
    if (error || !data?.length) {
      return new Response(JSON.stringify({ ok: false, error: "no token" }), { 
        status: 400, 
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }
    
    const t = data[0];
    const need = !t.expires_at || (new Date(t.expires_at).getTime() - Date.now() < 120 * 1000);
    
    if (!need) {
      return new Response(JSON.stringify({ ok: true, refreshed: false }), { 
        headers: { ...corsHeaders, "Content-Type": "application/json" } 
      });
    }

    const res = await fetch("https://oauth.bitrix.info/oauth/token/", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "refresh_token",
        client_id: CLIENT_ID,
        client_secret: CLIENT_SECRET,
        refresh_token: t.refresh_token,
      }),
    });
    
    const tok = await res.json();
    if (!res.ok) {
      return new Response(JSON.stringify({ ok: false, error: tok }), { 
        status: 400, 
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    const expires_at = new Date(Date.now() + (tok.expires_in - 60) * 1000).toISOString();
    const { error: upErr } = await supa.from("bitrix_credentials").update({
      access_token: tok.access_token,
      refresh_token: tok.refresh_token ?? t.refresh_token,
      expires_at,
      updated_at: new Date().toISOString(),
    }).eq("id", t.id);
    
    if (upErr) {
      return new Response(JSON.stringify({ ok: false, error: upErr }), { 
        status: 500, 
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    return new Response(JSON.stringify({ ok: true, refreshed: true }), { 
      headers: { ...corsHeaders, "Content-Type": "application/json" } 
    });
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: String(e) }), { 
      status: 500, 
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }
});
