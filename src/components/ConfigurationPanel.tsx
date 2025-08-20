
import { useState } from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { 
  Settings, 
  Save, 
  AlertCircle,
  Info
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import ConnectBitrixButton from "./bitrix/ConnectBitrixButton";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

const ConfigurationPanel = () => {
  const [loading, setLoading] = useState(false);
  const [portalUrl, setPortalUrl] = useState("");
  const [evolutionConfig, setEvolutionConfig] = useState({
    baseUrl: "",
    apiKey: "",
    instanceName: ""
  });
  const { toast } = useToast();

  const handleSaveEvolution = async () => {
    if (!evolutionConfig.baseUrl || !evolutionConfig.apiKey) {
      toast({
        title: "Campos obrigatórios",
        description: "Preencha URL Base e API Key da Evolution API",
        variant: "destructive",
      });
      return;
    }

    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Usuário não autenticado");

      const { error } = await supabase
        .from('user_configurations')
        .upsert({
          user_id: user.id,
          evolution_base_url: evolutionConfig.baseUrl,
          evolution_api_key: evolutionConfig.apiKey,
          evolution_instance_name: evolutionConfig.instanceName || 'default'
        });

      if (error) throw error;

      toast({
        title: "Configuração salva!",
        description: "Configurações da Evolution API foram salvas com sucesso.",
      });
    } catch (error: any) {
      toast({
        title: "Erro ao salvar",
        description: error.message || "Falha ao salvar configurações",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Evolution API Configuration */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Settings className="h-5 w-5" />
            Evolution API
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label htmlFor="base-url">URL Base *</Label>
            <Input
              id="base-url"
              placeholder="https://sua-evolution-api.com"
              value={evolutionConfig.baseUrl}
              onChange={(e) => setEvolutionConfig(prev => ({
                ...prev,
                baseUrl: e.target.value
              }))}
            />
          </div>

          <div>
            <Label htmlFor="api-key">API Key *</Label>
            <Input
              id="api-key"
              type="password"
              placeholder="Sua chave da API"
              value={evolutionConfig.apiKey}
              onChange={(e) => setEvolutionConfig(prev => ({
                ...prev,
                apiKey: e.target.value
              }))}
            />
          </div>

          <div>
            <Label htmlFor="instance-name">Nome da Instância</Label>
            <Input
              id="instance-name"
              placeholder="default"
              value={evolutionConfig.instanceName}
              onChange={(e) => setEvolutionConfig(prev => ({
                ...prev,
                instanceName: e.target.value
              }))}
            />
          </div>

          <Button onClick={handleSaveEvolution} disabled={loading}>
            <Save className="h-4 w-4 mr-2" />
            {loading ? "Salvando..." : "Salvar Configurações"}
          </Button>
        </CardContent>
      </Card>

      {/* Bitrix24 Configuration */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Settings className="h-5 w-5" />
            Bitrix24 OAuth
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="ghost" size="sm" className="h-6 w-6 p-0">
                    <Info className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent className="max-w-sm">
                  <div className="space-y-2 text-sm">
                    <p><strong>🔧 Configurações necessárias no Bitrix24:</strong></p>
                    <p><strong>URL de Redirecionamento:</strong><br/>
                    https://twqcybbjyhcokcrdfgkk.functions.supabase.co/bitrix-oauth-callback</p>
                    <p><strong>Escopos necessários:</strong><br/>
                    imopenlines, imconnector, im, user, event, event_bind, placement, crm</p>
                    <p><strong>⚠️</strong> Use apenas os escopos listados acima para evitar rejeições.</p>
                    <p><strong>📋 Requisitos do Bitrix24:</strong></p>
                    <ul className="list-disc pl-4">
                      <li>Plano pago ou período de demonstração ativo</li>
                      <li>Permissões de administrador para configurar apps</li>
                      <li>App Local criado no painel de desenvolvedor</li>
                    </ul>
                  </div>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ConnectBitrixButton 
            portalUrl={portalUrl}
            onPortalUrlChange={setPortalUrl}
          />
        </CardContent>
      </Card>

      {/* Important Notes */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex items-start gap-3">
            <AlertCircle className="h-5 w-5 text-orange-500 mt-0.5" />
            <div className="space-y-2 text-sm">
              <p className="font-medium">Importante:</p>
              <ul className="space-y-1 text-muted-foreground">
                <li>• Configure primeiro a Evolution API e teste a conexão</li>
                <li>• Depois configure o OAuth do Bitrix24 com os escopos corretos</li>
                <li>• Use o Gerenciador de Open Channels para configurar a integração</li>
              </ul>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default ConfigurationPanel;
