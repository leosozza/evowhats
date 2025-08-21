
import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { RefreshCw, CheckCircle, AlertTriangle, XCircle, Clock } from "lucide-react";
import { getBitrixAuthStatus, type BitrixAuthStatus } from "@/services/bitrixAuthStatus";
import { useToast } from "@/hooks/use-toast";
import { useBitrixTokenRefresh } from "@/hooks/useBitrixTokenRefresh";

const BitrixConnectionMonitor = () => {
  const [status, setStatus] = useState<BitrixAuthStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();
  const { performTokenRefresh } = useBitrixTokenRefresh();

  const checkStatus = async () => {
    setLoading(true);
    try {
      const authStatus = await getBitrixAuthStatus();
      setStatus(authStatus);
      
      if (authStatus.error) {
        console.log("[BitrixConnectionMonitor] Status error:", authStatus.error);
      }
    } catch (error: any) {
      console.error("[BitrixConnectionMonitor] Error checking status:", error);
      toast({
        title: "Erro ao verificar status",
        description: error.message || "Falha ao verificar conexão com Bitrix24",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleManualRefresh = async () => {
    setLoading(true);
    await performTokenRefresh();
    await checkStatus();
  };

  useEffect(() => {
    checkStatus();
    
    // Auto refresh every minute
    const interval = setInterval(checkStatus, 60000);
    return () => clearInterval(interval);
  }, []);

  const getStatusIcon = () => {
    if (loading) return <RefreshCw className="h-4 w-4 animate-spin" />;
    
    if (!status) return <XCircle className="h-4 w-4 text-gray-500" />;
    
    if (status.isConnected && status.hasValidTokens) {
      return <CheckCircle className="h-4 w-4 text-green-500" />;
    }
    
    if (status.isConnected && !status.hasValidTokens) {
      return <AlertTriangle className="h-4 w-4 text-orange-500" />;
    }
    
    return <XCircle className="h-4 w-4 text-red-500" />;
  };

  const getStatusBadge = () => {
    if (loading) return <Badge variant="secondary">Verificando...</Badge>;
    
    if (!status) return <Badge variant="destructive">Erro</Badge>;
    
    if (status.isConnected && status.hasValidTokens) {
      return <Badge className="bg-green-100 text-green-800">Conectado</Badge>;
    }
    
    if (status.isConnected && !status.hasValidTokens) {
      return <Badge variant="secondary">Token Expirado</Badge>;
    }
    
    return <Badge variant="destructive">Desconectado</Badge>;
  };

  const getTokenExpiryInfo = () => {
    if (!status?.expiresAt) return null;
    
    const now = new Date();
    const expiresAt = new Date(status.expiresAt);
    const timeDiff = expiresAt.getTime() - now.getTime();
    const hoursLeft = Math.floor(timeDiff / (1000 * 60 * 60));
    const minutesLeft = Math.floor((timeDiff % (1000 * 60 * 60)) / (1000 * 60));
    
    if (timeDiff <= 0) {
      return <span className="text-red-600">Expirado</span>;
    } else if (hoursLeft < 1) {
      return <span className="text-orange-600">{minutesLeft}min restantes</span>;
    } else if (hoursLeft < 24) {
      return <span className="text-yellow-600">{hoursLeft}h {minutesLeft}min</span>;
    } else {
      const daysLeft = Math.floor(hoursLeft / 24);
      return <span className="text-green-600">{daysLeft} dias</span>;
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          {getStatusIcon()}
          Status da Conexão Bitrix24
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium">Status OAuth:</span>
          {getStatusBadge()}
        </div>

        {status?.portalUrl && (
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium">Portal:</span>
            <span className="text-sm text-muted-foreground">{status.portalUrl}</span>
          </div>
        )}

        {status?.expiresAt && (
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium">Token:</span>
            <span className="text-sm flex items-center gap-1">
              <Clock className="h-3 w-3" />
              {getTokenExpiryInfo()}
            </span>
          </div>
        )}

        {status?.error && (
          <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
            <p className="text-sm text-red-700">
              <strong>Erro:</strong> {status.error}
            </p>
          </div>
        )}

        <Button
          onClick={handleManualRefresh}
          disabled={loading}
          variant="outline"
          size="sm"
          className="w-full"
        >
          <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
          {loading ? 'Verificando...' : 'Atualizar Status'}
        </Button>

        <div className="text-xs text-muted-foreground space-y-1">
          <p>• ✅ Conectado: OAuth configurado e funcionando</p>
          <p>• ⚠️ Token Expirado: Renovação automática em andamento</p>
          <p>• ❌ Desconectado: OAuth não configurado</p>
          <p className="mt-2 p-2 bg-blue-50 border border-blue-200 rounded text-blue-700">
            <strong>Auto-renovação:</strong> Tokens são renovados automaticamente a cada 5 minutos se necessário
          </p>
        </div>
      </CardContent>
    </Card>
  );
};

export default BitrixConnectionMonitor;
