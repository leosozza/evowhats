
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

const OpenChannelsManager = () => {
  const { toast } = useToast();
  const [status, setStatus] = useState<ConnectorStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [newLineName, setNewLineName] = useState("");
  const [isConnected, setIsConnected] = useState(false);

  // Ícone enviado pelo usuário (convertido p/ base64 cru)
  const ICON_PATH = "/lovable-uploads/55b0f757-ec04-4033-9e21-1e94200cf698.png";
  const [connectorIconBase64, setConnectorIconBase64] = useState<string>(""); // manteremos aqui o base64 cru (sem prefixo)

  const CONNECTOR_ID = "evolution_whatsapp";
  const CONNECTOR_NAME = "EvoWhats";
  const PLACEMENT = "CONTACT_CENTER";
  const HANDLER_URL = "https://evowhats-61.lovable.app";

  useEffect(() => {
    checkConnection();
    // Carregar ícone e armazenar como base64 cru
    loadIconBase64(ICON_PATH)
      .then((dataUrlOrRaw) => {
        const raw = dataUrlOrRaw.startsWith("data:")
          ? (dataUrlOrRaw.split(",")[1] || "")
          : dataUrlOrRaw;
        console.log("[OpenChannelsManager] Icon base64 (raw) length:", raw.length);
        setConnectorIconBase64(raw);
      })
      .catch((e) => {
        console.error("[OpenChannelsManager] Failed to load base64 icon:", e);
        toast({
          title: "Aviso",
          description: "Não foi possível carregar o ícone. Usando ícone padrão.",
          variant: "default",
        });
      });
  }, []);

  async function loadIconBase64(path: string): Promise<string> {
    try {
      const resp = await fetch(path);
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const blob = await resp.blob();
      return await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result as string); // retorna data URL
        reader.onerror = reject;
        reader.readAsDataURL(blob);
      });
    } catch (error) {
      console.error("[OpenChannelsManager] Error loading icon:", error);
      // base64 cru mínimo (1x1 px) sem prefixo
      return "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";
    }
  }

  const checkConnection = async () => {
    try {
      const authStatus = await getBitrixAuthStatus();
      const connected = authStatus.isConnected && authStatus.hasValidTokens;
      setIsConnected(connected);
      
      if (connected) {
        await loadStatus(); // não depender do state isConnected dentro de loadStatus
      }
    } catch (error) {
      console.error('Error checking connection:', error);
      setIsConnected(false);
    }
  };

  const loadStatus = async () => {
    // Removemos o early return para evitar depender do timing do setState de isConnected
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
    if (!connectorIconBase64) {
      toast({
        title: "Ícone necessário",
        description: "Aguarde o carregamento do ícone ou tente novamente.",
        variant: "destructive",
      });
      return;
    }

    try {
      setLoading(true);
      await registerConnector({
        connector: CONNECTOR_ID,
        name: CONNECTOR_NAME,
        icon: connectorIconBase64, // base64 cru, sem prefixo
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
    if (!connectorIconBase64) {
      toast({
        title: "Ícone necessário",
        description: "Aguarde o carregamento do ícone ou tente novamente.",
        variant: "destructive",
      });
      return;
    }

    try {
      setLoading(true);
      const appUrl = window.location.origin || HANDLER_URL;

      await publishConnectorData({
        connector: CONNECTOR_ID,
        data: {
          name: CONNECTOR_NAME,
          icon: connectorIconBase64, // base64 cru
          description: "Integração WhatsApp via Evolution API",
          // URLs recomendadas pela doc para aparecer no widget/lista
          url: appUrl,
          url_im: appUrl,
          // Mantém seu webhook (se necessário em outro passo do fluxo)
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

        {/* Instructions */}
        <div className="bg-muted p-4 rounded-lg">
          <h4 className="font-medium mb-2">Ordem de Configuração:</h4>
          <ol className="text-sm space-y-1">
            <li>1. Registrar o conector REST "EvoWhats"</li>
            <li>2. Publicar os dados do conector</li>
            <li>3. Adicionar tile ao Contact Center</li>
            <li>4. Criar linhas Open Channels conforme necessário</li>
            <li>5. Ativar o conector nas linhas desejadas</li>
          </ol>
          <p className="text-xs text-muted-foreground mt-2">
            💡 O ícone do conector é carregado automaticamente em base64 cru, como recomendado pela documentação do Bitrix24.
          </p>
        </div>
      </CardContent>
    </Card>
  );
};

export default OpenChannelsManager;
