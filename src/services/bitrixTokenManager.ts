
import { supabase } from "@/integrations/supabase/client";

export interface TokenRefreshResult {
  success: boolean;
  error?: string;
  newExpiresAt?: string;
}

export async function refreshBitrixToken(userId: string, portalUrl: string): Promise<TokenRefreshResult> {
  try {
    // Get current credentials
    const { data: credentials, error: credError } = await supabase
      .from("bitrix_credentials")
      .select("*")
      .eq("user_id", userId)
      .eq("portal_url", portalUrl)
      .eq("is_active", true)
      .single();

    if (credError || !credentials) {
      return { success: false, error: "Credenciais não encontradas" };
    }

    if (!credentials.refresh_token) {
      return { success: false, error: "Refresh token não disponível" };
    }

    // Call refresh endpoint
    const response = await fetch(`${portalUrl}/oauth/token/`, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        grant_type: "refresh_token",
        client_id: credentials.client_id,
        client_secret: credentials.client_secret,
        refresh_token: credentials.refresh_token,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => "Unknown error");
      return { success: false, error: `HTTP ${response.status}: ${errorText}` };
    }

    const tokenData = await response.json();

    if (!tokenData.access_token) {
      return { success: false, error: "Novo access token não retornado" };
    }

    // Update credentials in database
    const expiresIn = Number(tokenData.expires_in ?? 3600);
    const newExpiresAt = new Date(Date.now() + expiresIn * 1000).toISOString();

    const { error: updateError } = await supabase
      .from("bitrix_credentials")
      .update({
        access_token: tokenData.access_token,
        refresh_token: tokenData.refresh_token || credentials.refresh_token,
        expires_at: newExpiresAt,
        updated_at: new Date().toISOString(),
      })
      .eq("user_id", userId)
      .eq("portal_url", portalUrl);

    if (updateError) {
      return { success: false, error: `Erro ao salvar token: ${updateError.message}` };
    }

    console.log("[bitrixTokenManager] Token refreshed successfully for:", portalUrl);
    
    return { 
      success: true, 
      newExpiresAt 
    };

  } catch (error: any) {
    console.error("[bitrixTokenManager] Token refresh error:", error);
    return { success: false, error: error.message || "Erro inesperado" };
  }
}

export async function checkAndRefreshToken(userId: string, portalUrl: string): Promise<TokenRefreshResult> {
  try {
    const { data: credentials, error } = await supabase
      .from("bitrix_credentials")
      .select("expires_at, refresh_token")
      .eq("user_id", userId)
      .eq("portal_url", portalUrl)
      .eq("is_active", true)
      .single();

    if (error || !credentials) {
      return { success: false, error: "Credenciais não encontradas" };
    }

    // Check if token expires in the next 5 minutes
    const now = new Date();
    const expiresAt = credentials.expires_at ? new Date(credentials.expires_at) : null;
    const fiveMinutesFromNow = new Date(now.getTime() + 5 * 60 * 1000);

    if (expiresAt && expiresAt <= fiveMinutesFromNow) {
      console.log("[bitrixTokenManager] Token expires soon, refreshing...");
      return await refreshBitrixToken(userId, portalUrl);
    }

    return { success: true };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}
