
declare const BX24: any;

export interface PortalInfo {
  url: string;
  detected: boolean;
  source: 'iframe' | 'referrer' | 'manual';
}

export function getPortalFromIframe(): PortalInfo | null {
  try {
    // Tentar detectar via BX24 (quando app está no iFrame do Bitrix)
    if (typeof BX24 !== "undefined") {
      console.log("[PortalDetection] BX24 available, trying to get domain...");
      
      // Diferentes métodos dependendo da versão do BX24
      const domain = BX24.getDomain?.() || BX24.getSite?.() || BX24.getLang?.()?.DOMAIN;
      
      if (domain) {
        const portalUrl = domain.startsWith('http') ? domain : `https://${domain}`;
        console.log("[PortalDetection] Portal detected via BX24:", portalUrl);
        return {
          url: portalUrl,
          detected: true,
          source: 'iframe'
        };
      }
    }

    // Fallback via document.referrer (vem do portal quando aberto em nova aba)
    const referrer = document.referrer;
    if (referrer && referrer.includes("bitrix24")) {
      try {
        const referrerUrl = new URL(referrer);
        const portalUrl = `${referrerUrl.protocol}//${referrerUrl.host}`;
        console.log("[PortalDetection] Portal detected via referrer:", portalUrl);
        return {
          url: portalUrl,
          detected: true,
          source: 'referrer'
        };
      } catch (e) {
        console.warn("[PortalDetection] Invalid referrer URL:", referrer);
      }
    }

    // Tentar detectar via URL params (se passou como parâmetro)
    const urlParams = new URLSearchParams(window.location.search);
    const domainParam = urlParams.get('DOMAIN') || urlParams.get('domain');
    if (domainParam) {
      const portalUrl = domainParam.startsWith('http') ? domainParam : `https://${domainParam}`;
      console.log("[PortalDetection] Portal detected via URL param:", portalUrl);
      return {
        url: portalUrl,
        detected: true,
        source: 'referrer'
      };
    }

  } catch (error) {
    console.error("[PortalDetection] Error detecting portal:", error);
  }

  return null;
}

export function buildBitrixAuthUrl({
  portal,
  clientId,
  redirectUri,
  scope,
  state
}: {
  portal: string;
  clientId: string;
  redirectUri: string;
  scope: string;
  state: string;
}) {
  const params = new URLSearchParams({
    client_id: clientId,
    response_type: "code",
    redirect_uri: redirectUri,
    scope: scope || "imopenlines,imconnector,im,placement,crm,user",
    state
  });

  // Para portais cloud do Bitrix24, usar oauth.bitrix.info
  // Para portais on-premise, usar o próprio portal
  const authDomain = portal.includes('.bitrix24.') 
    ? 'https://oauth.bitrix.info' 
    : portal;
    
  const authUrl = `${authDomain}/oauth/authorize/?${params.toString()}`;
  
  console.log("[BitrixAuth] Generated auth URL:", {
    portal,
    authDomain,
    redirectUri,
    scope,
    state: state.substring(0, 8) + "..."
  });
  
  return authUrl;
}

export function initializeBX24(): Promise<boolean> {
  return new Promise((resolve) => {
    try {
      if (typeof BX24 !== "undefined") {
        if (BX24.init) {
          BX24.init(() => {
            console.log("[BX24] Initialized successfully");
            resolve(true);
          });
        } else {
          // BX24 já está disponível
          resolve(true);
        }
      } else {
        // Aguardar BX24 carregar (máximo 3 segundos)
        let attempts = 0;
        const checkBX24 = () => {
          attempts++;
          if (typeof BX24 !== "undefined") {
            console.log("[BX24] Found after", attempts, "attempts");
            if (BX24.init) {
              BX24.init(() => resolve(true));
            } else {
              resolve(true);
            }
          } else if (attempts < 30) { // 3 segundos / 100ms
            setTimeout(checkBX24, 100);
          } else {
            console.log("[BX24] Not found after 3 seconds, assuming standalone mode");
            resolve(false);
          }
        };
        checkBX24();
      }
    } catch (error) {
      console.error("[BX24] Initialization error:", error);
      resolve(false);
    }
  });
}
