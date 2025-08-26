
import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { getBitrixAuthStatus, type BitrixAuthStatus } from "@/services/bitrixAuthStatus";
import { CheckCircle, XCircle, Loader2, RefreshCw } from "lucide-react";
import { getPortalFromIframe, initializeBX24, type PortalInfo } from "@/utils/bitrixPortalDetection";
import { supabase } from "@/integrations/supabase/client";

const AutoConnectBitrix = () => {
  const [loading, setLoading] = useState(true);
  const [authStatus, setAuthStatus] = useState<BitrixAuthStatus | null>(null);
  const [detectedPortal, setDetectedPortal] = useState<PortalInfo | null>(null);
  const [autoConnecting, setAutoConnecting] = useState(false);
  const { toast } = useToast();

  const checkAuthStatus = async () => {
    try {
      const status = await getBitrixAuthStatus();
      setAuthStatus(status);
      return status;
    } catch (error) {
      console.error("[AutoConnectBitrix] Error checking auth status:", error);
      return null;
    }
  };

  const detectAndConnect = async () => {
    setLoading(true);
    try {
      // Inicializar BX24 primeiro
      console.log("[AutoConnectBitrix] Initializing BX24...");
      const bx24Available = await initializeBX24();
      
      if (bx24Available) {
        console.log("[AutoConnectBitrix] BX24 available, detecting portal...");
        const portal = getPortalFromIframe();
        
        if (portal) {
          console.log("[AutoConnectBitrix] Portal detected:", portal);
          setDetectedPortal(portal);
          
          // Verificar se já tem token válido para este portal
          const status = await checkAuthStatus();
          
          if (!status?.isConnected || !status?.hasValidTokens) {
            console.log("[AutoConnectBitrix] No valid tokens, starting auto-connect...");
            await performAutoConnect(portal);
          } else {
            console.log("[AutoConnectBitrix] Already connected with valid tokens");
            toast({
              title: "✅ Conectado automaticamente",
              description: `Portal: ${portal.url}`,
            });
          }
        } else {
          console.log("[AutoConnectBitrix] No portal detected from BX24");
        }
      } else {
        console.log("[AutoConnectBitrix] BX24 not available - running in standalone mode");
      }
    } catch (error) {
      console.error("[AutoConnectBitrix] Error in detectAndConnect:", error);
    } finally {
      setLoading(false);
    }
  };

  const performAutoConnect = async (portal: PortalInfo) => {
    setAutoConnecting(true);
    try {
      // Tentar conectar automaticamente usando BX24
      if (typeof window !== 'undefined' && window.BX24) {
        const BX24 = window.BX24;
        
        // Se estamos em um iFrame do Bitrix, podemos usar installFinish para confirmar instalação
        if (BX24.installFinish && typeof BX24.installFinish === 'function') {
          console.log("[AutoConnectBitrix] Calling BX24.installFinish...");
          BX24.installFinish();
        }
        
        // Verificar se o BX24 tem métodos para obter tokens
        if (BX24.getAuth && typeof BX24.getAuth === 'function') {
          console.log("[AutoConnectBitrix] Getting auth from BX24...");
          const auth = BX24.getAuth();
          
          if (auth?.access_token) {
            // Salvar token diretamente se disponível
            await saveTokenDirectly(portal.url, auth);
            await checkAuthStatus();
            
            toast({
              title: "🎉 Conectado automaticamente!",
              description: "Aplicativo instalado e configurado com sucesso.",
            });
            return;
          }
        }
      }
      
      // Fallback: iniciar fluxo OAuth normal mas silencioso
      console.log("[AutoConnectBitrix] Fallback to OAuth flow...");
      await performSilentOAuth(portal.url);
      
    } catch (error) {
      console.error("[AutoConnectBitrix] Auto-connect failed:", error);
      toast({
        title: "Conexão automática falhou",
        description: "Conecte manualmente se necessário.",
        variant: "destructive",
      });
    } finally {
      setAutoConnecting(false);
    }
  };

  const saveTokenDirectly = async (portalUrl: string, auth: any) => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Usuário não autenticado");

      const expiresAt = auth.expires_in ? 
        new Date(Date.now() + (auth.expires_in - 60) * 1000).toISOString() : 
        new Date(Date.now() + 3540 * 1000).toISOString(); // 59 minutos default

      const { error } = await supabase
        .from('bitrix_credentials')
        .upsert({
          user_id: user.id,
          portal_url: portalUrl,
          access_token: auth.access_token,
          refresh_token: auth.refresh_token || '',
          expires_at: expiresAt,
          is_active: true,
          updated_at: new Date().toISOString(),
        }, { onConflict: 'user_id,portal_url' });

      if (error) throw error;
      
      console.log("[AutoConnectBitrix] Token saved directly");
    } catch (error) {
      console.error("[AutoConnectBitrix] Error saving token:", error);
      throw error;
    }
  };

  const performSilentOAuth = async (portalUrl: string) => {
    // Implementar OAuth silencioso se necessário
    console.log("[AutoConnectBitrix] Silent OAuth not implemented yet for:", portalUrl);
  };

  const handleManualRefresh = async () => {
    setLoading(true);
    try {
      // Forçar refresh dos tokens
      await supabase.functions.invoke("bitrix-token-refresh", { body: {} });
      await checkAuthStatus();
      
      toast({
        title: "Status atualizado",
        description: "Conexão verificada com sucesso.",
      });
    } catch (error) {
      console.error("[AutoConnectBitrix] Manual refresh failed:", error);
      toast({
        title: "Erro ao atualizar",
        description: "Falha ao verificar conexão.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    detectAndConnect();
    
    // Verificar status a cada 30 segundos
    const interval = setInterval(checkAuthStatus, 30000);
    return () => clearInterval(interval);
  }, []);

  // Escutar mensagens do OAuth callback
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (event.origin !== window.location.origin) return;
      
      if (event.data?.source === "bitrix-oauth") {
        if (event.data.ok) {
          console.log("[AutoConnectBitrix] OAuth success received");
          toast({
            title: "🎉 Conectado com sucesso!",
            description: "Integração OAuth configurada.",
          });
          setTimeout(checkAuthStatus, 1000);
        } else {
          console.error("[AutoConnectBitrix] OAuth error:", event.data.reason);
          toast({
            title: "Erro na conexão",
            description: event.data.reason || "Falha no OAuth",
            variant: "destructive",
          });
        }
      }
    };

    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, [toast]);

  const isConnected = authStatus?.isConnected && authStatus?.hasValidTokens;
  const hasExpiredToken = authStatus?.isConnected && !authStatus?.hasValidTokens;

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="text-center space-y-4">
          <Loader2 className="h-8 w-8 animate-spin mx-auto text-primary" />
          <div>
            <p className="font-medium">Detectando portal Bitrix24...</p>
            <p className="text-sm text-muted-foreground">Aguarde enquanto verificamos a conexão</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Status da Conexão */}
      <div className="text-center">
        {isConnected ? (
          <div className="space-y-3">
            <div className="flex items-center justify-center gap-2 text-green-600">
              <CheckCircle className="h-8 w-8" />
              <div>
                <h3 className="text-xl font-semibold">Conectado com sucesso!</h3>
                <p className="text-sm text-muted-foreground">
                  {detectedPortal?.url || authStatus?.portalUrl}
                </p>
              </div>
            </div>
            
            <div className="bg-green-50 border border-green-200 rounded-lg p-4">
              <p className="text-sm text-green-800">
                <strong>✅ Aplicativo instalado e funcionando</strong>
                <br />
                A integração com o Bitrix24 está ativa e os tokens são renovados automaticamente.
              </p>
            </div>
          </div>
        ) : hasExpiredToken ? (
          <div className="space-y-3">
            <div className="flex items-center justify-center gap-2 text-orange-600">
              <XCircle className="h-8 w-8" />
              <div>
                <h3 className="text-xl font-semibold">Token Expirado</h3>
                <p className="text-sm text-muted-foreground">Renovação em andamento...</p>
              </div>
            </div>
            
            {autoConnecting && (
              <div className="flex items-center justify-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" />
                <span className="text-sm">Reconectando automaticamente...</span>
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            <div className="flex items-center justify-center gap-2 text-red-600">
              <XCircle className="h-8 w-8" />
              <div>
                <h3 className="text-xl font-semibold">Não Conectado</h3>
                <p className="text-sm text-muted-foreground">
                  {detectedPortal ? 
                    `Portal detectado: ${detectedPortal.url}` : 
                    'Nenhum portal detectado'
                  }
                </p>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Informações de Debug (apenas em desenvolvimento) */}
      {process.env.NODE_ENV === 'development' && (
        <details className="text-xs text-gray-500">
          <summary>Informações de Debug</summary>
          <pre className="mt-2 p-3 bg-gray-100 rounded text-xs overflow-x-auto">
            {JSON.stringify({
              hasWindow: typeof window !== 'undefined',
              hasBX24: typeof (window as any).BX24 !== 'undefined',
              bx24Methods: typeof (window as any).BX24 === 'object' ? Object.keys((window as any).BX24) : [],
              referrer: typeof document !== 'undefined' ? document.referrer : 'N/A',
              detectedPortal,
              authStatus,
              searchParams: typeof window !== 'undefined' ? Object.fromEntries(new URLSearchParams(window.location.search)) : {}
            }, null, 2)}
          </pre>
        </details>
      )}

      {/* Botão de atualização manual */}
      <div className="text-center">
        <Button 
          onClick={handleManualRefresh} 
          disabled={loading}
          variant="outline"
          size="sm"
        >
          <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
          {loading ? 'Verificando...' : 'Atualizar Status'}
        </Button>
      </div>
    </div>
  );
};

export default AutoConnectBitrix;
