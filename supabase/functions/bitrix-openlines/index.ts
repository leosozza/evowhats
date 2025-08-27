
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
};

async function getBitrixTokens(supabase: any, userId: string) {
  const { data, error } = await supabase
    .from("bitrix_tokens")
    .select("*")
    .eq("user_id", userId)
    .single();

  if (error || !data) {
    throw new Error("Tokens do Bitrix não encontrados");
  }

  // Check if token needs refresh
  const now = new Date();
  const expiresAt = new Date(data.expires_at);
  
  if (now >= expiresAt) {
    // Refresh token
    const refreshResponse = await supabase.functions.invoke("bitrix-token-refresh", {
      body: { userId }
    });
    
    if (refreshResponse.error || !refreshResponse.data?.ok) {
      throw new Error("Falha ao renovar token do Bitrix");
    }
    
    // Get updated tokens
    const { data: updatedData } = await supabase
      .from("bitrix_tokens")
      .select("*")
      .eq("user_id", userId)
      .single();
    
    return updatedData;
  }

  return data;
}

async function callBitrixAPI(domain: string, accessToken: string, method: string, params: any = {}) {
  const url = `https://${domain}/rest/${method}`;
  
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      auth: accessToken,
      ...params
    })
  });

  const data = await response.json();
  
  if (!response.ok || data.error) {
    throw new Error(data.error_description || data.error || "Erro na API do Bitrix");
  }

  return data;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

  try {
    const { data: { user } } = await supabase.auth.getUser(
      req.headers.get("Authorization")?.replace("Bearer ", "") || ""
    );

    if (!user) {
      return new Response(
        JSON.stringify({ ok: false, error: "Não autorizado" }),
        { status: 401, headers: corsHeaders }
      );
    }

    const body = await req.json();
    const { action } = body;

    const tokens = await getBitrixTokens(supabase, user.id);

    if (action === "list_lines") {
      const result = await callBitrixAPI(
        tokens.domain,
        tokens.access_token,
        "imopenlines.config.list.get"
      );

      const lines = result.result || [];
      
      return new Response(
        JSON.stringify({ 
          ok: true, 
          lines: lines.map((line: any) => ({
            ID: line.ID,
            NAME: line.LINE_NAME || `Linha ${line.ID}`,
            ACTIVE: line.ACTIVE === "Y"
          }))
        }),
        { headers: corsHeaders }
      );
    }

    if (action === "send_message_to_line") {
      const { chatId, message, lineId } = body;
      
      if (!chatId || !message) {
        return new Response(
          JSON.stringify({ ok: false, error: "chatId e message são obrigatórios" }),
          { status: 400, headers: corsHeaders }
        );
      }

      const result = await callBitrixAPI(
        tokens.domain,
        tokens.access_token,
        "imopenlines.message.add",
        {
          CHAT_ID: chatId,
          MESSAGE: message,
          SYSTEM: "N"
        }
      );

      return new Response(
        JSON.stringify({ 
          ok: true, 
          messageId: result.result,
          data: result 
        }),
        { headers: corsHeaders }
      );
    }

    return new Response(
      JSON.stringify({ ok: false, error: "Ação não reconhecida" }),
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
