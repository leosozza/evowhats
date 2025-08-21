
import React, { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft, Settings, CheckCircle, AlertTriangle } from "lucide-react";
import { Link, useSearchParams } from "react-router-dom";
import InstanceManager from "@/components/evolution/InstanceManager";
import { getBitrixAuthStatus } from "@/services/bitrixAuthStatus";
import { getOpenChannelsStatus, type ConnectorStatus } from "@/services/bitrixOpenChannelsManager";

export default function ConnectorSetup() {
  const { toast } = useToast();
  const [searchParams] = useSearchParams();
  const [isConnected, setIsConnected] = useState(false);
  const [channels, setChannels] = useState<Array<{ id: string; name: string }>>([]);
  const [loading, setLoading] = useState(true);

  // Get parameters from URL (sent by Bitrix24)
  const placement = searchParams.get('PLACEMENT');
  const placementOptions = searchParams.get('PLACEMENT_OPTIONS');

  useEffect(() => {
    checkBitrixConnection();
  }, []);

  const checkBitrixConnection = async () => {
    try {
      const authStatus = await getBitrixAuthStatus();
      const connected = authStatus.isConnected && authStatus.hasValidTokens;
      setIsConnected(connected);

      if (connected) {
        await loadChannels();
      }
    } catch (error) {
      console.error('Error checking Bitrix connection:', error);
      setIsConnected(false);
    } finally {
      setLoading(false);
    }
  };

  const loadChannels = async () => {
    try {
      const status: ConnectorStatus = await getOpenChannelsStatus();
      
      if (status.lines) {
        const channelList = status.lines.map((line: any) => ({
          id: line.ID,
          name: line.NAME
        }));
        setChannels(channelList);
      }
    } catch (error) {
      console.error('Error loading channels:', error);
      toast({
        title: "Erro ao carregar canais",
        description: "Não foi possível carregar a lista de canais do Bitrix24.",
        variant: "destructive",
      });
    }
  };

  const handleInstanceLinked = () => {
    toast({
      title: "Configuração completa!",
      description: "A instância foi vinculada ao canal com sucesso.",
    });
  };

  if (loading) {
    return (
      <div className="container mx-auto p-6">
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
        </div>
      </div>
    );
  }

  if (!isConnected) {
    return (
      <div className="container mx-auto p-6 max-w-4xl">
        <div className="mb-6">
          <Link to="/" className="flex items-center gap-2 text-muted-foreground hover:text-foreground mb-4">
            <ArrowLeft className="h-4 w-4" />
            Voltar para Dashboard
          </Link>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Settings className="h-5 w-5" />
              Configuração do Conector EvoWhats
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-center py-8 space-y-4">
              <AlertTriangle className="h-12 w-12 text-orange-500 mx-auto" />
              <div>
                <h3 className="font-medium">Conexão Bitrix24 necessária</h3>
                <p className="text-sm text-muted-foreground mt-1">
                  É necessário estar conectado ao Bitrix24 para configurar o conector.
                </p>
              </div>
              <Link to="/">
                <Button>
                  Ir para Configurações
                </Button>
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6 max-w-6xl">
      <div className="mb-6">
        <Link to="/" className="flex items-center gap-2 text-muted-foreground hover:text-foreground mb-4">
          <ArrowLeft className="h-4 w-4" />
          Voltar para Dashboard
        </Link>
        
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Configuração do Conector EvoWhats</h1>
            <p className="text-muted-foreground mt-1">
              Configure suas instâncias WhatsApp e vincule-as aos canais do Bitrix24
            </p>
          </div>
          
          {placement && (
            <Badge variant="outline" className="flex items-center gap-1">
              <CheckCircle className="h-3 w-3" />
              Integração Bitrix24
            </Badge>
          )}
        </div>
      </div>

      {/* URL Parameters Info (for debugging) */}
      {placement && (
        <Card className="mb-6">
          <CardContent className="pt-4">
            <div className="text-sm space-y-2">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <span className="font-medium">Placement:</span> {placement}
                </div>
                {placementOptions && (
                  <div>
                    <span className="font-medium">Options:</span> {placementOptions}
                  </div>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Instructions */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="text-lg">Como configurar</CardTitle>
        </CardHeader>
        <CardContent>
          <ol className="list-decimal list-inside space-y-2 text-sm">
            <li>Crie uma nova instância WhatsApp com um nome descritivo</li>
            <li>Clique em "Conectar" para gerar o QR Code</li>
            <li>Escaneie o QR Code com seu WhatsApp</li>
            <li>Após conectar, vincule a instância a um canal do Bitrix24</li>
            <li>Repita o processo para cada canal que desejar</li>
          </ol>
        </CardContent>
      </Card>

      {/* Instance Manager */}
      <InstanceManager 
        showLinkOptions={channels.length > 0}
        availableChannels={channels}
        onInstanceSelect={handleInstanceLinked}
      />

      {/* Available Channels */}
      {channels.length > 0 && (
        <Card className="mt-6">
          <CardHeader>
            <CardTitle>Canais Disponíveis no Bitrix24</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {channels.map((channel) => (
                <Card key={channel.id} className="p-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <h4 className="font-medium">{channel.name}</h4>
                      <p className="text-sm text-muted-foreground">ID: {channel.id}</p>
                    </div>
                    <Badge variant="secondary">Canal</Badge>
                  </div>
                </Card>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
