
import { supabase } from "@/integrations/supabase/client";

export interface BitrixAuthStatus {
  isConnected: boolean;
  hasValidTokens: boolean;
  portalUrl?: string;
  expiresAt?: string;
  error?: string;
}

export async function getBitrixAuthStatus(): Promise<BitrixAuthStatus> {
  try {
    const { data: userData } = await supabase.auth.getUser();
    if (!userData.user) {
      return { isConnected: false, hasValidTokens: false, error: "User not authenticated" };
    }

    const { data: credentials, error } = await supabase
      .from("bitrix_credentials")
      .select("*")
      .eq("user_id", userData.user.id)
      .eq("is_active", true)
      .order("updated_at", { ascending: false })
      .limit(1);

    if (error) {
      console.error("[bitrixAuthStatus] Database error:", error);
      return { isConnected: false, hasValidTokens: false, error: error.message };
    }

    if (!credentials || credentials.length === 0) {
      return { isConnected: false, hasValidTokens: false, error: "No credentials found" };
    }

    const cred = credentials[0];
    
    if (!cred.access_token) {
      return { 
        isConnected: false, 
        hasValidTokens: false, 
        portalUrl: cred.portal_url,
        error: "No access token found" 
      };
    }

    // Check if token is expired
    const now = new Date();
    const expiresAt = cred.expires_at ? new Date(cred.expires_at) : null;
    
    if (expiresAt && now >= expiresAt) {
      return { 
        isConnected: true, 
        hasValidTokens: false, 
        portalUrl: cred.portal_url,
        expiresAt: cred.expires_at,
        error: "Token expired" 
      };
    }

    return { 
      isConnected: true, 
      hasValidTokens: true, 
      portalUrl: cred.portal_url,
      expiresAt: cred.expires_at 
    };

  } catch (error: any) {
    console.error("[bitrixAuthStatus] Error:", error);
    return { 
      isConnected: false, 
      hasValidTokens: false, 
      error: error.message || "Unknown error" 
    };
  }
}
