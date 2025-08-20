import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Save, TestTube, Eye, EyeOff, LogOut } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useSupabaseAuth } from "@/hooks/useSupabaseAuth";
import { supabase } from "@/integrations/supabase/client";
import AuthPanel from "@/components/AuthPanel";
import { testBitrixConnection } from "@/services/bitrixApi";
import { testEvolutionConnection } from "@/services/evolutionApi";
import ConnectBitrixButton from "@/components/bitrix/ConnectBitrixButton";
import BindEventsButton from "@/components/bitrix/BindEventsButton";
import SyncLeadsButton from "@/components/bitrix/SyncLeadsButton";
import BitrixSecretsConfig from "@/components/bitrix/BitrixSecretsConfig";
import BitrixOpenChannelsConfig from "@/components/bitrix/BitrixOpenChannelsConfig";
import OpenChannelsManager from "@/components/bitrix/OpenChannelsManager";
import BitrixConnectionMonitor from "@/components/bitrix/BitrixConnectionMonitor";

const ConfigurationPanel = () => {
  const [showApiKey, setShowApiKey] = useState(false);
  const [showWebhook, setShowWebhook] = useState(false);
  const [testingEvolution, setTestingEvolution] = useState(false);
  const [testingBitrix, setTestingBitrix] = useState(false);
  const { toast } = useToast();
  const { session, user, loading, signOut } = useSupabaseAuth();

  const [evolutionConfig, setEvolutionConfig] = useState({
    baseUrl: "",
    apiKey: "",
    instanceName: ""
  });

  const [bitrixConfig, setBitrixConfig] = useState({
    portalUrl: "",
    webhookUrl: "",
    userId: ""
  });

  const [loadingConfig, setLoadingConfig] = useState(false);

  // Load existing configuration for the logged-in user
  useEffect(() => {
    if (!user) return;
    
    const loadConfiguration = async () => {
      console.log("[config] Loading configuration for user:", user.id);
      setLoadingConfig(true);

      try {
        const { data, error } = await supabase
          .from("user_configurations")
          .select("*")
          .eq("user_id", user.id)
          .maybeSingle();

        if (error) {
          console.error("[config] Load error:", error);
          toast({
            title: "Erro ao carregar",
            description: "Não foi possível carregar suas configurações.",
            variant: "destructive",
          });
          throw error;
        }

        if (data) {
          console.log("[config] Configuration loaded:", data);
          setEvolutionConfig({
            baseUrl: data.evolution_base_url || "",
            apiKey: data.evolution_api_key || "",
            instanceName: data.evolution_instance_name || "",
          });
          setBitrixConfig({
            portalUrl: data.bitrix_portal_url || "",
            webhookUrl: data.bitrix_webhook_url || "",
            userId: data.bitrix_user_id || "",
          });
        } else {
          console.log("[config] No configuration found, using defaults.");
        }
      } catch (error) {
        console.error("[config] Error loading config:", error);
      } finally {
        setLoadingConfig(false);
      }
    };

    loadConfiguration();
  }, [user, toast]);

  const upsertAllConfigurations = async () => {
    if (!user) {
      toast({
        title: "Você precisa estar logado",
        description: "Entre para salvar suas configurações.",
        variant: "destructive",
      });
      throw new Error("User not authenticated");
    }

    console.log("[config] Saving configuration for user:", user.id);
    const payload = {
      user_id: user.id,
      evolution_base_url: evolutionConfig.baseUrl || null,
      evolution_api_key: evolutionConfig.apiKey || null,
      evolution_instance_name: evolutionConfig.instanceName || null,
      bitrix_portal_url: bitrixConfig.portalUrl || null,
      bitrix_webhook_url: bitrixConfig.webhookUrl || null,
      bitrix_user_id: bitrixConfig.userId || null,
      is_active: true,
      updated_at: new Date().toISOString(),
    };

    const { error } = await supabase
      .from("user_configurations")
      .upsert(payload, { onConflict: "user_id" });

    if (error) {
      console.error("[config] Save error:", error);
      toast({
        title: "Erro ao salvar",
        description: "Não foi possível salvar suas configurações.",
        variant: "destructive",
      });
      throw error;
    }
  };

  const handleSaveEvolution = async () => {
    await upsertAllConfigurations();
    toast({
      title: "Configuração salva!",
      description: "Evolution API configurada com sucesso.",
    });
  };

  const handleSaveBitrix = async () => {
    await upsertAllConfigurations();
    toast({
      title: "Configuração salva!",
      description: "Bitrix24 configurado com sucesso.",
    });
  };

  const handleTestConnection = (service: string) => {
    toast({
      title: `Testando ${service}...`,
      description: "Verificando conectividade...",
    });
  };

  const handleTestEvolution = async () => {
    if (!evolutionConfig.baseUrl || !evolutionConfig.apiKey || !evolutionConfig.instanceName) {
      toast({
        title: "Campos obrigatórios",
        description: "Preencha todos os campos da Evolution API antes de testar.",
        variant: "destructive",
      });
      return;
    }

    setTestingEvolution(true);
    console.log("[config] Testing Evolution connection...");

    try {
      const result = await testEvolutionConnection(
        evolutionConfig.baseUrl,
        evolutionConfig.apiKey,
        evolutionConfig.instanceName
      );

      toast({
        title: result.success ? "Conexão bem-sucedida!" : "Falha na conexão",
        description: result.message,
        variant: result.success ? "default" : "destructive",
      });

      if (result.success && result.instanceInfo) {
        console.log("[config] Evolution instance info:", result.instanceInfo);
      }
    } catch (error) {
      console.error("[config] Evolution test error:", error);
      toast({
        title: "Erro no teste",
        description: "Erro inesperado ao testar conexão com Evolution API.",
        variant: "destructive",
      });
    } finally {
      setTestingEvolution(false);
    }
  };

  const handleTestBitrix = async () => {
    if (!bitrixConfig.portalUrl || !bitrixConfig.webhookUrl || !bitrixConfig.userId) {
      toast({
        title: "Campos obrigatórios",
        description: "Preencha todos os campos do Bitrix24 antes de testar.",
        variant: "destructive",
      });
      return;
    }

    setTestingBitrix(true);
    console.log("[config] Testing Bitrix connection...");

    try {
      const result = await testBitrixConnection(
        bitrixConfig.portalUrl,
        bitrixConfig.webhookUrl,
        bitrixConfig.userId
      );

      toast({
        title: result.success ? "Conexão bem-sucedida!" : "Falha na conexão",
        description: result.message,
        variant: result.success ? "default" : "destructive",
      });

      if (result.success && result.userInfo) {
        console.log("[config] Bitrix user info:", result.userInfo);
      }
    } catch (error) {
      console.error("[config] Bitrix test error:", error);
      toast({
        title: "Erro no teste",
        description: "Erro inesperado ao testar conexão com Bitrix24.",
        variant: "destructive",
      });
    } finally {
      setTestingBitrix(false);
    }
  };

  if (loading) {
    return (
      <Card className="p-6 animate-fade-in">
        <h2 className="text-xl font-semibold mb-2 text-foreground">Carregando...</h2>
        <p className="text-sm text-muted-foreground">Verificando sessão...</p>
      </Card>
    );
  }

  if (!session) {
    return <AuthPanel />;
  }

  return (
    <Card className="p-6 animate-fade-in">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-semibold text-foreground">
          Configurações de Integração
        </h2>
        <Button variant="outline" size="sm" onClick={signOut}>
          <LogOut className="h-4 w-4 mr-2" />
          Sair
        </Button>
      </div>

      {loadingConfig ? (
        <p className="text-sm text-muted-foreground">Carregando suas configurações...</p>
      ) : null}

      <Tabs defaultValue="evolution" className="w-full">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="evolution">Evolution API</TabsTrigger>
          <TabsTrigger value="bitrix">Bitrix24</TabsTrigger>
          <TabsTrigger value="openlines">Open Channels</TabsTrigger>
          <TabsTrigger value="monitor">Monitor</TabsTrigger>
        </TabsList>
        
        <TabsContent value="evolution" className="mt-6 space-y-4">
          <div className="space-y-4">
            <div>
              <Label htmlFor="evolution-url">URL Base da Evolution API</Label>
              <Input
                id="evolution-url"
                placeholder="https://sua-evolution-api.com"
                value={evolutionConfig.baseUrl}
                onChange={(e) => setEvolutionConfig({...evolutionConfig, baseUrl: e.target.value})}
              />
            </div>
            
            <div>
              <Label htmlFor="evolution-key">API Key</Label>
              <div className="relative">
                <Input
                  id="evolution-key"
                  type={showApiKey ? "text" : "password"}
                  placeholder="Sua API Key"
                  value={evolutionConfig.apiKey}
                  onChange={(e) => setEvolutionConfig({...evolutionConfig, apiKey: e.target.value})}
                />
                <Button
                  variant="ghost"
                  size="sm"
                  className="absolute right-2 top-1/2 -translate-y-1/2"
                  onClick={() => setShowApiKey(!showApiKey)}
                >
                  {showApiKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </Button>
              </div>
            </div>
            
            <div>
              <Label htmlFor="evolution-instance">Nome da Instância</Label>
              <Input
                id="evolution-instance"
                placeholder="minha-instancia"
                value={evolutionConfig.instanceName}
                onChange={(e) => setEvolutionConfig({...evolutionConfig, instanceName: e.target.value})}
              />
            </div>
            
            <div className="flex space-x-2 pt-4">
              <Button onClick={handleSaveEvolution} className="gradient-primary">
                <Save className="h-4 w-4 mr-2" />
                Salvar
              </Button>
              <Button 
                variant="outline" 
                onClick={handleTestEvolution}
                disabled={testingEvolution}
              >
                <TestTube className="h-4 w-4 mr-2" />
                {testingEvolution ? "Testando..." : "Testar Conexão"}
              </Button>
            </div>
          </div>
        </TabsContent>
        
        <TabsContent value="bitrix" className="mt-6 space-y-4">
          <div className="space-y-6">
            <BitrixSecretsConfig />
            
            <div className="space-y-4">
              <div>
                <Label htmlFor="bitrix-portal">URL do Portal Bitrix24</Label>
                <Input
                  id="bitrix-portal"
                  placeholder="https://seudominio.bitrix24.com.br"
                  value={bitrixConfig.portalUrl}
                  onChange={(e) => setBitrixConfig({...bitrixConfig, portalUrl: e.target.value})}
                />
              </div>
              
              <div>
                <Label htmlFor="bitrix-webhook">Webhook URL (CRM)</Label>
                <div className="relative">
                  <Input
                    id="bitrix-webhook"
                    type={showWebhook ? "text" : "password"}
                    placeholder="URL do webhook do Bitrix24 (para CRM)"
                    value={bitrixConfig.webhookUrl}
                    onChange={(e) => setBitrixConfig({...bitrixConfig, webhookUrl: e.target.value})}
                  />
                  <Button
                    variant="ghost"
                    size="sm"
                    className="absolute right-2 top-1/2 -translate-y-1/2"
                    onClick={() => setShowWebhook(!showWebhook)}
                  >
                    {showWebhook ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  Usado apenas para testes de CRM. Open Channels usa OAuth.
                </p>
              </div>
              
              <div>
                <Label htmlFor="bitrix-user">ID do Usuário (CRM)</Label>
                <Input
                  id="bitrix-user"
                  placeholder="ID do usuário responsável"
                  value={bitrixConfig.userId}
                  onChange={(e) => setBitrixConfig({...bitrixConfig, userId: e.target.value})}
                />
              </div>

              <div className="flex flex-wrap gap-2 pt-2">
                <ConnectBitrixButton 
                  portalUrl={bitrixConfig.portalUrl}
                  onPortalUrlChange={(url) => setBitrixConfig({...bitrixConfig, portalUrl: url})}
                />
                <BindEventsButton />
                <SyncLeadsButton />
              </div>

              <BitrixOpenChannelsConfig />

              <div className="flex space-x-2 pt-4">
                <Button onClick={handleSaveBitrix} className="gradient-accent">
                  <Save className="h-4 w-4 mr-2" />
                  Salvar
                </Button>
                <Button 
                  variant="outline" 
                  onClick={handleTestBitrix}
                  disabled={testingBitrix}
                >
                  <TestTube className="h-4 w-4 mr-2" />
                  {testingBitrix ? "Testando..." : "Testar Conexão (CRM)"}
                </Button>
              </div>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="openlines" className="mt-6">
          <OpenChannelsManager />
        </TabsContent>

        <TabsContent value="monitor" className="mt-6">
          <BitrixConnectionMonitor />
        </TabsContent>
      </Tabs>
    </Card>
  );
};

export default ConfigurationPanel;
