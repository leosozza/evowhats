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
  AlertTriangle,
  RefreshCw
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
import LineQrManager from "./LineQrManager";

const OpenChannelsManager = () => {
  const { toast } = useToast();
  const [status, setStatus] = useState<ConnectorStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [newLineName, setNewLineName] = useState("");
  const [isConnected, setIsConnected] = useState(false);

  const CONNECTOR_ID = "evolution_whatsapp";
  
  // Versão baseada na data atual (formato discreto: v2025.01.21)
  const getCurrentVersion = () => {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    return `v${year}.${month}.${day}`;
  };
  
  const CONNECTOR_NAME = `EvoWhats ${getCurrentVersion()}`;
  const PLACEMENT = "CONTACT_CENTER";
  
  // URLs corrigidas - separando tile do Contact Center e handler do conector
  const TILE_HANDLER_URL = "https://evowhats-61.lovable.app/cc/landing";
  const CONNECTOR_HANDLER_URL = "https://evowhats-61.lovable.app/connector/setup";
  const WEBHOOK_URL = "https://twqcybbjyhcokcrdfgkk.functions.supabase.co/bitrix-openlines-webhook";

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
      console.log("[OpenChannelsManager] Registering connector with separate URLs");
      
      await registerConnector({
        connector: CONNECTOR_ID,
        name: CONNECTOR_NAME,
        icon: "", // Será substituído por SVG na edge function
        chatGroup: "N",
      });
      
      toast({
        title: "Conector registrado!",
        description: `O conector ${CONNECTOR_NAME} foi registrado com sucesso.`,
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
          description: `Integração WhatsApp via Evolution API ${getCurrentVersion()}`,
          url: TILE_HANDLER_URL, // URL do tile no Contact Center
          url_im: CONNECTOR_HANDLER_URL, // URL do setup do conector
          webhook_url: WEBHOOK_URL,
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
        handlerUrl: TILE_HANDLER_URL, // URL do tile (não do setup)
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
                Conecte-se ao Bitrix24 via OAuth na aba "Configurações" para usar os Open Channels.
              </p>
            </div>
            <Button onClick={checkConnection} variant="outline">
              <RefreshCw className="h-4 w-4 mr-2" />
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
          <Button onClick={loadStatus} variant="ghost" size="sm" disabled={loading}>
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          </Button>
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
            <Button onClick={loadStatus} variant="outline" size="sm" disabled={loading}>
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
              {status?.registered ? "✓ Conector Registrado" : "1. Registrar Conector"}
            </Button>

            <Button
              onClick={handlePublishData}
              disabled={loading || !status?.registered || status?.published}
              variant={status?.published ? "secondary" : "default"}
            >
              <Settings className="h-4 w-4 mr-2" />
              {status?.published ? "✓ Dados Publicados" : "2. Publicar Dados"}
            </Button>

            <Button
              onClick={handleAddToContactCenter}
              disabled={loading || !status?.published || status?.tilePlaced}
              variant={status?.tilePlaced ? "secondary" : "default"}
            >
              <Plus className="h-4 w-4 mr-2" />
              {status?.tilePlaced ? "✓ Tile Adicionado" : "3. Adicionar Tile"}
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
                disabled={loading}
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

        {/* QR/Conexão por Linha (Evolution) */}
        {status?.lines && status.lines.length > 0 && (
          <div className="space-y-2">
            <h3 className="font-medium">Conexão WhatsApp (Evolution) por Linha</h3>
            <LineQrManager lines={status.lines} />
          </div>
        )}

        {/* Instructions */}
        <div className="bg-muted p-4 rounded-lg">
          <h4 className="font-medium mb-2">URLs Configuradas:</h4>
          <ol className="text-sm space-y-1">
            <li>1. ✅ Tile Contact Center: /cc/landing</li>
            <li>2. ✅ Setup Conector: /connector/setup</li>
            <li>3. ✅ Webhook Bitrix: bitrix-openlines-webhook</li>
            <li>4. ✅ Webhook Evolution: evolution-webhook</li>
            <li>5. 🔄 Mensagens reais via webhook bidirecional</li>
          </ol>
          <div className="text-xs text-muted-foreground mt-2 space-y-1">
            <p>💡 Versão atual: {getCurrentVersion()}</p>
            <p>🎯 Tile: {TILE_HANDLER_URL}</p>
            <p>⚙️ Setup: {CONNECTOR_HANDLER_URL}</p>
            <p>📡 Webhook: {WEBHOOK_URL}</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

export default OpenChannelsManager;
