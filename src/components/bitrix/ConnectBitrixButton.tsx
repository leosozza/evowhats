
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { startBitrixOAuth } from "@/services/bitrixIntegration";
import { Link, CheckCircle, XCircle, Unlink } from "lucide-react";
import { getBitrixAuthStatus, type BitrixAuthStatus } from "@/services/bitrixAuthStatus";
import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";

interface ConnectBitrixButtonProps {
  portalUrl: string;
  onPortalUrlChange: (url: string) => void;
}

const ConnectBitrixButton = ({ portalUrl, onPortalUrlChange }: ConnectBitrixButtonProps) => {
  const [loading, setLoading] = useState(false);
  const [authStatus, setAuthStatus] = useState<BitrixAuthStatus | null>(null);
  const { toast } = useToast();

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
    if (!portalUrl) {
      toast({
        title: "URL obrigatória",
        description: "Digite a URL do seu portal Bitrix24 (ex: https://seudominio.bitrix24.com.br)",
        variant: "destructive",
      });
      return;
    }

    // Validate URL format
    try {
      const url = new URL(portalUrl);
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
    console.log("[ConnectBitrixButton] Starting OAuth for portal:", portalUrl);

    try {
      const { auth_url } = await startBitrixOAuth(portalUrl);
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

      // Listen for success message from popup
      const handleMessage = (event: MessageEvent) => {
        console.log("[ConnectBitrixButton] Received message:", event);
        
        if (event.data?.source === "bitrix-oauth" && event.data?.ok) {
          console.log("[ConnectBitrixButton] OAuth success received");
          popup?.close();
          window.removeEventListener("message", handleMessage);
          
          toast({
            title: "Conectado ao Bitrix24!",
            description: "Integração OAuth configurada com sucesso.",
          });
          
          // Update status after successful OAuth
          setTimeout(checkAuthStatus, 1000);
          setLoading(false);
        } else if (event.data === "bitrix_oauth_success") {
          console.log("[ConnectBitrixButton] Legacy success message received");
          popup?.close();
          window.removeEventListener("message", handleMessage);
          
          toast({
            title: "Conectado ao Bitrix24!",
            description: "Integração OAuth configurada com sucesso.",
          });
          
          setTimeout(checkAuthStatus, 1000);
          setLoading(false);
        }
      };

      window.addEventListener("message", handleMessage);

      // Check if popup is closed manually
      const checkClosed = setInterval(() => {
        if (popup?.closed) {
          clearInterval(checkClosed);
          window.removeEventListener("message", handleMessage);
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

  // Show connection status
  const isConnected = authStatus?.isConnected && authStatus?.hasValidTokens;
  const hasExpiredToken = authStatus?.isConnected && !authStatus?.hasValidTokens;

  return (
    <div className="space-y-4">
      <div>
        <Label htmlFor="portal-url">URL do Portal Bitrix24</Label>
        <Input
          id="portal-url"
          placeholder="https://seudominio.bitrix24.com.br"
          value={portalUrl}
          onChange={(e) => onPortalUrlChange(e.target.value)}
          disabled={isConnected}
        />
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
            <Link className="h-4 w-4 mr-2" />
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
            <Link className="h-4 w-4 mr-2" />
            {loading ? "Conectando..." : "Conectar via OAuth"}
          </Button>
        </div>
      )}

      <p className="text-xs text-muted-foreground">
        Escopos necessários: imopenlines, imconnector, im, placement, crm, user
      </p>
    </div>
  );
};

export default ConnectBitrixButton;
