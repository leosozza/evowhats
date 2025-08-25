
import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { startBitrixOAuth } from "@/services/bitrixIntegration";
import { Link, CheckCircle, XCircle, Unlink, Eye, EyeOff, Loader2 } from "lucide-react";
import { getBitrixAuthStatus, type BitrixAuthStatus } from "@/services/bitrixAuthStatus";
import { supabase } from "@/integrations/supabase/client";
import { getPortalFromIframe, buildBitrixAuthUrl, initializeBX24, type PortalInfo } from "@/utils/bitrixPortalDetection";

interface ConnectBitrixButtonProps {
  portalUrl: string;
  onPortalUrlChange: (url: string) => void;
}

const ConnectBitrixButton = ({ portalUrl, onPortalUrlChange }: ConnectBitrixButtonProps) => {
  const [loading, setLoading] = useState(false);
  const [authStatus, setAuthStatus] = useState<BitrixAuthStatus | null>(null);
  const [showPortalInput, setShowPortalInput] = useState(true);
  const [detectedPortal, setDetectedPortal] = useState<PortalInfo | null>(null);
  const [initializingBX24, setInitializingBX24] = useState(true);
  const { toast } = useToast();

  // Inicializar BX24 e detectar portal
  useEffect(() => {
    const initializeAndDetect = async () => {
      console.log("[ConnectBitrixButton] Initializing BX24 and detecting portal...");
      setInitializingBX24(true);

      try {
        // Tentar inicializar BX24 (se estiver no iFrame)
        const bx24Available = await initializeBX24();
        console.log("[ConnectBitrixButton] BX24 available:", bx24Available);

        // Tentar detectar portal automaticamente
        const portal = getPortalFromIframe();
        if (portal) {
          console.log("[ConnectBitrixButton] Portal detected:", portal);
          setDetectedPortal(portal);
          onPortalUrlChange(portal.url);
          setShowPortalInput(false);
          
          toast({
            title: "Portal detectado automaticamente",
            description: `Usando portal: ${portal.url}`,
          });
        } else {
          console.log("[ConnectBitrixButton] No portal detected, showing manual input");
          setShowPortalInput(true);
        }
      } catch (error) {
        console.error("[ConnectBitrixButton] Error during initialization:", error);
        setShowPortalInput(true);
      } finally {
        setInitializingBX24(false);
      }
    };

    initializeAndDetect();
  }, [onPortalUrlChange, toast]);

  const checkAuthStatus = async () => {
    try {
      const status = await getBitrixAuthStatus();
      setAuthStatus(status);
    } catch (error) {
      console.error("[ConnectBitrixButton] Error checking auth status:", error);
    }
  };

  useEffect(() => {
    checkAuthStatus();
    
    // Check status every 30 seconds
    const interval = setInterval(checkAuthStatus, 30000);
    return () => clearInterval(interval);
  }, []);

  // Escutar mensagens do popup OAuth
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      // Verificar origem por segurança
      if (event.origin !== window.location.origin) {
        console.warn("[ConnectBitrixButton] Ignoring message from unknown origin:", event.origin);
        return;
      }

      console.log("[ConnectBitrixButton] Received message:", event.data);
      
      if (event.data?.source === "bitrix-oauth") {
        if (event.data.ok) {
          console.log("[ConnectBitrixButton] OAuth success received");
          
          toast({
            title: "Conectado ao Bitrix24!",
            description: "Integração OAuth configurada com sucesso.",
          });
          
          // Update status after successful OAuth
          setTimeout(checkAuthStatus, 1000);
        } else if (event.data.error) {
          console.error("[ConnectBitrixButton] OAuth error received:", event.data.error);
          
          toast({
            title: "Erro na conexão OAuth",
            description: event.data.error,
            variant: "destructive",
          });
        }
        
        setLoading(false);
      } else if (event.data === "bitrix_oauth_success") {
        // Mensagem legacy para compatibilidade
        console.log("[ConnectBitrixButton] Legacy success message received");
        
        toast({
          title: "Conectado ao Bitrix24!",
          description: "Integração OAuth configurada com sucesso.",
        });
        
        setTimeout(checkAuthStatus, 1000);
        setLoading(false);
      }
    };

    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, [toast]);

  const handleDisconnect = async () => {
    try {
      setLoading(true);
      
      // Deactivate all credentials for this user
      const { error } = await supabase
        .from('bitrix_credentials')
        .update({ is_active: false })
        .eq('user_id', (await supabase.auth.getUser()).data.user?.id);

      if (error) throw error;

      toast({
        title: "Desconectado",
        description: "Conexão com Bitrix24 removida com sucesso.",
      });

      await checkAuthStatus();
    } catch (error: any) {
      console.error("[ConnectBitrixButton] Error disconnecting:", error);
      toast({
        title: "Erro ao desconectar",
        description: error.message || "Falha ao remover conexão",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleConnectOAuth = async () => {
    const finalPortalUrl = portalUrl.trim();
    
    if (!finalPortalUrl) {
      toast({
        title: "URL obrigatória",
        description: "Digite a URL do seu portal Bitrix24 (ex: https://seudominio.bitrix24.com.br)",
        variant: "destructive",
      });
      return;
    }

    // Validate URL format
    try {
      const url = new URL(finalPortalUrl);
      if (!url.hostname.includes('bitrix24')) {
        toast({
          title: "URL inválida",
          description: "A URL deve ser do formato: https://seudominio.bitrix24.com ou https://seudominio.bitrix24.com.br",
          variant: "destructive",
        });
        return;
      }
    } catch {
      toast({
        title: "URL inválida",
        description: "Digite uma URL válida (ex: https://seudominio.bitrix24.com.br)",
        variant: "destructive",
      });
      return;
    }

    setLoading(true);
    console.log("[ConnectBitrixButton] Starting OAuth for portal:", finalPortalUrl);

    try {
      const { auth_url } = await startBitrixOAuth(finalPortalUrl);
      console.log("[ConnectBitrixButton] OAuth URL generated:", auth_url);

      // Open OAuth window
      const popup = window.open(
        auth_url, 
        'bitrix-oauth',
        'width=600,height=700,scrollbars=yes,resizable=yes'
      );

      if (!popup) {
        throw new Error("Pop-up bloqueado. Permita pop-ups para este site.");
      }

      // Check if popup is closed manually
      const checkClosed = setInterval(() => {
        if (popup?.closed) {
          clearInterval(checkClosed);
          console.log("[ConnectBitrixButton] Popup closed manually");
          setLoading(false);
        }
      }, 1000);

    } catch (error: any) {
      console.error("[ConnectBitrixButton] Error starting OAuth:", error);
      
      let errorMessage = "Erro inesperado ao iniciar OAuth";
      if (error.message?.includes("Failed to fetch")) {
        errorMessage = "Erro de conectividade. Verifique sua internet e tente novamente.";
      } else if (error.message) {
        errorMessage = error.message;
      }

      toast({
        title: "Erro na conexão OAuth",
        description: errorMessage,
        variant: "destructive",
      });
      setLoading(false);
    }
  };

  const togglePortalInput = () => {
    setShowPortalInput(!showPortalInput);
  };

  // Show connection status
  const isConnected = authStatus?.isConnected && authStatus?.hasValidTokens;
  const hasExpiredToken = authStatus?.isConnected && !authStatus?.hasValidTokens;

  if (initializingBX24) {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <Loader2 className="h-4 w-4 animate-spin" />
          <span className="text-sm">Detectando portal Bitrix24...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Portal Detection Info */}
      {detectedPortal && (
        <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg">
          <p className="text-sm text-blue-700">
            <strong>Portal detectado:</strong> {detectedPortal.url}
            <br />
            <span className="text-xs">Fonte: {detectedPortal.source === 'iframe' ? 'BX24 iFrame' : 'Referrer'}</span>
          </p>
        </div>
      )}

      {/* Portal URL Input */}
      <div>
        <div className="flex items-center gap-2 mb-2">
          <Label htmlFor="portal-url">URL do Portal Bitrix24</Label>
          {detectedPortal && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={togglePortalInput}
            >
              {showPortalInput ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </Button>
          )}
        </div>
        
        {showPortalInput && (
          <Input
            id="portal-url"
            placeholder="https://seudominio.bitrix24.com.br"
            value={portalUrl}
            onChange={(e) => onPortalUrlChange(e.target.value)}
            disabled={isConnected || loading}
          />
        )}
        
        {!showPortalInput && detectedPortal && (
          <div className="px-3 py-2 bg-gray-50 border rounded-md text-sm text-gray-600">
            {portalUrl}
          </div>
        )}
      </div>

      {isConnected ? (
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-green-600">
            <CheckCircle className="h-4 w-4" />
            <span className="text-sm font-medium">Conectado via OAuth</span>
          </div>
          <Button 
            onClick={handleDisconnect} 
            disabled={loading}
            variant="outline"
            size="sm"
          >
            <Unlink className="h-4 w-4 mr-2" />
            {loading ? "Desconectando..." : "Desconectar"}
          </Button>
        </div>
      ) : hasExpiredToken ? (
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-orange-600">
            <XCircle className="h-4 w-4" />
            <span className="text-sm font-medium">Token Expirado</span>
          </div>
          <Button 
            onClick={handleConnectOAuth} 
            disabled={loading}
            className="gradient-primary"
          >
            {loading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Link className="h-4 w-4 mr-2" />}
            {loading ? "Reconectando..." : "Reconectar OAuth"}
          </Button>
        </div>
      ) : (
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-red-600">
            <XCircle className="h-4 w-4" />
            <span className="text-sm font-medium">Desconectado</span>
          </div>
          <Button 
            onClick={handleConnectOAuth} 
            disabled={loading}
            className="gradient-primary"
          >
            {loading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Link className="h-4 w-4 mr-2" />}
            {loading ? "Conectando..." : "Conectar via OAuth"}
          </Button>
        </div>
      )}

      <p className="text-xs text-muted-foreground">
        Escopos necessários: imopenlines, imconnector, im, placement, crm, user
      </p>

      {/* Debug Info */}
      {process.env.NODE_ENV === 'development' && (
        <details className="text-xs text-gray-500">
          <summary>Debug Info</summary>
          <pre className="mt-1 p-2 bg-gray-100 rounded text-xs overflow-x-auto">
            {JSON.stringify({
              hasWindow: typeof window !== 'undefined',
              hasBX24: typeof (window as any).BX24 !== 'undefined',
              referrer: document.referrer,
              searchParams: Object.fromEntries(new URLSearchParams(window.location.search)),
              detectedPortal,
              authStatus
            }, null, 2)}
          </pre>
        </details>
      )}
    </div>
  );
};

export default ConnectBitrixButton;
