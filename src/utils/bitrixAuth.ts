import { supabase } from "@/integrations/supabase/client";

export function getPortalFromIframe(): string | null {
  try {
    return localStorage.getItem('bitrix_portal_url');
  } catch {
    return null;
  }
}

export function openBitrixPopup(callback: (result: { ok: boolean; reason?: string }) => void) {
  const state = crypto.randomUUID();
  localStorage.setItem('bx_oauth_state', state);
  
  const portalUrl = getPortalFromIframe() || '';
  if (!portalUrl) {
    callback({ ok: false, reason: 'Portal URL não configurada' });
    return;
  }

  const domain = portalUrl.replace(/^https?:\/\//, '').replace(/\/$/, '');
  const redirectUri = `${window.location.origin}/bitrix/callback`;
  
  const authUrl = new URL('https://oauth.bitrix.info/oauth/authorize/');
  authUrl.searchParams.set('response_type', 'code');
  authUrl.searchParams.set('client_id', 'local.your_app_id'); // This should be configured
  authUrl.searchParams.set('redirect_uri', redirectUri);
  authUrl.searchParams.set('state', state);
  authUrl.searchParams.set('domain', domain);

  const popup = window.open(
    authUrl.toString(),
    'bitrix-oauth',
    'width=500,height=600,scrollbars=yes,resizable=yes'
  );

  const messageHandler = (event: MessageEvent) => {
    if (event.data?.source === 'bitrix-oauth') {
      window.removeEventListener('message', messageHandler);
      callback(event.data);
    }
  };

  window.addEventListener('message', messageHandler);

  // Check if popup was closed manually
  const checkClosed = setInterval(() => {
    if (popup?.closed) {
      clearInterval(checkClosed);
      window.removeEventListener('message', messageHandler);
      callback({ ok: false, reason: 'Popup fechado pelo usuário' });
    }
  }, 1000);
}