
import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { 
  CheckCircle, 
  XCircle, 
  AlertTriangle, 
  RefreshCw,
  MessageSquare,
  Zap
} from "lucide-react";
import { testEvolutionConnection, type ConnectionTest } from "@/services/evolutionApi";
import { getBitrixAuthStatus, type BitrixAuthStatus } from "@/services/bitrixAuthStatus";
import { useToast } from "@/hooks/use-toast";
import OpenChannelsManager from "./bitrix/OpenChannelsManager";

const ConnectionStatus = () => {
  const [evolutionStatus, setEvolutionStatus] = useState<ConnectionTest | null>(null);
  const [bitrixStatus, setBitrixStatus] = useState<BitrixAuthStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [showOpenChannels, setShowOpenChannels] = useState(false);
  const { toast } = useToast();

  const checkConnections = async () => {
    setLoading(true);
    try {
      // Check Bitrix status
      const bitrixAuth = await getBitrixAuthStatus();
      setBitrixStatus(bitrixAuth);

      // Check Evolution API status if configured
      try {
        const evolutionTest = await testEvolutionConnection("", "", "");
        setEvolutionStatus(evolutionTest);
      } catch (error) {
        setEvolutionStatus({
          success: false,
          message: "Evolution API não configurada"
        });
      }
    } catch (error: any) {
      console.error('Error checking connections:', error);
      toast({
        title: "Erro ao verificar conexões",
        description: error.message || "Falha ao verificar status das conexões",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    checkConnections();
  }, []);

  const handleEvolutionBitrixClick = () => {
    if (bitrixStatus?.isConnected && bitrixStatus?.hasValidTokens) {
      setShowOpenChannels(true);
    } else {
      // Try to connect automatically or show connection panel
      checkConnections();
      toast({
        title: "Conexão necessária",
        description: "Configure a conexão Bitrix24 na aba Configurações primeiro.",
        variant: "destructive",
      });
    }
  };

  if (showOpenChannels) {
    return <OpenChannelsManager />;
  }

  const getStatusColor = (isConnected: boolean) => isConnected ? "text-green-600" : "text-red-600";
  const getStatusIcon = (isConnected: boolean) => isConnected ? CheckCircle : XCircle;

  const evolutionConnected = evolutionStatus?.success || false;
  const bitrixConnected = bitrixStatus?.isConnected && bitrixStatus?.hasValidTokens || false;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Zap className="h-5 w-5" />
            Status das Conexões
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Evolution API Status */}
            <div className="p-4 border rounded-lg">
              <div className="flex items-center justify-between mb-2">
                <h3 className="font-medium">Evolution API</h3>
                <div className="flex items-center gap-1">
                  {React.createElement(getStatusIcon(evolutionConnected), {
                    className: `h-4 w-4 ${getStatusColor(evolutionConnected)}`
                  })}
                </div>
              </div>
              <Badge variant={evolutionConnected ? "default" : "secondary"}>
                {evolutionConnected ? "Conectado" : "Desconectado"}
              </Badge>
              {evolutionStatus?.message && (
                <p className="text-sm text-muted-foreground mt-1">
                  {evolutionStatus.message}
                </p>
              )}
            </div>

            {/* Bitrix24 Status */}
            <div className="p-4 border rounded-lg">
              <div className="flex items-center justify-between mb-2">
                <h3 className="font-medium">Bitrix24</h3>
                <div className="flex items-center gap-1">
                  {React.createElement(getStatusIcon(bitrixConnected), {
                    className: `h-4 w-4 ${getStatusColor(bitrixConnected)}`
                  })}
                </div>
              </div>
              <Badge variant={bitrixConnected ? "default" : "secondary"}>
                {bitrixConnected ? "Conectado" : "Desconectado"}
              </Badge>
              {bitrixStatus?.portalUrl && (
                <p className="text-sm text-muted-foreground mt-1">
                  {bitrixStatus.portalUrl}
                </p>
              )}
            </div>
          </div>

          {/* Integration Panel */}
          <div className="pt-4 border-t">
            <h3 className="font-medium mb-3">Integrações Disponíveis</h3>
            
            <Card 
              className="cursor-pointer hover:bg-muted/50 transition-colors" 
              onClick={handleEvolutionBitrixClick}
            >
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="flex items-center gap-1">
                      <MessageSquare className="h-5 w-5" />
                      <Zap className="h-4 w-4" />
                    </div>
                    <div>
                      <h4 className="font-medium">Evolution API + Bitrix24</h4>
                      <p className="text-sm text-muted-foreground">
                        WhatsApp via Evolution API integrado ao Bitrix24 Open Channels
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {evolutionConnected && bitrixConnected ? (
                      <Badge className="bg-green-100 text-green-800">
                        <CheckCircle className="h-3 w-3 mr-1" />
                        Configurar
                      </Badge>
                    ) : (
                      <Badge variant="secondary">
                        <AlertTriangle className="h-3 w-3 mr-1" />
                        Conectar
                      </Badge>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          <div className="flex justify-center pt-4">
            <Button 
              onClick={checkConnections} 
              disabled={loading}
              variant="outline"
              size="sm"
            >
              <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
              {loading ? 'Verificando...' : 'Atualizar Status'}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default ConnectionStatus;
