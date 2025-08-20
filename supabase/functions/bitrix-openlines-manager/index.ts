/* Supabase Edge Function: bitrix-openlines-manager
   - Gerencia o fluxo oficial de Open Channels do Bitrix24
   - Registra conectores REST, publica dados, adiciona tiles ao Contact Center
   - Cria e ativa linhas usando imconnector.* e imopenlines.*
*/
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

// CORS com domínios atualizados para o novo projeto
const ALLOW_ORIGINS = new Set<string>([
  "https://ca2ff569-eda4-4a88-8252-9cf6f165b5f7.lovableproject.com",
  "https://ca2ff569-eda4-4a88-8252-9cf6f165b5f7.sandbox.lovable.dev",
  "https://bitrix-evolution-chat.lovable.app",
  "https://cc36407e-faf0-456e-8337-8cf59bc73db3.lovableproject.com",
  "https://cc36407e-faf0-456e-8337-8cf59bc73db3.sandbox.lovable.dev",
]);

function cors(origin?: string) {
  const allowed = origin && ALLOW_ORIGINS.has(origin) ? origin : Array.from(ALLOW_ORIGINS)[0];
  return {
    "Access-Control-Allow-Origin": allowed,
    "Access-Control-Allow-Headers": "authorization,content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
    "Content-Type": "application/json",
  } as const;
}

function jsonResponse(body: unknown, status = 200, origin?: string) {
  return new Response(JSON.stringify(body), { status, headers: cors(origin) });
}

function optionsResponse(origin?: string) {
  return new Response(null, { status: 204, headers: cors(origin) });
}

async function getBitrixCredentials(supabase: any, userId: string) {
  const { data: creds, error } = await supabase
    .from("bitrix_credentials")
    .select("*")
    .eq("user_id", userId)
    .eq("is_active", true)
    .order("updated_at", { ascending: false })
    .limit(1);

  if (error || !creds || creds.length === 0) {
    throw new Error("Credenciais Bitrix24 não encontradas ou inativas");
  }

  const cred = creds[0];
  if (!cred.access_token) {
    throw new Error("Token de acesso não encontrado. Faça login novamente no Bitrix24");
  }

  // Check if token is about to expire (less than 5 minutes)
  if (cred.expires_at) {
    const expiresAt = new Date(cred.expires_at);
    const now = new Date();
    const minutesLeft = (expiresAt.getTime() - now.getTime()) / (1000 * 60);
    
    if (minutesLeft < 5) {
      console.warn("[bitrix-openlines-manager] Token expires in", minutesLeft, "minutes");
    }
  }

  return cred;
}

async function callBitrixAPI(portalUrl: string, method: string, accessToken: string, params: Record<string, any> = {}) {
  const url = `${portalUrl}/rest/${method}?auth=${accessToken}`;
  console.log("[bitrix-openlines-manager] Calling:", method, "params:", Object.keys(params));
  
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params),
  });

  if (!response.ok) {
    throw new Error(`Bitrix API error: ${response.status} ${response.statusText}`);
  }

  const data = await response.json();
  
  if (data.error) {
    throw new Error(`Bitrix API error: ${data.error_description || data.error}`);
  }

  return data;
}

serve(async (req: Request) => {
  const origin = req.headers.get("origin");
  
  if (req.method === "OPTIONS") {
    return optionsResponse(origin);
  }

  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405, origin);
  }

  try {
    const authHeader = req.headers.get("authorization");
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return jsonResponse({ error: "Missing or invalid authorization header" }, 401, origin);
    }

    const token = authHeader.replace("Bearer ", "");
    const supabase = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: `Bearer ${token}` } }
    });

    // Verificar usuário autenticado
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return jsonResponse({ error: "Unauthorized" }, 401, origin);
    }

    // Parse request body
    const { method, params = {} } = await req.json() as { method: string; params?: Record<string, any> };
    
    if (!method) {
      return jsonResponse({ error: "Method is required" }, 400, origin);
    }

    console.log("[bitrix-openlines-manager] Processing method:", method, "for user:", user.id);

    // Get Bitrix credentials
    const creds = await getBitrixCredentials(supabase, user.id);
    
    // Call Bitrix API
    const result = await callBitrixAPI(creds.portal_url, method, creds.access_token, params);
    
    // Log successful operation
    await supabase
      .from("bitrix_event_logs")
      .insert({
        user_id: user.id,
        portal_url: creds.portal_url,
        event_type: "api_call",
        event_data: {
          method,
          params,
          result: result.result || result,
          success: true
        },
        processed_at: new Date().toISOString()
      });

    return jsonResponse({ 
      result: result.result || result,
      success: true 
    }, 200, origin);

  } catch (error) {
    console.error("[bitrix-openlines-manager] Error:", error);
    
    // Try to log error if we have user context
    try {
      const authHeader = req.headers.get("authorization");
      if (authHeader) {
        const token = authHeader.replace("Bearer ", "");
        const supabase = createClient(SUPABASE_URL, ANON_KEY, {
          global: { headers: { Authorization: `Bearer ${token}` } }
        });
        
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          await supabase
            .from("bitrix_event_logs")
            .insert({
              user_id: user.id,
              portal_url: "unknown",
              event_type: "api_error",
              event_data: {
                error: error.message,
                success: false
              },
              processed_at: new Date().toISOString()
            });
        }
      }
    } catch (logError) {
      console.error("[bitrix-openlines-manager] Failed to log error:", logError);
    }

    return jsonResponse({
      error: error.message || "Internal server error",
      success: false
    }, 500, origin);
  }
});
