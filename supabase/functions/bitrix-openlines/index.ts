
import "https://deno.land/x/xhr@0.4.0/mod.ts";
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
};

async function getBitrixTokens(service: any, portalUrl?: string) {
  const query = service.from("bitrix_credentials").select("*").eq("is_active", true);
  
  if (portalUrl) {
    query.eq("portal_url", portalUrl);
  }
  
  const { data, error } = await query.limit(1).maybeSingle();
  
  if (error || !data) {
    throw new Error("No active Bitrix credentials found");
  }
  
  return data;
}

async function refreshTokenIfNeeded(service: any, credentials: any) {
  const expiresAt = new Date(credentials.expires_at);
  const now = new Date();
  const buffer = 5 * 60 * 1000; // 5 minutes buffer
  
  if (expiresAt.getTime() - now.getTime() < buffer) {
    // Token needs refresh
    const refreshResult = await fetch("https://oauth.bitrix.info/oauth/token/", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "refresh_token",
        client_id: credentials.client_id,
        client_secret: credentials.client_secret,
        refresh_token: credentials.refresh_token,
      }),
    });
    
    if (refreshResult.ok) {
      const tokens = await refreshResult.json();
      const newExpiresAt = new Date(Date.now() + (tokens.expires_in - 60) * 1000).toISOString();
      
      await service.from("bitrix_credentials").update({
        access_token: tokens.access_token,
        refresh_token: tokens.refresh_token || credentials.refresh_token,
        expires_at: newExpiresAt,
        updated_at: new Date().toISOString()
      }).eq("id", credentials.id);
      
      return { ...credentials, access_token: tokens.access_token };
    }
  }
  
  return credentials;
}

async function callBitrixAPI(method: string, credentials: any, params: any = {}) {
  const url = `${credentials.portal_url}/rest/${method}`;
  const body = new URLSearchParams({
    auth: credentials.access_token,
    ...params
  });
  
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body
  });
  
  const data = await response.json();
  return { ok: response.ok, data };
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  if (req.method === "GET") {
    return new Response(
      JSON.stringify({ ok: true, message: "bitrix-openlines alive" }),
      { headers: corsHeaders }
    );
  }

  const service = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

  try {
    const body = await req.json();
    const { action } = body;

    if (action === "list_lines") {
      const credentials = await getBitrixTokens(service);
      const refreshedCredentials = await refreshTokenIfNeeded(service, credentials);
      
      const result = await callBitrixAPI("imopenlines.config.list.get", refreshedCredentials);
      
      if (result.ok && result.data?.result) {
        const lines = Object.values(result.data.result).map((line: any) => ({
          id: line.ID || line.id,
          name: line.LINE_NAME || line.name || `Line ${line.ID || line.id}`,
          active: line.ACTIVE === "Y" || line.active === true
        }));
        
        return new Response(
          JSON.stringify({ ok: true, lines }),
          { headers: corsHeaders }
        );
      }
      
      return new Response(
        JSON.stringify({ ok: false, error: "Failed to fetch lines" }),
        { status: 500, headers: corsHeaders }
      );
    }

    if (action === "send_message_to_line") {
      const { chatId, text, fileUrl } = body;
      
      const credentials = await getBitrixTokens(service);
      const refreshedCredentials = await refreshTokenIfNeeded(service, credentials);
      
      const params: any = {
        chat_id: chatId,
        message: text || ""
      };
      
      if (fileUrl) {
        params.file = fileUrl;
      }
      
      const result = await callBitrixAPI("imopenlines.message.add", refreshedCredentials, params);
      
      return new Response(
        JSON.stringify({ 
          ok: result.ok, 
          data: result.data,
          error: result.ok ? undefined : "Failed to send message"
        }),
        { headers: corsHeaders }
      );
    }

    return new Response(
      JSON.stringify({ ok: false, error: "Unknown action" }),
      { status: 400, headers: corsHeaders }
    );

  } catch (error: any) {
    console.error("[bitrix-openlines] Error:", error);
    return new Response(
      JSON.stringify({ ok: false, error: error.message }),
      { status: 500, headers: corsHeaders }
    );
  }
});
