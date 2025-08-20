
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

async function exchangeToken(portal: string, code: string, redirectUri: string) {
  const clientId = Deno.env.get("BITRIX_CLIENT_ID") || "";
  const clientSecret = Deno.env.get("BITRIX_CLIENT_SECRET") || "";

  const body = new URLSearchParams({
    grant_type: "authorization_code",
    client_id: clientId,
    client_secret: clientSecret,
    code,
    redirect_uri: redirectUri,
  });

  console.log("[bitrix-oauth-callback] Exchanging token at:", `${portal}/oauth/token/`);

  const res = await fetch(`${portal.replace(/\/+$/, "")}/oauth/token/`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });

  if (!res.ok) {
    const errorText = await res.text().catch(() => "Unknown error");
    console.error("[bitrix-oauth-callback] Token exchange failed:", res.status, errorText);
    throw new Error(`Token HTTP ${res.status}: ${errorText}`);
  }
  
  const result = await res.json();
  console.log("[bitrix-oauth-callback] Token response received");
  return result;
}

serve(async (req) => {
  console.log(`[bitrix-oauth-callback] ${req.method} request received`);
  
  const u = new URL(req.url);
  const code = u.searchParams.get("code");
  const domain = u.searchParams.get("domain");
  const error = u.searchParams.get("error");
  const state = u.searchParams.get("state") || "";
  
  console.log("[bitrix-oauth-callback] Received params:", { 
    code: !!code, 
    domain, 
    state_present: !!state,
    error 
  });

  // Use window.location.origin equivalent for the callback URL
  const origin = u.origin;
  const frontendUrl = `${origin}/bitrix-callback`;
  const redirectUrl = new URL(frontendUrl);
  
  if (error) {
    console.error("[bitrix-oauth-callback] OAuth error:", error);
    redirectUrl.searchParams.set("error", error);
    return Response.redirect(redirectUrl.toString(), 302);
  }

  if (!code || !domain) {
    redirectUrl.searchParams.set("error", "Parâmetros inválidos (code/domain)");
    return Response.redirect(redirectUrl.toString(), 302);
  }

  // Normalizar portal URL
  const portal = domain.startsWith("http") ? domain : `https://${domain}`;
  
  // Use a URL correta para o redirect_uri que foi configurada no App Bitrix
  const callbackUri = u.origin + u.pathname; // Usar a URL atual como redirect_uri

  try {
    const tokenData = await exchangeToken(portal, code, callbackUri);

    if (!tokenData?.access_token) {
      redirectUrl.searchParams.set("error", "Token não retornado pelo Bitrix");
      return Response.redirect(redirectUrl.toString(), 302);
    }

    console.log("[bitrix-oauth-callback] Token exchange successful, access_token received");

    // Salvar tokens na tabela bitrix_credentials
    const serviceClient = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
    
    const access_token = tokenData.access_token as string;
    const refresh_token = tokenData.refresh_token as string | undefined;
    const expires_in = Number(tokenData.expires_in ?? 3600);
    const expires_at = new Date(Date.now() + expires_in * 1000).toISOString();
    const scope = typeof tokenData.scope === "string" ? tokenData.scope : 
                  Array.isArray(tokenData.scope) ? tokenData.scope.join(",") : null;
    const installation_id = (tokenData.member_id as string | undefined) ||
                           (tokenData.installation_id as string | undefined) || null;

    const userId = state && /^[0-9a-fA-F-]{36}$/.test(state) ? state : null;
    if (!userId) {
      console.warn("[bitrix-oauth-callback] Missing or invalid state (user_id)");
      redirectUrl.searchParams.set("error", "Estado de autenticação inválido");
      return Response.redirect(redirectUrl.toString(), 302);
    }

    const { error: upsertErr } = await serviceClient
      .from("bitrix_credentials")
      .upsert({
        user_id: userId,
        portal_url: portal,
        client_id: Deno.env.get("BITRIX_CLIENT_ID") || "",
        client_secret: Deno.env.get("BITRIX_CLIENT_SECRET") || "",
        access_token,
        refresh_token,
        expires_at,
        scope,
        installation_id,
        is_active: true,
        updated_at: new Date().toISOString(),
      }, { onConflict: "user_id,portal_url" });

    if (upsertErr) {
      console.error("[bitrix-oauth-callback] Database upsert error:", upsertErr);
      redirectUrl.searchParams.set("error", "Erro ao salvar credenciais no banco");
      return Response.redirect(redirectUrl.toString(), 302);
    }

    console.log("[bitrix-oauth-callback] Credentials saved successfully for user:", userId);

    // Redirecionar para o frontend com sucesso
    redirectUrl.searchParams.set("success", "true");
    return Response.redirect(redirectUrl.toString(), 302);
    
  } catch (e) {
    console.error("[bitrix-oauth-callback] Error:", e);
    redirectUrl.searchParams.set("error", `Erro ao trocar code por token: ${(e as Error).message}`);
    return Response.redirect(redirectUrl.toString(), 302);
  }
});
