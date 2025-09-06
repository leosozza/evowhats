
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
import BitrixConnectionManager from "./BitrixConnectionManager";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

const ConfigurationPanel = () => {
  const [loading, setLoading] = useState(false);
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
        }, { onConflict: 'user_id' });

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
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="ghost" size="sm" className="h-6 w-6 p-0">
                    <Info className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent className="max-w-sm">
                  <div className="space-y-2 text-sm">
                    <p><strong>🔧 Configuração por Canal:</strong></p>
                    <p>Cada canal do Bitrix24 terá sua própria instância Evolution:</p>
                    <ul className="list-disc pl-4">
                      <li><strong>URL Base:</strong> Mesma para todos os canais</li>
                      <li><strong>API Key:</strong> Mesma chave de acesso</li>
                      <li><strong>Instâncias:</strong> Criadas automaticamente por canal</li>
                    </ul>
                    <p><strong>Exemplo de nomes de instância:</strong><br/>
                    • Canal 1: bitrix_line_1_1692834567<br/>
                    • Canal 2: bitrix_line_2_1692834568</p>
                  </div>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
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
            <p className="text-xs text-muted-foreground mt-1">
              Esta URL será usada para todas as instâncias dos canais
            </p>
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

          <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
            <div className="text-sm text-blue-800">
              <p className="font-medium">🔄 Instâncias Automáticas:</p>
              <p>Não é necessário definir um nome de instância aqui. O sistema criará automaticamente uma instância única para cada canal do Bitrix24 que você ativar.</p>
            </div>
          </div>

          <Button onClick={handleSaveEvolution} disabled={loading}>
            <Save className="h-4 w-4 mr-2" />
            {loading ? "Salvando..." : "Salvar Configurações"}
          </Button>
        </CardContent>
      </Card>

      {/* Bitrix24 Connection Manager */}
      <BitrixConnectionManager />

      {/* Important Notes */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex items-start gap-3">
            <AlertCircle className="h-5 w-5 text-orange-500 mt-0.5" />
            <div className="space-y-2 text-sm">
              <p className="font-medium">Importante:</p>
              <ul className="space-y-1 text-muted-foreground">
                <li>• Configure primeiro a Evolution API e teste a conexão</li>
                <li>• A conexão Bitrix24 é automática quando instalado no portal</li>
                <li>• Cada canal do Bitrix criará automaticamente sua instância Evolution</li>
                <li>• Os tokens OAuth são renovados automaticamente a cada 5 minutos</li>
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
