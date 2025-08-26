
import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";

export default function BitrixCallback() {
  useEffect(() => {
    (async () => {
      const params = new URLSearchParams(window.location.search);
      const code = params.get("code");
      const state = params.get("state");
      const domain = params.get("domain"); // <- Bitrix manda isso no redirect
      const stored = localStorage.getItem("bx_oauth_state");

      let ok = false;
      let reason = "";

      try {
        if (!code || !state || state !== stored) {
          reason = "invalid_state";
        } else {
          const { data, error } = await supabase.functions.invoke("bitrix-oauth-exchange", {
            body: { code, state, domain },
          });
          if (error) {
            reason = error.message || "exchange_failed";
          } else if (!data?.ok) {
            reason = data?.error || "exchange_not_ok";
          } else {
            ok = true;
          }
        }
      } catch (e: any) {
        reason = e?.message || "unknown";
      } finally {
        // Limpar o state após uso
        localStorage.removeItem("bx_oauth_state");
        window.opener?.postMessage({ source: "bitrix-oauth", ok, reason }, window.location.origin);
        window.close();
      }
    })();
  }, []);

  return null;
}
