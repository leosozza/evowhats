import React, { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "@/hooks/use-toast";
import { CheckCircle, Circle, AlertCircle, Loader2 } from "lucide-react";
import { api } from "@/api/provider";
import { isErr } from "@/core/result";
import { supabase } from "@/integrations/supabase/client";
import { listOpenChannelsLines, registerConnector, publishConnectorData, addToContactCenter, activateConnector } from "@/services/bitrixOpenChannelsManager";
import { startBitrixOAuth } from "@/services/bitrixIntegration";

interface SetupStep {
  id: string;
  title: string;
  description: string;
  completed: boolean;
  optional?: boolean;
}

interface SetupWizardProps {
  onComplete?: () => void;
}

export const SetupWizard: React.FC<SetupWizardProps> = ({ onComplete }) => {
  const [currentStep, setCurrentStep] = useState(0);
  const [loading, setLoading] = useState(false);
  const [evolutionConfig, setEvolutionConfig] = useState({
    baseUrl: "",
    apiKey: ""
  });
  const [bitrixConfig, setBitrixConfig] = useState({
    portalUrl: ""
  });

  const [steps, setSteps] = useState<SetupStep[]>([
    {
      id: "evolution-config",
      title: "Configurar Evolution API",
      description: "Configure a URL base e chave da API Evolution",
      completed: false
    },
    {
      id: "evolution-test",
      title: "Testar Evolution API",
      description: "Validar conexão com a Evolution API",
      completed: false
    },
    {
      id: "bitrix-oauth",
      title: "Configurar Bitrix24",
      description: "Autenticar com o Bitrix24",
      completed: false
    },
    {
      id: "bitrix-connector",
      title: "Configurar Conector",
      description: "Registrar e ativar o conector WhatsApp",
      completed: false
    }
  ]);

  const updateStepStatus = (stepId: string, completed: boolean) => {
    setSteps(prev => prev.map(step => 
      step.id === stepId ? { ...step, completed } : step
    ));
  };

  // Verificar se retornou do OAuth do Bitrix24
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('oauth_success') === 'true') {
      updateStepStatus("bitrix-oauth", true);
      setCurrentStep(3);
      toast({
        title: "✅ Autenticação bem sucedida",
        description: "Conectado ao Bitrix24 com sucesso"
      });
      
      // Limpar parâmetros da URL
      window.history.replaceState({}, document.title, window.location.pathname);
    }
  }, []);

  const validateEvolutionUrl = (url: string): string | null => {
    if (!url) return "URL é obrigatória";
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
      return "URL deve começar com http:// ou https://";
    }
    try {
      new URL(url);
      return null;
    } catch {
      return "URL inválida";
    }
  };

  const handleEvolutionConfig = async () => {
    const urlError = validateEvolutionUrl(evolutionConfig.baseUrl);
    if (urlError) {
      toast({
        title: "❌ URL inválida",
        description: urlError,
        variant: "destructive"
      });
      return;
    }

    if (!evolutionConfig.apiKey) {
      toast({
        title: "❌ API Key obrigatória",
        description: "Informe a chave da API Evolution",
        variant: "destructive"
      });
      return;
    }

    setLoading(true);
    try {
      // Salvar configuração na tabela user_configurations
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Usuário não autenticado");

      const { error } = await supabase
        .from("user_configurations")
        .upsert({
          user_id: user.id,
          evolution_base_url: evolutionConfig.baseUrl.replace(/\/+$/, ""),
          evolution_api_key: evolutionConfig.apiKey,
          is_active: true
        } as any, { onConflict: "user_id" });

      if (error) throw error;
      
      updateStepStatus("evolution-config", true);
      toast({
        title: "✅ Configuração salva",
        description: "Configuração Evolution salva com sucesso"
      });
      setCurrentStep(1);
    } catch (error: any) {
      toast({
        title: "❌ Erro",
        description: error.message || "Falha ao salvar configuração",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  const handleEvolutionTest = async () => {
    setLoading(true);
    try {
      const result = await api.evolution.diag();
      
      if (isErr(result)) {
        throw new Error(result.error instanceof Error ? result.error.message : String(result.error));
      }

      const diagData = result.value;
      if (diagData.ok) {
        updateStepStatus("evolution-test", true);
        toast({
          title: "✅ Teste bem sucedido",
          description: "Conexão com Evolution API confirmada"
        });
        setCurrentStep(2);
      } else {
        throw new Error("Falha na conectividade com Evolution API");
      }
    } catch (error: any) {
      toast({
        title: "❌ Teste falhou",
        description: error.message || "Erro desconhecido",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  const handleBitrixOAuth = async () => {
    if (!bitrixConfig.portalUrl) {
      toast({
        title: "❌ Portal URL obrigatória",
        description: "Informe a URL do seu portal Bitrix24",
        variant: "destructive"
      });
      return;
    }

    setLoading(true);
    try {
      const result = await startBitrixOAuth(bitrixConfig.portalUrl);
      
      // Redirecionar para OAuth
      window.location.href = result.auth_url;
      
    } catch (error: any) {
      toast({
        title: "❌ Erro de autenticação",
        description: error.message || "Falha ao conectar com Bitrix24",
        variant: "destructive"
      });
      setLoading(false);
    }
  };

  const handleConnectorSetup = async () => {
    setLoading(true);
    try {
      // 1. Verificar se existem linhas no Bitrix
      const lines = await listOpenChannelsLines();
      if (!lines || lines.length === 0) {
        toast({
          title: "⚠️ Nenhuma linha encontrada",
          description: "Você precisa criar pelo menos uma linha de comunicação no Bitrix24 primeiro.",
          variant: "destructive"
        });
        return;
      }

      // 2. Registrar o conector
      await registerConnector({
        connector: "evolution_whatsapp",
        name: "EvoWhats",
        icon: "https://your-icon.com/whatsapp.png"
      });

      // 3. Publicar dados do conector para a primeira linha
      const firstLine = lines[0];
      await publishConnectorData({
        connector: "evolution_whatsapp",
        data: {
          webhook_url: `${window.location.origin}/webhook/whatsapp`,
          instance_name: `evo_line_${firstLine.id}`
        }
      });

      // 4. Adicionar ao Contact Center
      await addToContactCenter({
        placement: "CRM_LEAD_LIST_MENU",
        handlerUrl: `${window.location.origin}/bitrix-handler`
      });

      // 5. Ativar o conector
      await activateConnector({
        connector: "evolution_whatsapp",
        line: firstLine.id,
        active: true
      });
      
      updateStepStatus("bitrix-connector", true);
      toast({
        title: "✅ Setup completo",
        description: "Conector WhatsApp configurado com sucesso"
      });
      
      if (onComplete) {
        onComplete();
      }
    } catch (error: any) {
      toast({
        title: "❌ Erro no conector",
        description: error.message || "Falha ao configurar conector",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  const renderStepContent = () => {
    switch (currentStep) {
      case 0:
        return (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="evolution-url">URL Base da Evolution API</Label>
              <Input
                id="evolution-url"
                placeholder="https://sua-evolution-api.com"
                value={evolutionConfig.baseUrl}
                onChange={(e) => setEvolutionConfig(prev => ({ ...prev, baseUrl: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="evolution-key">Chave da API</Label>
              <Input
                id="evolution-key"
                type="password"
                placeholder="Sua chave da Evolution API"
                value={evolutionConfig.apiKey}
                onChange={(e) => setEvolutionConfig(prev => ({ ...prev, apiKey: e.target.value }))}
              />
            </div>
            <Button onClick={handleEvolutionConfig} disabled={loading} className="w-full">
              {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Salvar Configuração
            </Button>
          </div>
        );

      case 1:
        return (
          <div className="space-y-4">
            <p className="text-muted-foreground">
              Vamos testar a conexão com a Evolution API usando as configurações salvas.
            </p>
            <Button onClick={handleEvolutionTest} disabled={loading} className="w-full">
              {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Testar Conexão
            </Button>
          </div>
        );

      case 2:
        return (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="bitrix-url">URL do Portal Bitrix24</Label>
              <Input
                id="bitrix-url"
                placeholder="https://seuportal.bitrix24.com.br"
                value={bitrixConfig.portalUrl}
                onChange={(e) => setBitrixConfig(prev => ({ ...prev, portalUrl: e.target.value }))}
              />
            </div>
            <Button onClick={handleBitrixOAuth} disabled={loading} className="w-full">
              {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Conectar ao Bitrix24
            </Button>
          </div>
        );

      case 3:
        return (
          <div className="space-y-4">
            <p className="text-muted-foreground">
              Agora vamos registrar e ativar o conector WhatsApp no seu Bitrix24.
            </p>
            <Button onClick={handleConnectorSetup} disabled={loading} className="w-full">
              {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Configurar Conector
            </Button>
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <div className="max-w-2xl mx-auto p-6">
      <Card>
        <CardHeader>
          <CardTitle>Assistente de Configuração</CardTitle>
          <p className="text-muted-foreground">
            Configure seu sistema EvoWhats passo a passo
          </p>
        </CardHeader>
        <CardContent>
          {/* Progress Steps */}
          <div className="mb-8">
            <div className="flex items-center justify-between mb-4">
              {steps.map((step, index) => (
                <div key={step.id} className="flex flex-col items-center">
                  <div className={`flex items-center justify-center w-8 h-8 rounded-full border-2 mb-2 ${
                    step.completed 
                      ? 'bg-green-500 border-green-500 text-white' 
                      : currentStep === index
                      ? 'border-primary text-primary'
                      : 'border-muted-foreground text-muted-foreground'
                  }`}>
                    {step.completed ? (
                      <CheckCircle className="h-4 w-4" />
                    ) : currentStep === index ? (
                      <Circle className="h-4 w-4 fill-current" />
                    ) : (
                      <Circle className="h-4 w-4" />
                    )}
                  </div>
                  <span className={`text-xs text-center max-w-20 ${
                    currentStep === index ? 'text-primary font-medium' : 'text-muted-foreground'
                  }`}>
                    {step.title}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Current Step Content */}
          <div className="space-y-6">
            <div>
              <h3 className="text-lg font-semibold mb-2">
                {steps[currentStep]?.title}
              </h3>
              <p className="text-muted-foreground mb-4">
                {steps[currentStep]?.description}
              </p>
            </div>

            {renderStepContent()}
          </div>
        </CardContent>
      </Card>
    </div>
  );
};