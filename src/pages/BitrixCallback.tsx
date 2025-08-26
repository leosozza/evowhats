
import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";

export default function BitrixCallback() {
  useEffect(() => {
    (async () => {
      const params = new URLSearchParams(window.location.search);
      const code = params.get("code");
      const state = params.get("state");
      const stored = localStorage.getItem("bx_oauth_state");  // <<-- Usando localStorage
      const payload = { ok: false, reason: "" };
      try {
        if (!code || !state || state !== stored) {
          payload.reason = "invalid_state";
        } else {
          const { error } = await supabase.functions.invoke("bitrix-oauth-exchange", {
            body: { code, state },
          });
          if (error) payload.reason = error.message || "exchange_failed";
          else payload.ok = true;
        }
      } catch (e: any) {
        payload.reason = e?.message || "unknown";
      } finally {
        // Limpar o state após uso
        localStorage.removeItem("bx_oauth_state");
        window.opener?.postMessage({ source: "bitrix-oauth", ...payload }, window.location.origin);
        window.close();
      }
    })();
  }, []);
  return null;
}
