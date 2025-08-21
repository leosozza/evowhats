
import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { 
  Settings, 
  CheckCircle, 
  XCircle, 
  RefreshCw,
  MessageSquare,
  QrCode
} from "lucide-react";
import { getBitrixAuthStatus } from "@/services/bitrixAuthStatus";
import { getOpenChannelsStatus, activateConnector } from "@/services/bitrixOpenChannelsManager";
import LineQrManager from "@/components/bitrix/LineQrManager";

const ConnectorSetup = () => {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const [status, setStatus] = useState<any>(null);

  useEffect(() => {
    checkConnectionAndLoadStatus();
  }, []);

  const checkConnectionAndLoadStatus = async () => {
    try {
      setLoading(true);
      
      const authStatus = await getBitrixAuthStatus();
      const connected = authStatus.isConnected && authStatus.hasValidTokens;
      setIsConnected(connected);
      
      if (connected) {
        const currentStatus = await getOpenChannelsStatus();
        setStatus(currentStatus);
      }
    } catch (error: any) {
      console.error('Error loading setup data:', error);
      toast({
        title: "Erro ao carregar dados",
        description: error.message || "Falha ao verificar status",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleActivateLine = async (lineId: string, activate: boolean) => {
    try {
      setLoading(true);
      await activateConnector({
        connector: 'evolution_whatsapp',
        line: lineId,
        active: activate,
      });
      
      toast({
        title: activate ? "Linha ativada!" : "Linha desativada!",
        description: `A linha foi ${activate ? "ativada" : "desativada"} com sucesso.`,
      });
      
      await checkConnectionAndLoadStatus();
    } catch (error: any) {
      toast({
        title: "Erro na ativação",
        description: error.message || "Falha ao alterar status da linha",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  if (!isConnected) {
    return (
      <div className="min-h-screen bg-background p-4">
        <Card className="max-w-2xl mx-auto">
          <CardHeader className="text-center">
            <CardTitle>Conexão necessária</CardTitle>
          </CardHeader>
          <CardContent className="text-center">
            <p className="text-muted-foreground mb-4">
              Configure a conexão Bitrix24 primeiro para usar este conector.
            </p>
            <Button onClick={checkConnectionAndLoadStatus} variant="outline">
              <RefreshCw className="h-4 w-4 mr-2" />
              Verificar Conexão
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background p-4">
      <div className="max-w-4xl mx-auto space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <MessageSquare className="h-5 w-5" />
              Configuração do Conector EvoWhats
              <Button 
                onClick={checkConnectionAndLoadStatus} 
                variant="ghost" 
                size="sm" 
                disabled={loading}
              >
                <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
              </Button>
            </CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <p className="text-center text-muted-foreground">Carregando...</p>
            ) : status ? (
              <div className="space-y-6">
                {/* Status Overview */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                  <Badge variant={status.registered ? "default" : "secondary"}>
                    {status.registered ? <CheckCircle className="h-3 w-3 mr-1" /> : <XCircle className="h-3 w-3 mr-1" />}
                    {status.registered ? "Registrado" : "Não Registrado"}
                  </Badge>
                  <Badge variant={status.published ? "default" : "secondary"}>
                    {status.published ? <CheckCircle className="h-3 w-3 mr-1" /> : <XCircle className="h-3 w-3 mr-1" />}
                    {status.published ? "Publicado" : "Não Publicado"}
                  </Badge>
                  <Badge variant={status.tilePlaced ? "default" : "secondary"}>
                    {status.tilePlaced ? <CheckCircle className="h-3 w-3 mr-1" /> : <XCircle className="h-3 w-3 mr-1" />}
                    {status.tilePlaced ? "Tile OK" : "Tile Ausente"}
                  </Badge>
                  <Badge variant={status.activeConnections.length > 0 ? "default" : "secondary"}>
                    {status.activeConnections.length > 0 ? <CheckCircle className="h-3 w-3 mr-1" /> : <XCircle className="h-3 w-3 mr-1" />}
                    {status.activeConnections.length} Ativo(s)
                  </Badge>
                </div>

                {/* Lines Management */}
                {status.lines && status.lines.length > 0 && (
                  <div className="space-y-4">
                    <h3 className="font-medium">Linhas Disponíveis</h3>
                    <div className="space-y-3">
                      {status.lines.map((line: any) => (
                        <Card key={line.ID} className="p-4">
                          <div className="flex items-center justify-between">
                            <div>
                              <h4 className="font-medium">{line.NAME}</h4>
                              <p className="text-sm text-muted-foreground">ID: {line.ID}</p>
                            </div>
                            <div className="flex items-center gap-2">
                              {status.activeConnections.includes(line.ID) ? (
                                <Badge className="bg-green-100 text-green-800">
                                  <CheckCircle className="h-3 w-3 mr-1" />
                                  Ativo
                                </Badge>
                              ) : (
                                <Badge variant="secondary">
                                  <XCircle className="h-3 w-3 mr-1" />
                                  Inativo
                                </Badge>
                              )}
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => handleActivateLine(
                                  line.ID, 
                                  !status.activeConnections.includes(line.ID)
                                )}
                                disabled={loading}
                              >
                                {status.activeConnections.includes(line.ID) ? "Desativar" : "Ativar"}
                              </Button>
                            </div>
                          </div>
                        </Card>
                      ))}
                    </div>
                  </div>
                )}

                {/* QR Manager */}
                {status.lines && status.lines.length > 0 && (
                  <LineQrManager lines={status.lines} />
                )}
              </div>
            ) : (
              <p className="text-center text-muted-foreground">
                Nenhum dado disponível. Verifique a conexão Bitrix24.
              </p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default ConnectorSetup;
