
import { useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useSupabaseAuth } from "@/hooks/useSupabaseAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import AuthPanel from "@/components/AuthPanel";
import ConfigurationPanel from "@/components/ConfigurationPanel";
import WhatsAppWebMonitor from "@/components/WhatsAppWebMonitor";
import RealMessageMonitor from "@/components/RealMessageMonitor";
import BitrixConnectionMonitor from "@/components/bitrix/BitrixConnectionMonitor";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { MessageSquare, Settings, Monitor, GitBranch } from "lucide-react";

const Index = () => {
  const { session, loading } = useSupabaseAuth();
  const location = useLocation();
  const navigate = useNavigate();

  // Catch-all: se chegou em / com code/state, redireciona para /bitrix/callback
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    if (params.get("code") && params.get("state")) {
      console.log("[Index] Detectado OAuth callback na raiz, redirecionando para /bitrix/callback");
      navigate(`/bitrix/callback?${params.toString()}`, { replace: true });
    }
  }, [location, navigate]);

  if (loading) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="text-center">Carregando...</div>
      </div>
    );
  }

  if (!session) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="max-w-md mx-auto">
          <AuthPanel />
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-foreground">
            EvoWhats Dashboard
          </h1>
          <p className="text-muted-foreground mt-1">
            Integração WhatsApp + Bitrix24
          </p>
        </div>
        <Badge variant="outline" className="text-sm">
          Conectado como {session.user.email}
        </Badge>
      </div>

      {/* Connection Status */}
      <BitrixConnectionMonitor />

      {/* Main Content */}
      <Tabs defaultValue="monitor" className="space-y-6">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="monitor" className="flex items-center gap-2">
            <MessageSquare className="h-4 w-4" />
            Monitor
          </TabsTrigger>
          <TabsTrigger value="config" className="flex items-center gap-2">
            <Settings className="h-4 w-4" />
            Configurações
          </TabsTrigger>
          <TabsTrigger value="logs" className="flex items-center gap-2">
            <Monitor className="h-4 w-4" />
            Logs
          </TabsTrigger>
          <TabsTrigger value="integration" className="flex items-center gap-2">
            <GitBranch className="h-4 w-4" />
            Integração
          </TabsTrigger>
        </TabsList>

        <TabsContent value="monitor" className="space-y-6">
          <WhatsAppWebMonitor />
        </TabsContent>

        <TabsContent value="config" className="space-y-6">
          <ConfigurationPanel />
        </TabsContent>

        <TabsContent value="logs" className="space-y-6">
          <RealMessageMonitor />
        </TabsContent>

        <TabsContent value="integration" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Guia de Integração</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4 text-sm">
                <div>
                  <h3 className="font-medium mb-2">1. Configurar Evolution API</h3>
                  <p className="text-muted-foreground">
                    Configure a URL da Evolution API e o token de acesso nas configurações.
                  </p>
                </div>
                <div>
                  <h3 className="font-medium mb-2">2. Conectar Bitrix24</h3>
                  <p className="text-muted-foreground">
                    Autorize a conexão com seu portal Bitrix24 usando OAuth.
                  </p>
                </div>
                <div>
                  <h3 className="font-medium mb-2">3. Configurar Webhooks</h3>
                  <p className="text-muted-foreground">
                    Configure os webhooks para sincronização bidirecional de mensagens.
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default Index;
