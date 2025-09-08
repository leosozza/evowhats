import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";

const BitrixCallback = () => {
  useEffect(() => {
    (async () => {
      const p = new URLSearchParams(window.location.search);
      const code = p.get("code");
      const state = p.get("state");
      const domain = p.get("domain");         // vem do Bitrix
      const stored = sessionStorage.getItem("bx_oauth_state");

      let payload = { ok: false, reason: "" as string };

      try {
        if (!code) { payload.reason = "missing_code"; }
        else if (!state || state !== stored) { payload.reason = "invalid_state"; }
        else {
          const { data, error } = await supabase.functions.invoke(
            "bitrix-oauth-exchange",
            {
              body: { code, state, domain },
              headers: { "Content-Type": "application/json" },
            }
          );
          if (error) payload.reason = error.message || "exchange_failed";
          else if (!data?.ok) payload.reason = data?.error || "exchange_failed";
          else payload.ok = true;
        }
      } catch (e: any) {
        payload.reason = e?.message || "unknown";
      } finally {
        window.opener?.postMessage({ source: "bitrix-oauth", ...payload }, window.location.origin);
        window.close();
      }
    })();
  }, []);

  return (
    <div className="flex items-center justify-center min-h-screen">
      <div className="text-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900 mx-auto"></div>
        <p className="mt-4">Processando autenticação...</p>
      </div>
    </div>
  );
};

export default BitrixCallback;