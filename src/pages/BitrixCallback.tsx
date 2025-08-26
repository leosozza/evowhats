
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

      console.log("[BitrixCallback] Processing callback:", { code: !!code, state, domain, stored });

      let ok = false;
      let reason = "";

      try {
        if (!code) {
          reason = "missing_code";
        } else if (!state || state !== stored) {
          reason = "invalid_state";
        } else {
          console.log("[BitrixCallback] Calling oauth exchange...");
          
          const { data, error } = await supabase.functions.invoke("bitrix-oauth-exchange", {
            body: { code, state, domain },
          });
          
          console.log("[BitrixCallback] Exchange result:", { data, error });
          
          if (error) {
            reason = error.message || "exchange_failed";
          } else if (!data?.ok) {
            reason = data?.error || "exchange_not_ok";
          } else {
            ok = true;
            console.log("[BitrixCallback] OAuth exchange successful");
          }
        }
      } catch (e: any) {
        console.error("[BitrixCallback] Error:", e);
        reason = e?.message || "unknown_error";
      } finally {
        // Clean up state
        localStorage.removeItem("bx_oauth_state");
        
        console.log("[BitrixCallback] Sending result to opener:", { ok, reason });
        
        // Send result to opener
        window.opener?.postMessage(
          { source: "bitrix-oauth", ok, reason }, 
          window.location.origin
        );
        
        // Close popup
        try {
          window.close();
        } catch (e) {
          console.warn("[BitrixCallback] Could not close window:", e);
        }
      }
    })();
  }, []);

  return (
    <div className="flex items-center justify-center min-h-screen">
      <div className="text-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
        <p className="mt-4 text-muted-foreground">Processando autenticação Bitrix24...</p>
      </div>
    </div>
  );
}
