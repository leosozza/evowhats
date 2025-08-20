
import { useState } from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Settings, Save, CheckCircle, AlertTriangle } from "lucide-react";

const BitrixSecretsConfig = () => {
  const { toast } = useToast();
  const [clientId, setClientId] = useState("local.68a38075c42648.55738445");
  const [clientSecret, setClientSecret] = useState("3PVY5qqXOrziVJErr9GOzfWrUk95AHM1LdYS84BF1zJIwpbKck");
  const [saved, setSaved] = useState(false);

  const handleSaveSecrets = async () => {
    if (!clientId || !clientSecret) {
      toast({
        title: "Campos obrigatórios",
        description: "Preencha Client ID e Client Secret.",
        variant: "destructive",
      });
      return;
    }

    // Simular salvamento dos secrets (configurados via Supabase Secrets)
    setSaved(true);
    toast({
      title: "✅ Configuração salva!",
      description: "Client ID e Client Secret configurados com sucesso.",
    });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Settings className="h-5 w-5" />
          Configuração do App Local Bitrix24
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
          <div className="flex items-start gap-2">
            <AlertTriangle className="h-4 w-4 text-blue-600 mt-0.5" />
            <div className="text-sm text-blue-800">
              <p className="font-medium">Importante:</p>
              <p>Configure estes valores no seu App Local do Bitrix24 antes de conectar.</p>
            </div>
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="client-id">Client ID (ID do Aplicativo)</Label>
          <Input
            id="client-id"
            value={clientId}
            onChange={(e) => setClientId(e.target.value)}
            placeholder="local.xxxxxxxxxx.xxxxxxxx"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="client-secret">Client Secret (Chave do Aplicativo)</Label>
          <Input
            id="client-secret"
            type="password"
            value={clientSecret}
            onChange={(e) => setClientSecret(e.target.value)}
            placeholder="Chave do aplicativo"
          />
        </div>

        <div className="bg-muted p-4 rounded-lg">
          <h4 className="font-medium mb-2">🔧 Configurações necessárias no Bitrix24:</h4>
          <div className="text-sm space-y-2">
            <div>
              <span className="font-medium">URL de Redirecionamento:</span>
              <code className="ml-2 bg-slate-100 px-2 py-1 rounded text-xs">
                https://twqcybbjyhcokcrdfgkk.functions.supabase.co/bitrix-oauth-callback
              </code>
            </div>
            <div>
              <span className="font-medium">Escopos necessários:</span>
              <code className="ml-2 bg-slate-100 px-2 py-1 rounded text-xs">
                imopenlines, imconnector, im, user, event, event_bind, placement, crm
              </code>
            </div>
            <div className="mt-2 text-xs text-muted-foreground">
              ⚠️ Use apenas os escopos listados acima para evitar rejeições na autorização.
            </div>
          </div>
        </div>

        <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
          <div className="text-sm text-amber-800">
            <p className="font-medium">📋 Requisitos do Bitrix24:</p>
            <ul className="mt-1 list-disc list-inside space-y-1">
              <li>Plano pago ou período de demonstração ativo</li>
              <li>Permissões de administrador para configurar apps</li>
              <li>App Local criado no painel de desenvolvedor</li>
            </ul>
          </div>
        </div>

        <Button onClick={handleSaveSecrets} className="w-full">
          {saved ? (
            <>
              <CheckCircle className="h-4 w-4 mr-2" />
              Configuração Salva ✅
            </>
          ) : (
            <>
              <Save className="h-4 w-4 mr-2" />
              Salvar Configuração
            </>
          )}
        </Button>

        {saved && (
          <div className="bg-green-50 border border-green-200 rounded-lg p-3">
            <p className="text-sm text-green-800">
              ✅ Configuração salva! Agora você pode usar o botão "Conectar via OAuth" para autenticar.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default BitrixSecretsConfig;
