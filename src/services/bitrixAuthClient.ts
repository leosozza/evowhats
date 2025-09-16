import { supabase } from "@/integrations/supabase/client";

export async function exchangeBitrixCode({ 
  portalUrl, 
  code, 
  redirectUri 
}: {
  portalUrl: string;
  code: string;
  redirectUri: string;
}) {
  const { data, error } = await supabase.functions.invoke("bitrix-oauth-exchange", {
    body: { portalUrl, code, redirectUri },
  });
  
  if (error) throw new Error(error.message);
  if (!data?.success) throw new Error(data?.error || "OAUTH_EXCHANGE_FAILED");
  
  return data.data; // tokens do Bitrix
}

export async function refreshBitrixTokenViaEdge({
  portalUrl,
  refreshToken,
  clientId,
  clientSecret
}: {
  portalUrl: string;
  refreshToken: string;
  clientId: string;
  clientSecret: string;
}) {
  const { data, error } = await supabase.functions.invoke("bitrix-oauth-refresh", {
    body: { portalUrl, refreshToken, clientId, clientSecret },
  });
  
  if (error) throw new Error(error.message);
  if (!data?.success) throw new Error(data?.error || "TOKEN_REFRESH_FAILED");
  
  return data.data; // novos tokens
}