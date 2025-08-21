
import { useEffect, useCallback } from "react";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { checkAndRefreshToken } from "@/services/bitrixTokenManager";
import { getBitrixAuthStatus } from "@/services/bitrixAuthStatus";

export const useBitrixTokenRefresh = () => {
  const { toast } = useToast();

  const performTokenRefresh = useCallback(async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const authStatus = await getBitrixAuthStatus();
      if (!authStatus.isConnected || !authStatus.portalUrl) return;

      const result = await checkAndRefreshToken(user.id, authStatus.portalUrl);
      
      if (!result.success && result.error?.includes("expires")) {
        toast({
          title: "Token OAuth renovado",
          description: "A conexão com Bitrix24 foi atualizada automaticamente.",
        });
      } else if (!result.success) {
        console.error("[useBitrixTokenRefresh] Token refresh failed:", result.error);
        
        // Only show error toast for critical failures
        if (result.error?.includes("Refresh token não disponível")) {
          toast({
            title: "Reconexão necessária",
            description: "O token OAuth expirou. Reconecte-se ao Bitrix24.",
            variant: "destructive",
          });
        }
      }
    } catch (error) {
      console.error("[useBitrixTokenRefresh] Error:", error);
    }
  }, [toast]);

  useEffect(() => {
    // Check immediately
    performTokenRefresh();

    // Check every 5 minutes
    const interval = setInterval(performTokenRefresh, 5 * 60 * 1000);

    return () => clearInterval(interval);
  }, [performTokenRefresh]);

  return { performTokenRefresh };
};
