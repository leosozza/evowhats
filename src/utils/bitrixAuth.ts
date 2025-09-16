declare const BX24: any;

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
  return `https://oauth.bitrix.info/oauth/authorize?${q.toString()}`;
}

export function guessRedirectUri() {
  // usa o domínio atual (funciona em preview e publicado)
  return `${window.location.origin}/bitrix/callback`;
}

export function getPortalFromIframe(): string | null {
  try {
    return localStorage.getItem('bitrix_portal_url');
  } catch {
    return null;
  }
}

import { ENV } from "@/config/env";

export function openBitrixPopup(onDone: (ok: boolean, reason?: string) => void) {
  const state = crypto.randomUUID();
  sessionStorage.setItem("bx_oauth_state", state);

  const clientId = ENV.BITRIX_CLIENT_ID || "";
  const redirectUri = guessRedirectUri();
  const scope = ENV.BITRIX_SCOPE;

  if (!clientId) {
    onDone(false, "BITRIX_CLIENT_ID não configurado");
    return;
  }

  const url = buildBitrixAuthUrl({ clientId, redirectUri, scope, state });
  const w = window.open(url, "bx_oauth", "width=520,height=760");

  const onMsg = (e: MessageEvent) => {
    if (e.origin !== window.location.origin) return;
    if (e.data?.source === "bitrix-oauth") {
      window.removeEventListener("message", onMsg);
      try { w?.close?.(); } catch {}
      onDone(Boolean(e.data?.ok), e.data?.reason);
    }
  };

  window.addEventListener("message", onMsg);
}