import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { 
  CheckCircle, 
  AlertCircle, 
  Loader2, 
  ArrowRight, 
  ArrowLeft,
  ExternalLink,
  QrCode,
  MessageSquare,
  Link as LinkIcon
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useEvolutionQr } from "@/hooks/useEvolutionQr";
import { Transport } from "@/core/transport";
import { Evolution } from "@/services/evolution";
import { bitrixManager } from "@/services/bitrixManager";
import { evolutionClient } from "@/services/evolutionClient";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import ConnectBitrixButton from "@/components/bitrix/ConnectBitrixButton";
import { getBitrixAuthStatus } from "@/services/bitrixAuthStatus";
import type { EvoResponse, EvoConnectData } from "@/types/evolution";

type WizardStep = 1 | 2 | 3 | 4;

interface WizardState {
  currentStep: WizardStep;
  bitrix: {
    connected: boolean;
    portalUrl: string;
    tokenValid: boolean;
  };
  connector: {
    registered: boolean;
    published: boolean;
    activated: boolean;
    lineId?: string;
  };
  evolution: {
    status: "unknown" | "connecting" | "connected";
    connected: boolean;
    instanceName: string;
    qrCode: string | null;
  };
  binding: {
    completed: boolean;
    tested: boolean;
  };
}

export function Wizard() {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [showQrModal, setShowQrModal] = useState(false);
  const [state, setState] = useState<WizardState>({
    currentStep: 1,
    bitrix: {
      connected: false,
      portalUrl: "",
      tokenValid: false,
    },
    connector: {
      registered: false,
      published: false,
      activated: false,
    },
    evolution: {
      status: "unknown" as "unknown" | "connecting" | "connected",
      connected: false,
      instanceName: "",
      qrCode: null,
    },
    binding: {
      completed: false,
      tested: false,
    },
  });

  // Evolution QR polling hook - use line ID if available
  const instanceName = state.evolution.instanceName || (state.connector.lineId ? `evo_line_${state.connector.lineId}` : "evo_line_1");
  const { qr, status: qrStatus, running, start, stop } = useEvolutionQr(
    async () => await evolutionClient.getQr(state.connector.lineId || "1", instanceName),
    instanceName
  );

  // Monitor QR status and handle connection changes
  useEffect(() => {
    if (!qrStatus) return;
    const s = (qrStatus?.state || qrStatus?.status || "").toString().toLowerCase();
    if (["connected","open","ready","online"].includes(s)) {
      setState(prev => ({ ...prev, evolution: { ...prev.evolution, status: "connected", connected: true, qrCode: null } }));
      setShowQrModal(false);
      stop();
      toast({ title: "WhatsApp conectado!", description: "Instância Evolution conectada com sucesso" });
    }
  }, [qrStatus, stop, toast]);

  // Check initial Bitrix connection status
  useEffect(() => {
    const checkInitialBitrixStatus = async () => {
      try {
        const status = await getBitrixAuthStatus();
        if (status.isConnected) {
          setState(prev => ({
            ...prev,
            bitrix: {
              ...prev.bitrix,
              connected: status.isConnected,
              tokenValid: status.hasValidTokens,
              portalUrl: status.portalUrl || prev.bitrix.portalUrl,
            },
          }));
        }
      } catch (error) {
        console.error("Failed to check initial Bitrix status:", error);
      }
    };

    checkInitialBitrixStatus();
  }, []);

  const progress = ((state.currentStep - 1) / 3) * 100;

  // Step 1: Connect Bitrix
  const handleBitrixConnect = async () => {
    if (!state.bitrix.portalUrl.trim()) {
      toast({
        title: "Erro",
        description: "Informe a URL do portal Bitrix24",
        variant: "destructive",
      });
      return;
    }

    setLoading(true);
    try {
      const { auth_url } = await bitrixManager.startOAuth(state.bitrix.portalUrl);
      
      const popup = window.open(auth_url, "bitrix-oauth", "width=600,height=700");
      
      const handleMessage = (event: MessageEvent) => {
        if (event.data?.source === "bitrix-oauth") {
          if (event.data.ok) {
            setState(prev => ({
              ...prev,
              bitrix: {
                ...prev.bitrix,
                connected: true,
                tokenValid: true,
              },
            }));
            toast({
              title: "Conectado!",
              description: "Bitrix24 conectado com sucesso",
            });
            popup?.close();
          } else {
            toast({
              title: "Erro na conexão",
              description: event.data.reason || "Falha no OAuth",
              variant: "destructive",
            });
          }
          window.removeEventListener("message", handleMessage);
        }
      };

      window.addEventListener("message", handleMessage);
    } catch (error) {
      console.error("OAuth error:", error);
      toast({
        title: "Erro",
        description: error instanceof Error ? error.message : "Erro ao conectar",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  // Step 2: Register Connector
  const handleConnectorSetup = async () => {
    setLoading(true);
    try {
      // 1) Registrar conector
      await bitrixManager.registerConnector({
        connector: "evolution_whatsapp",
        name: "EvoWhats",
        chatGroup: "N",
      });

      setState(prev => ({
        ...prev,
        connector: { ...prev.connector, registered: true },
      }));

      // 2) Obter linhas existentes (NÃO criar linha)
      const linesResult = await bitrixManager.getLines();
      const lines: any[] = linesResult.result?.result || linesResult.result || linesResult.lines || [];
      if (!Array.isArray(lines) || lines.length === 0) {
        toast({
          title: "Nenhuma linha encontrada no Bitrix",
          description: "Crie a linha em 'Contact Center → Open Lines' no Bitrix24 e retorne para continuar.",
          variant: "destructive",
        });
        return;
      }
      
      // Usar a primeira linha disponível
      const first = lines[0];
      const lineId = String(first.ID || first.id || first.line_id || first.LINE_ID || "");
      if (!lineId) {
        throw new Error("Não foi possível identificar o ID da linha existente.");
      }

      setState(prev => ({
        ...prev,
        connector: { ...prev.connector, lineId },
      }));

      // 3) Publicar dados do conector (metadados)
      await bitrixManager.publishConnectorData({
        connector: "evolution_whatsapp",
        line: lineId,
        data: {
          TITLE: "EvoWhats",
          DESCRIPTION: "Integração WhatsApp via Evolution API",
          ICON: "https://cdn-icons-png.flaticon.com/512/174/174879.png",
        },
      });

      setState(prev => ({
        ...prev,
        connector: { ...prev.connector, published: true },
      }));

      // 4) Ativar conector na linha
      await bitrixManager.activateConnector({
        connector: "evolution_whatsapp",
        line: lineId,
        active: true,
      });

      setState(prev => ({
        ...prev,
        connector: { ...prev.connector, activated: true },
      }));

      toast({
        title: "Conector configurado!",
        description: "Conector registrado, publicado e ativado no Bitrix24",
      });
    } catch (error) {
      console.error("Connector setup error:", error);
      toast({
        title: "Erro",
        description: error instanceof Error ? error.message : "Erro ao configurar conector",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  // Step 3: Connect Evolution with robust QR handling
  const handleEvolutionConnect = async () => {
    if (!state.connector.lineId) {
      toast({ title: "Erro", description: "Configure o conector Bitrix primeiro", variant: "destructive" });
      return;
    }
    setShowQrModal(true);
    toast({ title: "Conectando", description: "Instância pronta. Gerando QR..." });
    try {
      const result: EvoResponse<EvoConnectData> = await evolutionClient.connectWhatsapp(state.connector.lineId, instanceName);
      if (!result.success) {
        const trace = (result as any).data?.trace;
        const detail = result.error || result.message || JSON.stringify(result, null, 2);
        console.error("[connectWhatsapp] fail object:", result);
        console.error("[connectWhatsapp] fail string:", detail);
        if (trace) { console.groupCollapsed("[connectWhatsapp] trace"); console.log(trace); console.groupEnd?.(); }
        toast({
          title: result.code || "Falha na conexão",
          description: detail,
          variant: "destructive",
        });
        setShowQrModal(false);
        return;
      }
      setState(prev => ({ ...prev, evolution: { ...prev.evolution, instanceName, status: "connecting", qrCode: result.data?.qr_base64 ?? null } }));
      if (result.data?.qr_base64) toast({ title: "QR Gerado", description: "Escaneie o QR code para conectar o WhatsApp" });
      start(); // inicia polling
    } catch (error: any) {
      console.error("Erro ao conectar Evolution:", error);
      toast({ title: "Erro na Conexão", description: error?.message ?? "Falha ao conectar com WhatsApp", variant: "destructive" });
      setShowQrModal(false);
    }
  };

  // Step 4: Create Binding and Test
  const handleBindingAndTest = async () => {
    if (!state.connector.lineId || !state.evolution.instanceName) {
      toast({
        title: "Erro",
        description: "Linha do Bitrix ou instância Evolution não disponível",
        variant: "destructive",
      });
      return;
    }

    setLoading(true);
    try {
      // Create binding using evolutionClient
      await evolutionClient.bindOpenLine(state.connector.lineId, state.evolution.instanceName);

      setState(prev => ({
        ...prev,
        binding: { ...prev.binding, completed: true },
      }));

      // Test message sending using evolutionClient
      const testResult = await evolutionClient.testSend(
        state.connector.lineId,
        "5511999999999", // Test number
        "Teste de integração EvoWhats ✅"
      );

      setState(prev => ({
        ...prev,
        binding: { ...prev.binding, tested: testResult.success || false },
      }));

      toast({
        title: testResult.success ? "Integração completa!" : "Binding criado",
        description: testResult.success 
          ? "Integração configurada e testada com sucesso" 
          : "Binding criado. Teste de mensagem falhou.",
        variant: testResult.success ? "default" : "destructive",
      });
    } catch (error) {
      console.error("Binding error:", error);
      toast({
        title: "Erro",
        description: error instanceof Error ? error.message : "Erro ao criar binding",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const canProceed = (step: WizardStep): boolean => {
    switch (step) {
      case 1: return state.bitrix.connected && state.bitrix.tokenValid;
      case 2: return state.connector.registered && state.connector.published;
      case 3: return state.evolution.connected;
      case 4: return state.binding.completed;
      default: return false;
    }
  };

  const nextStep = () => {
    if (state.currentStep < 4 && canProceed(state.currentStep)) {
      setState(prev => ({ ...prev, currentStep: (prev.currentStep + 1) as WizardStep }));
    }
  };

  const prevStep = () => {
    if (state.currentStep > 1) {
      setState(prev => ({ ...prev, currentStep: (prev.currentStep - 1) as WizardStep }));
    }
  };

  return (
    <div className="container mx-auto py-8 space-y-6">
      <div className="text-center space-y-2">
        <h1 className="text-3xl font-bold">Configuração EvoWhats</h1>
        <p className="text-muted-foreground">
          Configure sua integração WhatsApp + Bitrix24 em 4 passos simples
        </p>
      </div>

      <div className="max-w-4xl mx-auto space-y-6">
        <Progress value={progress} className="w-full" />
        
        <Tabs value={String(state.currentStep)} className="w-full">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="1" disabled={state.currentStep !== 1}>
              <CheckCircle className={`h-4 w-4 mr-2 ${state.bitrix.connected ? 'text-green-500' : ''}`} />
              Bitrix24
            </TabsTrigger>
            <TabsTrigger value="2" disabled={state.currentStep !== 2}>
              <CheckCircle className={`h-4 w-4 mr-2 ${state.connector.activated ? 'text-green-500' : ''}`} />
              Conector
            </TabsTrigger>
            <TabsTrigger value="3" disabled={state.currentStep !== 3}>
              <CheckCircle className={`h-4 w-4 mr-2 ${state.evolution.connected ? 'text-green-500' : ''}`} />
              Evolution
            </TabsTrigger>
            <TabsTrigger value="4" disabled={state.currentStep !== 4}>
              <CheckCircle className={`h-4 w-4 mr-2 ${state.binding.tested ? 'text-green-500' : ''}`} />
              Teste
            </TabsTrigger>
          </TabsList>

          {/* Step 1: Bitrix Connection */}
          <TabsContent value="1">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <LinkIcon className="h-5 w-5" />
                  Conectar Bitrix24
                </CardTitle>
                <CardDescription>
                  Conecte sua conta Bitrix24 para autorizar a integração
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <ConnectBitrixButton 
                  portalUrl={state.bitrix.portalUrl}
                  onPortalUrlChange={(url) => setState(prev => ({
                    ...prev,
                    bitrix: { ...prev.bitrix, portalUrl: url }
                  }))}
                  onConnectionChange={(connected, tokenValid) => setState(prev => ({
                    ...prev,
                    bitrix: { ...prev.bitrix, connected, tokenValid }
                  }))}
                />

                {state.bitrix.connected && (
                  <Alert>
                    <CheckCircle className="h-4 w-4" />
                    <AlertDescription>
                      Bitrix24 conectado com sucesso! Token válido.
                    </AlertDescription>
                  </Alert>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Step 2: Connector Setup */}
          <TabsContent value="2">
            <Card>
              <CardHeader>
                <CardTitle>Configurar Conector</CardTitle>
                <CardDescription>
                  Registre e ative o conector WhatsApp no Bitrix24
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span>Registrar conector</span>
                    <Badge variant={state.connector.registered ? "default" : "secondary"}>
                      {state.connector.registered ? "Completo" : "Pendente"}
                    </Badge>
                  </div>
                  <div className="flex items-center justify-between">
                    <span>Publicar dados</span>
                    <Badge variant={state.connector.published ? "default" : "secondary"}>
                      {state.connector.published ? "Completo" : "Pendente"}
                    </Badge>
                  </div>
                  <div className="flex items-center justify-between">
                    <span>Ativar conector</span>
                    <Badge variant={state.connector.activated ? "default" : "secondary"}>
                      {state.connector.activated ? "Completo" : "Pendente"}
                    </Badge>
                  </div>
                </div>

                {state.connector.lineId && (
                  <Alert>
                    <CheckCircle className="h-4 w-4" />
                    <AlertDescription>
                      Linha criada/encontrada: {state.connector.lineId}
                    </AlertDescription>
                  </Alert>
                )}

                <Button 
                  onClick={handleConnectorSetup} 
                  disabled={loading}
                  className="w-full"
                >
                  {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Configurar Conector
                </Button>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Step 3: Evolution Connection */}
          <TabsContent value="3">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <QrCode className="h-5 w-5" />
                  Conectar WhatsApp
                </CardTitle>
                <CardDescription>
                  Conecte sua instância WhatsApp via Evolution API
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="instance-name">Nome da Instância</Label>
                  <Input
                    id="instance-name"
                    placeholder="evo_minha_instancia"
                    value={state.evolution.instanceName || ""}
                    onChange={(e) => setState(prev => ({
                      ...prev,
                      evolution: { ...prev.evolution, instanceName: e.target.value }
                    }))}
                  />
                </div>

                <div className="flex items-center justify-between">
                  <span>Status da conexão</span>
                  <Badge 
                    variant={state.evolution.connected ? "default" : "secondary"}
                  >
                    {state.evolution.status}
                  </Badge>
                </div>

                {state.evolution.qrCode && !state.evolution.connected && (
                  <div className="text-center space-y-2">
                    <p className="text-sm text-muted-foreground">
                      Escaneie o QR Code com seu WhatsApp
                    </p>
                    <div className="flex justify-center">
                      <img 
                        src={state.evolution.qrCode} 
                        alt="QR Code WhatsApp" 
                        className="max-w-xs"
                      />
                    </div>
                  </div>
                )}

                {state.evolution.connected && (
                  <Alert>
                    <CheckCircle className="h-4 w-4" />
                    <AlertDescription>
                      WhatsApp conectado com sucesso!
                    </AlertDescription>
                  </Alert>
                )}

                <Button 
                  onClick={handleEvolutionConnect} 
                  disabled={loading || !state.evolution.instanceName}
                  className="w-full"
                >
                  {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  {state.evolution.connected ? "Reconectar" : "Conectar WhatsApp"}
                </Button>

                <Button
                  variant="secondary"
                  onClick={async () => {
                    try {
                      const diag = await evolutionClient.diag();
                      console.log("[evolution diag]", diag);
                      const env = (diag?.data && (diag as any).data.env) || (diag as any).env; // compat
                      const msg = env
                        ? `EVOLUTION_BASE_URL: ${env.base_set ? "OK" : "FALTANDO"} | API_KEY: ${env.key_set ? "OK" : "FALTANDO"}`
                        : JSON.stringify(diag);
                      toast({ title: "Diagnóstico Evolution", description: msg });
                    } catch (e: any) {
                      toast({ title: "Diag falhou", description: e?.message || String(e), variant: "destructive" });
                    }
                  }}
                  className="w-full"
                >
                  Diagnóstico Evolution
                </Button>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Step 4: Binding and Test */}
          <TabsContent value="4">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <MessageSquare className="h-5 w-5" />
                  Vincular e Testar
                </CardTitle>
                <CardDescription>
                  Vincule a linha Bitrix com a instância WhatsApp e teste o envio
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span>Linha Bitrix: {state.connector.lineId}</span>
                    <Badge variant="outline">Pronto</Badge>
                  </div>
                  <div className="flex items-center justify-between">
                    <span>Instância: {state.evolution.instanceName}</span>
                    <Badge variant="outline">Conectada</Badge>
                  </div>
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span>Vínculo criado</span>
                    <Badge variant={state.binding.completed ? "default" : "secondary"}>
                      {state.binding.completed ? "Completo" : "Pendente"}
                    </Badge>
                  </div>
                  <div className="flex items-center justify-between">
                    <span>Teste de mensagem</span>
                    <Badge variant={state.binding.tested ? "default" : "secondary"}>
                      {state.binding.tested ? "Sucesso" : "Pendente"}
                    </Badge>
                  </div>
                </div>

                {state.binding.completed && state.binding.tested && (
                  <Alert>
                    <CheckCircle className="h-4 w-4" />
                    <AlertDescription>
                      Integração configurada e testada com sucesso! 🎉
                    </AlertDescription>
                  </Alert>
                )}

                <Button 
                  onClick={handleBindingAndTest} 
                  disabled={loading}
                  className="w-full"
                >
                  {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Vincular e Testar
                </Button>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        {/* Navigation */}
        <div className="flex justify-between">
          <Button 
            variant="outline" 
            onClick={prevStep} 
            disabled={state.currentStep === 1}
          >
            <ArrowLeft className="mr-2 h-4 w-4" />
            Anterior
          </Button>
          
          <Button 
            onClick={nextStep} 
            disabled={state.currentStep === 4 || !canProceed(state.currentStep)}
          >
            Próximo
            <ArrowRight className="ml-2 h-4 w-4" />
          </Button>
        </div>

        {/* QR Modal */}
        <Dialog open={showQrModal} onOpenChange={(open) => {
          setShowQrModal(open);
          if (!open) stop();
        }}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Conectar WhatsApp</DialogTitle>
              <DialogDescription>
                {qr ? "Escaneie o QR code com seu WhatsApp" : "Gerando QR code..."}
              </DialogDescription>
            </DialogHeader>
            <div className="flex flex-col items-center space-y-4">
              {qr ? (
                <div className="flex flex-col items-center space-y-2">
                  <img 
                    src={`data:image/png;base64,${qr}`}
                    alt="QR Code WhatsApp"
                    className="w-64 h-64 border rounded"
                  />
                  <a
                    href={`data:image/png;base64,${qr}`}
                    download="qr-whatsapp.png"
                    className="text-sm text-blue-600 hover:underline"
                  >
                    Baixar QR Code
                  </a>
                </div>
              ) : (
                <div className="flex flex-col items-center space-y-2">
                  <div className="w-64 h-64 border rounded flex items-center justify-center">
                    {running ? (
                      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
                    ) : (
                      <p className="text-muted-foreground">Aguardando QR...</p>
                    )}
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {running ? "Gerando QR... aguarde" : "QR não disponível"}
                  </p>
                </div>
              )}
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}