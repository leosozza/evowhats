
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
};

function J(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), { 
    status, 
    headers: { ...CORS, "Content-Type": "application/json" } 
  });
}

async function getBitrixToken(supa: any, userId?: string) {
  let query = supa.from("bitrix_credentials")
    .select("*")
    .eq("is_active", true)
    .order("updated_at", { ascending: false });
  
  if (userId) {
    query = query.eq("user_id", userId);
  }
  
  const { data, error } = await query.limit(1);
  
  if (error || !data?.length) {
    throw new Error("No Bitrix token found");
  }
  
  return data[0];
}

async function callBitrixAPI(domain: string, token: string, method: string, params: any = {}) {
  const url = `https://${domain}/rest/${method}/?auth=${token}`;
  
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params)
  });
  
  const data = await response.json();
  
  if (!response.ok) {
    throw new Error(`Bitrix API error: ${JSON.stringify(data)}`);
  }
  
  return data;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });

  try {
    const supa = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
    const body = await req.json().catch(() => ({}));
    const { action } = body;

    // Get user from auth header
    const authHeader = req.headers.get('authorization');
    let userId = null;
    
    if (authHeader) {
      const token = authHeader.replace('Bearer ', '');
      const { data: { user } } = await supa.auth.getUser(token);
      userId = user?.id;
    }

    const credentials = await getBitrixToken(supa, userId);
    
    if (action === "list_lines") {
      const result = await callBitrixAPI(
        credentials.domain, 
        credentials.access_token, 
        "imopenlines.config.list.get"
      );
      
      return J({ ok: true, lines: result.result || [] });
    }

    if (action === "get_line_info") {
      const { lineId } = body;
      if (!lineId) return J({ ok: false, error: "missing lineId" }, 400);
      
      const result = await callBitrixAPI(
        credentials.domain, 
        credentials.access_token, 
        "imopenlines.config.get", 
        { CONFIG_ID: lineId }
      );
      
      return J({ ok: true, line: result.result });
    }

    return J({ ok: false, error: "unknown_action" }, 400);
    
  } catch (e) {
    console.error("Bitrix openlines error:", e);
    return J({ ok: false, error: String(e) }, 500);
  }
});
