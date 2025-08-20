
import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { 
  Settings, 
  Plus, 
  Power, 
  CheckCircle, 
  AlertCircle, 
  RefreshCw,
  ExternalLink,
  Zap
} from "lucide-react";

type OpenLine = {
  ID: string;
  NAME: string;
  ACTIVE: string;
  CAN_JOIN: string;
};

type ConnectorStatus = {
  registered: boolean;
  published: boolean;
  tilePlaced: boolean;
  lines: OpenLine[];
  activeConnections: string[];
};

export default function BitrixOpenChannelsConfig() {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [connectorStatus, setConnectorStatus] = useState<ConnectorStatus>({
    registered: false,
    published: false,
    tilePlaced: false,
    lines: [],
    activeConnections: []
  });

  const [connectorConfig, setConnectorConfig] = useState({
    name: "WhatsApp (Evolution)",
    icon: "https://bitrix24public.com/maxsystem.bitrix24.com.br/docs/pub/6073291c3d77400547b99aeecc479ab3/showFile/?&token=e4lvaxqwjgz1",
    connectorId: "evolution.whatsapp"
  });

  const [newLineName, setNewLineName] = useState("WhatsApp - Evolution");

  const loadConnectorStatus = async () => {
    setLoading(true);
    try {
      // Carregar status do conector via API
      const response = await supabase.functions.invoke('bitrix-openlines-manager', {
        body: { action: 'get_status' }
      });

      if (response.data?.success) {
        setConnectorStatus(response.data.status);
      }
    } catch (error) {
      console.error("[OpenChannels] Erro ao carregar status:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadConnectorStatus();
  }, []);

  const handleRegisterConnector = async () => {
    setLoading(true);
    try {
      const response = await supabase.functions.invoke('bitrix-openlines-manager', {
        body: {
          action: 'register_connector',
          connector: connectorConfig.connectorId,
          name: connectorConfig.name,
          icon: connectorConfig.icon,
          chatGroup: "N"
        }
      });

      if (response.data?.success) {
        toast({
          title: "Conector registrado!",
          description: "Conector WhatsApp registrado no Bitrix24 com sucesso.",
        });
        await loadConnectorStatus();
      } else {
        throw new Error(response.data?.error || "Falha ao registrar conector");
      }
    } catch (error) {
      console.error("[OpenChannels] Erro ao registrar conector:", error);
      toast({
        title: "Erro ao registrar",
        description: "Verifique se os escopos imopenlines, imconnector e im estão configurados no OAuth.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handlePublishConnectorData = async () => {
    setLoading(true);
    try {
      const response = await supabase.functions.invoke('bitrix-openlines-manager', {
        body: {
          action: 'publish_connector_data',
          connector: connectorConfig.connectorId,
          data: {
            name: connectorConfig.name,
            url: window.location.origin,
            url_im: `${window.location.origin}/chat`,
            helpdesk: `${window.location.origin}/help`
          }
        }
      });

      if (response.data?.success) {
        toast({
          title: "Dados publicados!",
          description: "Dados do conector atualizados no Bitrix24.",
        });
        await loadConnectorStatus();
      } else {
        throw new Error(response.data?.error || "Falha ao publicar dados");
      }
    } catch (error) {
      console.error("[OpenChannels] Erro ao publicar dados:", error);
      toast({
        title: "Erro ao publicar",
        description: "Não foi possível atualizar os dados do conector.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleAddToContactCenter = async () => {
    setLoading(true);
    try {
      const response = await supabase.functions.invoke('bitrix-openlines-manager', {
        body: {
          action: 'add_to_contact_center',
          placement: 'CONTACT_CENTER',
          handlerUrl: `${window.location.origin}/settings`
        }
      });

      if (response.data?.success) {
        toast({
          title: "Tile adicionado!",
          description: "Conector agora aparece no Contact Center do Bitrix24.",
        });
        await loadConnectorStatus();
      } else {
        throw new Error(response.data?.error || "Falha ao adicionar tile");
      }
    } catch (error) {
      console.error("[OpenChannels] Erro ao adicionar tile:", error);
      toast({
        title: "Erro ao adicionar tile",
        description: "Verifique se o escopo 'placement' está configurado no OAuth.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleCreateLine = async () => {
    if (!newLineName.trim()) {
      toast({
        title: "Nome obrigatório",
        description: "Informe o nome da nova linha.",
        variant: "destructive",
      });
      return;
    }

    setLoading(true);
    try {
      const response = await supabase.functions.invoke('bitrix-openlines-manager', {
        body: {
          action: 'create_line',
          name: newLineName.trim()
        }
      });

      if (response.data?.success) {
        toast({
          title: "Linha criada!",
          description: `Linha "${newLineName}" criada com sucesso.`,
        });
        setNewLineName("");
        await loadConnectorStatus();
      } else {
        throw new Error(response.data?.error || "Falha ao criar linha");
      }
    } catch (error) {
      console.error("[OpenChannels] Erro ao criar linha:", error);
      toast({
        title: "Erro ao criar linha",
        description: "Não foi possível criar a nova linha.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleActivateConnector = async (lineId: string, lineName: string) => {
    setLoading(true);
    try {
      const response = await supabase.functions.invoke('bitrix-openlines-manager', {
        body: {
          action: 'activate_connector',
          connector: connectorConfig.connectorId,
          line: lineId,
          active: "Y"
        }
      });

      if (response.data?.success) {
        toast({
          title: "Conector ativado!",
          description: `Conector ativado na linha "${lineName}".`,
        });
        await loadConnectorStatus();
      } else {
        throw new Error(response.data?.error || "Falha ao ativar conector");
      }
    } catch (error) {
      console.error("[OpenChannels] Erro ao ativar conector:", error);
      toast({
        title: "Erro ao ativar",
        description: "Não foi possível ativar o conector na linha.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card className="p-6 space-y-6">
      <div>
        <h3 className="text-lg font-semibold flex items-center gap-2">
          <Zap className="h-5 w-5 text-blue-500" />
          Open Channels (Conector REST Oficial)
        </h3>
        <p className="text-sm text-muted-foreground mt-1">
          Registre um conector REST no Bitrix24 para aparecer como tile no Contact Center.
          Requer escopos: imopenlines, imconnector, im, placement.
        </p>
      </div>

      {/* Status Cards */}
      <div className="grid md:grid-cols-3 gap-4">
        <Card className="p-4">
          <div className="flex items-center gap-2">
            {connectorStatus.registered ? (
              <CheckCircle className="h-4 w-4 text-green-500" />
            ) : (
              <AlertCircle className="h-4 w-4 text-orange-500" />
            )}
            <span className="text-sm font-medium">
              Conector {connectorStatus.registered ? 'Registrado' : 'Não Registrado'}
            </span>
          </div>
        </Card>

        <Card className="p-4">
          <div className="flex items-center gap-2">
            {connectorStatus.published ? (
              <CheckCircle className="h-4 w-4 text-green-500" />
            ) : (
              <AlertCircle className="h-4 w-4 text-orange-500" />
            )}
            <span className="text-sm font-medium">
              Dados {connectorStatus.published ? 'Publicados' : 'Não Publicados'}
            </span>
          </div>
        </Card>

        <Card className="p-4">
          <div className="flex items-center gap-2">
            {connectorStatus.tilePlaced ? (
              <CheckCircle className="h-4 w-4 text-green-500" />
            ) : (
              <AlertCircle className="h-4 w-4 text-orange-500" />
            )}
            <span className="text-sm font-medium">
              Tile {connectorStatus.tilePlaced ? 'Adicionado' : 'Não Adicionado'}
            </span>
          </div>
        </Card>
      </div>

      {/* Configuração do Conector */}
      <div className="space-y-4">
        <h4 className="font-medium">1. Registrar Conector</h4>
        
        <div className="grid md:grid-cols-2 gap-3">
          <div>
            <Label htmlFor="connector-name">Nome do Conector</Label>
            <Input
              id="connector-name"
              value={connectorConfig.name}
              onChange={(e) => setConnectorConfig({...connectorConfig, name: e.target.value})}
            />
          </div>
          <div>
            <Label htmlFor="connector-id">ID do Conector</Label>
            <Input
              id="connector-id"
              value={connectorConfig.connectorId}
              onChange={(e) => setConnectorConfig({...connectorConfig, connectorId: e.target.value})}
            />
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button 
            onClick={handleRegisterConnector} 
            disabled={loading}
            variant={connectorStatus.registered ? "outline" : "default"}
          >
            <Settings className="h-4 w-4 mr-2" />
            {connectorStatus.registered ? "Re-registrar" : "Registrar Conector"}
          </Button>

          <Button 
            onClick={handlePublishConnectorData} 
            disabled={loading || !connectorStatus.registered}
            variant={connectorStatus.published ? "outline" : "default"}
          >
            <ExternalLink className="h-4 w-4 mr-2" />
            Publicar Dados
          </Button>

          <Button 
            onClick={handleAddToContactCenter} 
            disabled={loading || !connectorStatus.registered}
            variant={connectorStatus.tilePlaced ? "outline" : "default"}
          >
            <Plus className="h-4 w-4 mr-2" />
            Adicionar ao Contact Center
          </Button>
        </div>
      </div>

      {/* Gerenciamento de Linhas */}
      <div className="space-y-4">
        <h4 className="font-medium">2. Gerenciar Linhas (Open Lines)</h4>
        
        <div className="flex gap-2">
          <Input
            placeholder="Nome da nova linha"
            value={newLineName}
            onChange={(e) => setNewLineName(e.target.value)}
          />
          <Button onClick={handleCreateLine} disabled={loading}>
            <Plus className="h-4 w-4 mr-2" />
            Criar Linha
          </Button>
        </div>

        {connectorStatus.lines.length > 0 && (
          <div className="space-y-2">
            <Label>Linhas Disponíveis:</Label>
            {connectorStatus.lines.map((line) => (
              <Card key={line.ID} className="p-3">
                <div className="flex items-center justify-between">
                  <div>
                    <span className="font-medium">{line.NAME}</span>
                    <div className="flex items-center gap-2 mt-1">
                      <Badge variant={line.ACTIVE === 'Y' ? 'default' : 'secondary'}>
                        {line.ACTIVE === 'Y' ? 'Ativa' : 'Inativa'}
                      </Badge>
                      {connectorStatus.activeConnections.includes(line.ID) && (
                        <Badge variant="outline">
                          <Power className="h-3 w-3 mr-1" />
                          Conector Ativo
                        </Badge>
                      )}
                    </div>
                  </div>
                  
                  {!connectorStatus.activeConnections.includes(line.ID) && (
                    <Button
                      size="sm"
                      onClick={() => handleActivateConnector(line.ID, line.NAME)}
                      disabled={loading || !connectorStatus.registered}
                    >
                      <Power className="h-4 w-4 mr-2" />
                      Ativar Conector
                    </Button>
                  )}
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>

      <div className="flex justify-between pt-4">
        <Button variant="outline" onClick={loadConnectorStatus} disabled={loading}>
          <RefreshCw className="h-4 w-4 mr-2" />
          {loading ? "Atualizando..." : "Atualizar Status"}
        </Button>

        <div className="text-xs text-muted-foreground">
          <p>⚠️ Open Channels requer conector REST com OAuth</p>
          <p>Não funciona via webhook simples</p>
        </div>
      </div>
    </Card>
  );
}
