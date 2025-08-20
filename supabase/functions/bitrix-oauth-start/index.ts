
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

// URL da edge function callback (padrão)
const CALLBACK_URL = "https://twqcybbjyhcokcrdfgkk.functions.supabase.co/bitrix-oauth-callback";

// Escopos limitados - apenas os necessários para o conector
const SCOPES = "imopenlines,imconnector,im,user,event,event_bind,placement,crm";

const CLIENT_ID = Deno.env.get("BITRIX_CLIENT_ID") || "";
const CLIENT_SECRET = Deno.env.get("BITRIX_CLIENT_SECRET") || "";

// CORS restrito às origens autorizadas
const ALLOW_ORIGINS = new Set<string>([
  "https://bitrix-evolution-chat.lovable.app",
  "https://cc36407e-faf0-456e-8337-8cf59bc73db3.lovableproject.com",
]);

function cors(origin?: string) {
  const allowed = origin && ALLOW_ORIGINS.has(origin) ? origin : Array.from(ALLOW_ORIGINS)[0];
  return {
    "Access-Control-Allow-Origin": allowed,
    "Access-Control-Allow-Methods": "POST,OPTIONS",
    "Access-Control-Allow-Headers": "content-type,authorization",
    "Vary": "Origin",
  };
}

function normalizePortal(p: string) {
  return p.replace(/\/+$/, "");
}

serve(async (req) => {
  const origin = req.headers.get("origin") || undefined;

  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: cors(origin) });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Método não permitido. Use POST." }), {
      status: 405,
      headers: { ...cors(origin), "Content-Type": "application/json" },
    });
  }

  if (!CLIENT_ID || !CLIENT_SECRET) {
    return new Response(JSON.stringify({ 
      error: "Configuração incompleta: BITRIX_CLIENT_ID ou BITRIX_CLIENT_SECRET não configurados" 
    }), {
      status: 500,
      headers: { ...cors(origin), "Content-Type": "application/json" },
    });
  }

  const authHeader = req.headers.get("authorization");
  if (!authHeader) {
    return new Response(JSON.stringify({ error: "Token de autorização ausente" }), {
      status: 401,
      headers: { ...cors(origin), "Content-Type": "application/json" },
    });
  }

  const supabase = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
  });

  const { data: userData, error: userErr } = await supabase.auth.getUser();
  if (userErr || !userData?.user) {
    return new Response(JSON.stringify({ error: "Usuário não autenticado" }), {
      status: 401,
      headers: { ...cors(origin), "Content-Type": "application/json" },
    });
  }

  const userId = userData.user.id;

  const body = await req.json().catch(() => ({}));
  const portalUrl = (body.portal_url || body.portalUrl || "").toString().trim();
  if (!portalUrl) {
    return new Response(JSON.stringify({ error: "URL do portal Bitrix24 é obrigatória" }), {
      status: 400,
      headers: { ...cors(origin), "Content-Type": "application/json" },
    });
  }

  const portal = normalizePortal(portalUrl);

  // Validar se é uma URL válida do Bitrix24
  if (!portal.match(/^https?:\/\/.+\.bitrix24\.com(\.[a-z]{2,3})?$/i)) {
    return new Response(JSON.stringify({ 
      error: "URL inválida. Use o formato: https://seuportal.bitrix24.com.br" 
    }), {
      status: 400,
      headers: { ...cors(origin), "Content-Type": "application/json" },
    });
  }

  // Upsert das credenciais iniciais
  const payload = {
    user_id: userId,
    portal_url: portal,
    client_id: CLIENT_ID,
    client_secret: CLIENT_SECRET,
    is_active: true,
    updated_at: new Date().toISOString(),
  };

  const { error: upsertErr } = await supabase
    .from("bitrix_credentials")
    .upsert(payload, { onConflict: "user_id,portal_url" });

  if (upsertErr) {
    console.error("[bitrix-oauth-start] Upsert error:", upsertErr);
    return new Response(JSON.stringify({ error: "Falha ao salvar configuração inicial" }), {
      status: 500,
      headers: { ...cors(origin), "Content-Type": "application/json" },
    });
  }

  // Construir URL de autorização do portal Bitrix24
  const authUrl = new URL(`${portal}/oauth/authorize/`);
  authUrl.searchParams.set("client_id", CLIENT_ID);
  authUrl.searchParams.set("response_type", "code");
  authUrl.searchParams.set("redirect_uri", CALLBACK_URL);
  authUrl.searchParams.set("scope", SCOPES);
  authUrl.searchParams.set("state", userId);

  console.log("[bitrix-oauth-start] Generated auth URL:", {
    user: userId, 
    portal: portal, 
    scopes: SCOPES,
    callback: CALLBACK_URL
  });

  return new Response(JSON.stringify({ auth_url: authUrl.toString() }), {
    status: 200,
    headers: { ...cors(origin), "Content-Type": "application/json" },
  });
});
