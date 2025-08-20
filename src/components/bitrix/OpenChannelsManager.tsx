import { useState, useEffect } from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { 
  Settings, 
  CheckCircle, 
  XCircle, 
  Plus, 
  Play, 
  Pause,
  MessageSquare,
  Zap,
  AlertTriangle
} from "lucide-react";
import {
  getOpenChannelsStatus,
  registerConnector,
  publishConnectorData,
  addToContactCenter,
  createLine,
  activateConnector,
  type ConnectorStatus,
} from "@/services/bitrixOpenChannelsManager";
import { getBitrixAuthStatus } from "@/services/bitrixAuthStatus";

const OpenChannelsManager = () => {
  const { toast } = useToast();
  const [status, setStatus] = useState<ConnectorStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [newLineName, setNewLineName] = useState("");
  const [isConnected, setIsConnected] = useState(false);

  const CONNECTOR_ID = "evolution_whatsapp";
  const CONNECTOR_NAME = "EvoWhats";
  const CONNECTOR_ICON = "data:image/png;base64,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";
  const PLACEMENT = "CONTACT_CENTER";
  const HANDLER_URL = "https://evowhats-61.lovable.app";

  useEffect(() => {
    checkConnection();
  }, []);

  const checkConnection = async () => {
    try {
      const authStatus = await getBitrixAuthStatus();
      const connected = authStatus.isConnected && authStatus.hasValidTokens;
      setIsConnected(connected);
      
      if (connected) {
        await loadStatus();
      }
    } catch (error) {
      console.error('Error checking connection:', error);
      setIsConnected(false);
    }
  };

  const loadStatus = async () => {
    if (!isConnected) return;
    
    try {
      setLoading(true);
      const currentStatus = await getOpenChannelsStatus();
      setStatus(currentStatus);
    } catch (error: any) {
      console.error('Error loading status:', error);
      toast({
        title: "Erro ao carregar status",
        description: error.message || "Falha ao verificar status do Open Channels",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleRegisterConnector = async () => {
    try {
      setLoading(true);
      await registerConnector({
        connector: CONNECTOR_ID,
        name: CONNECTOR_NAME,
        icon: CONNECTOR_ICON,
        chatGroup: "N",
      });
      
      toast({
        title: "Conector registrado!",
        description: "O conector EvoWhats foi registrado com sucesso.",
      });
      
      await loadStatus();
    } catch (error: any) {
      console.error('Register connector error:', error);
      toast({
        title: "Erro ao registrar",
        description: error.message || "Falha ao registrar conector",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handlePublishData = async () => {
    try {
      setLoading(true);
      await publishConnectorData({
        connector: CONNECTOR_ID,
        data: {
          name: CONNECTOR_NAME,
          icon: CONNECTOR_ICON,
          description: "Integração WhatsApp via Evolution API",
          webhook_url: "https://twqcybbjyhcokcrdfgkk.functions.supabase.co/bitrix-openlines-webhook",
        },
      });
      
      toast({
        title: "Dados publicados!",
        description: "Os dados do conector foram publicados no Bitrix24.",
      });
      
      await loadStatus();
    } catch (error: any) {
      toast({
        title: "Erro ao publicar",
        description: error.message || "Falha ao publicar dados",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleAddToContactCenter = async () => {
    try {
      setLoading(true);
      await addToContactCenter({
        placement: PLACEMENT,
        handlerUrl: HANDLER_URL,
      });
      
      toast({
        title: "Tile adicionado!",
        description: "O tile foi adicionado ao Contact Center.",
      });
      
      await loadStatus();
    } catch (error: any) {
      toast({
        title: "Erro ao adicionar tile",
        description: error.message || "Falha ao adicionar ao Contact Center",
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
        description: "Digite um nome para a nova linha.",
        variant: "destructive",
      });
      return;
    }

    try {
      setLoading(true);
      await createLine(newLineName);
      
      toast({
        title: "Linha criada!",
        description: `A linha "${newLineName}" foi criada com sucesso.`,
      });
      
      setNewLineName("");
      await loadStatus();
    } catch (error: any) {
      toast({
        title: "Erro ao criar linha",
        description: error.message || "Falha ao criar linha",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleActivateConnector = async (lineId: string, activate: boolean) => {
    try {
      setLoading(true);
      await activateConnector({
        connector: CONNECTOR_ID,
        line: lineId,
        active: activate,
      });
      
      toast({
        title: activate ? "Conector ativado!" : "Conector desativado!",
        description: `O conector foi ${activate ? "ativado" : "desativado"} na linha.`,
      });
      
      await loadStatus();
    } catch (error: any) {
      toast({
        title: "Erro na ativação",
        description: error.message || "Falha ao alterar status do conector",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const StatusBadge = ({ condition, trueText, falseText }: { 
    condition: boolean; 
    trueText: string; 
    falseText: string; 
  }) => (
    <Badge variant={condition ? "default" : "secondary"} className="flex items-center gap-1">
      {condition ? (
        <CheckCircle className="h-3 w-3 text-green-500" />
      ) : (
        <XCircle className="h-3 w-3 text-red-500" />
      )}
      {condition ? trueText : falseText}
    </Badge>
  );

  if (!isConnected) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <MessageSquare className="h-5 w-5" />
            Gerenciador de Open Channels
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8 space-y-4">
            <AlertTriangle className="h-12 w-12 text-orange-500 mx-auto" />
            <div>
              <h3 className="font-medium">Conexão Bitrix24 necessária</h3>
              <p className="text-sm text-muted-foreground mt-1">
                Conecte-se ao Bitrix24 via OAuth na aba "Bitrix24" para usar os Open Channels.
              </p>
            </div>
            <Button onClick={checkConnection} variant="outline">
              <Settings className="h-4 w-4 mr-2" />
              Verificar Conexão
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <MessageSquare className="h-5 w-5" />
          Gerenciador de Open Channels
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Status Section */}
        <div className="space-y-4">
          <h3 className="font-medium">Status do Conector</h3>
          {loading ? (
            <p className="text-sm text-muted-foreground">Carregando status...</p>
          ) : status ? (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
              <StatusBadge 
                condition={status.registered} 
                trueText="Registrado" 
                falseText="Não Registrado" 
              />
              <StatusBadge 
                condition={status.published} 
                trueText="Publicado" 
                falseText="Não Publicado" 
              />
              <StatusBadge 
                condition={status.tilePlaced} 
                trueText="Tile Colocado" 
                falseText="Tile Ausente" 
              />
              <StatusBadge 
                condition={status.activeConnections.length > 0} 
                trueText={`${status.activeConnections.length} Ativo(s)`} 
                falseText="Inativo" 
              />
            </div>
          ) : (
            <Button onClick={loadStatus} variant="outline" size="sm">
              <Settings className="h-4 w-4 mr-2" />
              Verificar Status
            </Button>
          )}
        </div>

        {/* Setup Actions */}
        <div className="space-y-4">
          <h3 className="font-medium">Configuração Inicial</h3>
          <div className="flex flex-wrap gap-2">
            <Button
              onClick={handleRegisterConnector}
              disabled={loading || status?.registered}
              variant={status?.registered ? "secondary" : "default"}
            >
              <Zap className="h-4 w-4 mr-2" />
              {status?.registered ? "Conector Registrado" : "1. Registrar Conector"}
            </Button>

            <Button
              onClick={handlePublishData}
              disabled={loading || !status?.registered || status?.published}
              variant={status?.published ? "secondary" : "default"}
            >
              <Settings className="h-4 w-4 mr-2" />
              {status?.published ? "Dados Publicados" : "2. Publicar Dados"}
            </Button>

            <Button
              onClick={handleAddToContactCenter}
              disabled={loading || !status?.published || status?.tilePlaced}
              variant={status?.tilePlaced ? "secondary" : "default"}
            >
              <Plus className="h-4 w-4 mr-2" />
              {status?.tilePlaced ? "Tile Adicionado" : "3. Adicionar Tile"}
            </Button>
          </div>
        </div>

        {/* Lines Management */}
        <div className="space-y-4">
          <h3 className="font-medium">Gerenciar Linhas Open Channels</h3>
          
          {/* Create New Line */}
          <div className="flex gap-2">
            <div className="flex-1">
              <Label htmlFor="line-name">Nova Linha</Label>
              <Input
                id="line-name"
                placeholder="Nome da linha (ex: WhatsApp Vendas)"
                value={newLineName}
                onChange={(e) => setNewLineName(e.target.value)}
              />
            </div>
            <div className="flex items-end">
              <Button onClick={handleCreateLine} disabled={loading || !newLineName.trim()}>
                <Plus className="h-4 w-4 mr-2" />
                Criar Linha
              </Button>
            </div>
          </div>

          {/* Existing Lines */}
          {status?.lines && status.lines.length > 0 && (
            <div className="space-y-2">
              <Label>Linhas Existentes</Label>
              <div className="space-y-2">
                {status.lines.map((line: any) => (
                  <div key={line.ID} className="flex items-center justify-between p-3 border rounded-lg">
                    <div>
                      <p className="font-medium">{line.NAME}</p>
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
                        onClick={() => handleActivateConnector(
                          line.ID, 
                          !status.activeConnections.includes(line.ID)
                        )}
                        disabled={loading || !status?.registered}
                      >
                        {status.activeConnections.includes(line.ID) ? (
                          <>
                            <Pause className="h-3 w-3 mr-1" />
                            Desativar
                          </>
                        ) : (
                          <>
                            <Play className="h-3 w-3 mr-1" />
                            Ativar
                          </>
                        )}
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Instructions */}
        <div className="bg-muted p-4 rounded-lg">
          <h4 className="font-medium mb-2">Ordem de Configuração:</h4>
          <ol className="text-sm space-y-1">
            <li>1. Registrar o conector REST no Bitrix24</li>
            <li>2. Publicar os dados do conector</li>
            <li>3. Adicionar tile ao Contact Center</li>
            <li>4. Criar linhas Open Channels conforme necessário</li>
            <li>5. Ativar o conector nas linhas desejadas</li>
          </ol>
          <p className="text-xs text-muted-foreground mt-2">
            ⚠️ Conector "EvoWhats" com ícone personalizado configurado
          </p>
        </div>
      </CardContent>
    </Card>
  );
};

export default OpenChannelsManager;
