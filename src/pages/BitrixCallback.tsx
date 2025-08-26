
import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";

export default function BitrixCallback() {
  useEffect(() => {
    (async () => {
      const params = new URLSearchParams(window.location.search);
      const code = params.get("code");
      const state = params.get("state");
      const domain = params.get("domain");
      const stored = localStorage.getItem("bx_oauth_state");

      let ok = false;
      let reason = "";

      console.log("[BitrixCallback] Processing OAuth callback", {
        hasCode: !!code,
        hasState: !!state,
        hasDomain: !!domain,
        stateMatch: state === stored
      });

      try {
        if (!code) {
          reason = "missing_authorization_code";
        } else if (!state || state !== stored) {
          reason = "invalid_state_parameter";
        } else {
          console.log("[BitrixCallback] Calling bitrix-oauth-exchange...");
          
          const { data, error } = await supabase.functions.invoke("bitrix-oauth-exchange", {
            body: { code, state, domain },
          });

          console.log("[BitrixCallback] Exchange response:", { data, error });

          if (error) {
            reason = `exchange_error: ${error.message || 'Unknown error'}`;
          } else if (!data) {
            reason = "no_response_data";
          } else if (!data.ok) {
            reason = `exchange_failed: ${data.error || 'Unknown error'}`;
          } else {
            ok = true;
            console.log("[BitrixCallback] OAuth exchange successful:", data.portal_url);
          }
        }
      } catch (e: any) {
        console.error("[BitrixCallback] Exception during OAuth:", e);
        reason = `exception: ${e?.message || 'Unknown exception'}`;
      }

      try {
        // Limpar state após uso
        localStorage.removeItem("bx_oauth_state");
        
        // Enviar resultado para janela pai
        const message = { source: "bitrix-oauth", ok, reason };
        console.log("[BitrixCallback] Sending message to opener:", message);
        
        if (window.opener) {
          window.opener.postMessage(message, window.location.origin);
        } else {
          console.warn("[BitrixCallback] No opener window found");
        }
        
        // Fechar popup
        window.close();
      } catch (e) {
        console.error("[BitrixCallback] Error in cleanup:", e);
        // Tentar fechar mesmo assim
        try { window.close(); } catch {}
      }
    })();
  }, []);

  return (
    <div className="flex items-center justify-center min-h-screen">
      <div className="text-center space-y-4">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto"></div>
        <p className="text-sm text-muted-foreground">Processando autenticação...</p>
      </div>
    </div>
  );
}
