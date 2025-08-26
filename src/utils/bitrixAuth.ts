
// Utilidades para OAuth do Bitrix
declare const BX24: any;

export function getPortalFromIframe(): string | null {
  try {
    if (typeof BX24 !== "undefined") {
      // BX24.init deve ter sido chamado no bootstrap da página
      const domain = BX24.getDomain?.() || BX24.getSite?.();
      if (domain) return `https://${domain}`;
    }
    const r = document.referrer;
    if (r && r.includes("bitrix24")) {
      const u = new URL(r);
      return `${u.protocol}//${u.host}`;
    }
  } catch {}
  return null;
}

export function buildBitrixAuthUrl(opts: {
  clientId: string;
  redirectUri: string;
  scope: string;
  state: string;
}) {
  const q = new URLSearchParams({
    client_id: opts.clientId,
    response_type: "code",
    redirect_uri: opts.redirectUri,
    scope: opts.scope,
    state: opts.state,
  });
  // Bitrix cloud usa oauth.bitrix.info
  return `https://oauth.bitrix.info/oauth/authorize?${q.toString()}`;
}

export function openBitrixPopup(onDone: (result: { ok: boolean; reason?: string }) => void) {
  const state = crypto.randomUUID();
  localStorage.setItem("bx_oauth_state", state);
  
  const clientId = import.meta.env.VITE_BITRIX_CLIENT_ID as string;
  const redirectUri = `${window.location.origin}/bitrix/callback`;
  const scope = "imopenlines imconnector im placement crm user";
  const url = buildBitrixAuthUrl({ clientId, redirectUri, scope, state });

  console.log("[bitrixAuth] Opening popup with URL:", url);

  const w = window.open(url, "bx_oauth", "width=520,height=760");

  function onMsg(e: MessageEvent) {
    if (e.origin !== window.location.origin) return;
    if (e.data?.source === "bitrix-oauth") {
      console.log("[bitrixAuth] Received message from popup:", e.data);
      
      window.removeEventListener("message", onMsg);
      try { w?.close?.(); } catch {}
      
      onDone({ 
        ok: !!e.data.ok, 
        reason: e.data.reason 
      });
    }
  }
  
  window.addEventListener("message", onMsg);

  // Timeout fallback
  setTimeout(() => {
    if (!w?.closed) {
      window.removeEventListener("message", onMsg);
      try { w?.close?.(); } catch {}
      onDone({ ok: false, reason: "timeout" });
    }
  }, 120000); // 2 minutes
}
