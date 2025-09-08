import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Link, CheckCircle, XCircle, Unlink, Eye, EyeOff, Loader2 } from "lucide-react";
import { getBitrixAuthStatus, type BitrixAuthStatus } from "@/services/bitrixAuthStatus";
import { supabase } from "@/integrations/supabase/client";
import { openBitrixPopup, getPortalFromIframe } from "@/utils/bitrixAuth";

interface ConnectBitrixButtonProps {
  portalUrl: string;
  onPortalUrlChange: (url: string) => void;
}

const ConnectBitrixButton = ({ portalUrl, onPortalUrlChange }: ConnectBitrixButtonProps) => {
  const [loading, setLoading] = useState(false);
  const [authStatus, setAuthStatus] = useState<BitrixAuthStatus | null>(null);
  const [showPortalInput, setShowPortalInput] = useState(true);
  const { toast } = useToast();

  const checkAuthStatus = async () => {
    try {
      const status = await getBitrixAuthStatus();
      setAuthStatus(status);
      
      // If connected, hide portal input and use existing portal URL
      if (status.isConnected && status.portalUrl && !portalUrl) {
        onPortalUrlChange(status.portalUrl);
        setShowPortalInput(false);
      } else if (!status.isConnected) {
        // If not connected, show portal input
        setShowPortalInput(true);
        // Try to get portal from storage
        const storedPortal = getPortalFromIframe();
        if (storedPortal && !portalUrl) {
          onPortalUrlChange(storedPortal);
        }
      }
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
    setLoading(true);
    console.log("[ConnectBitrixButton] Starting OAuth...");

    try {
      openBitrixPopup((ok, reason) => {
        if (ok) {
          console.log("[ConnectBitrixButton] OAuth success received");
          
          toast({
            title: "Conectado ao Bitrix24!",
            description: "Integração OAuth configurada com sucesso.",
          });
          
          // Update status after successful OAuth
          setTimeout(checkAuthStatus, 1000);
        } else {
          console.error("[ConnectBitrixButton] OAuth error received:", reason);
          
          toast({
            title: "Erro na conexão OAuth",
            description: reason || "Falha na autenticação",
            variant: "destructive",
          });
        }
        
        setLoading(false);
      });

    } catch (error: any) {
      console.error("[ConnectBitrixButton] Error starting OAuth:", error);
      
      toast({
        title: "Erro na conexão OAuth",
        description: error.message || "Erro inesperado ao iniciar OAuth",
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

  return (
    <div className="space-y-4">
      {/* Show existing portal info if connected */}
      {authStatus?.portalUrl && (
        <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg">
          <p className="text-sm text-blue-700">
            <strong>Portal configurado:</strong> {authStatus.portalUrl}
          </p>
        </div>
      )}

      {/* Portal URL Input - only show if not connected or if user wants to see it */}
      {!isConnected && (
        <div>
          <div className="flex items-center gap-2 mb-2">
            <Label htmlFor="portal-url">URL do Portal Bitrix24</Label>
            {authStatus?.portalUrl && (
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
              disabled={loading}
            />
          )}
          
          {!showPortalInput && authStatus?.portalUrl && (
            <div className="px-3 py-2 bg-gray-50 border rounded-md text-sm text-gray-600">
              {authStatus.portalUrl}
            </div>
          )}
        </div>
      )}

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
            <span className="text-sm font-medium">Token Expirado - Reconexão necessária</span>
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
            disabled={loading || !portalUrl.trim()}
            className="gradient-primary"
          >
            {loading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Link className="h-4 w-4 mr-2" />}
            {loading ? "Conectando..." : "Conectar via OAuth"}
          </Button>
          {!portalUrl.trim() && (
            <p className="text-xs text-muted-foreground text-red-600">
              Digite a URL do portal para conectar
            </p>
          )}
        </div>
      )}

      <p className="text-xs text-muted-foreground">
        O OAuth será configurado automaticamente com os escopos necessários
      </p>
    </div>
  );
};

export default ConnectBitrixButton;