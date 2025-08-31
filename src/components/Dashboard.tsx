import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Activity } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";

interface APIStatus {
  evolutionApi: boolean;
  bitrixApi: boolean;
}

const Dashboard = () => {
  const { toast } = useToast();
  const [apiStatus, setApiStatus] = useState<APIStatus>({
    evolutionApi: false,
    bitrixApi: false,
  });

  const checkApiStatus = async () => {
    try {
      // Check Evolution API
      const evolutionCheck = await supabase.functions.invoke("evolution-connector-v2", {
        body: { action: "list_instances" },
      });
      
      console.log("Evolution API response:", evolutionCheck);
      
      // Check Bitrix API with token refresh
      const bitrixCheck = await supabase.functions.invoke("bitrix-token-refresh", {
        body: {},
      });
      
      console.log("Bitrix API response:", bitrixCheck);

      const evolutionOk = !evolutionCheck.error && evolutionCheck.data?.ok !== false;
      const bitrixOk = !bitrixCheck.error && bitrixCheck.data?.ok === true;

      setApiStatus({
        evolutionApi: evolutionOk,
        bitrixApi: bitrixOk,
      });

      if (evolutionOk) {
        toast({
          title: "✅ API Evolution",
          description: "API Evolution está funcional",
        });
      } else {
        toast({
          title: "❌ API Evolution",
          description: evolutionCheck.error?.message || "API Evolution não está funcional",
          variant: "destructive",
        });
      }

      if (bitrixOk) {
        toast({
          title: "✅ API Bitrix",
          description: "API Bitrix está funcional",
        });
      } else {
        toast({
          title: "❌ API Bitrix",
          description: bitrixCheck.error?.message || "API Bitrix não está funcional",
          variant: "destructive",
        });
      }
    } catch (error: any) {
      console.error("Error checking API status:", error);
      toast({
        title: "❌ Erro",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  useEffect(() => {
    checkApiStatus();
  }, []);

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="container mx-auto p-6">
        <h1 className="text-3xl font-bold mb-4">Dashboard</h1>
        <p className="text-gray-600 mb-8">
          Visão geral das integrações e APIs
        </p>

        {/* Navigation cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-8">
          <Card className="hover:shadow-md transition-shadow cursor-pointer" onClick={() => window.location.href = '/bindings'}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Bindings</CardTitle>
              <Activity className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <p className="text-xs text-muted-foreground">
                Gerenciar ligações entre canais e instâncias
              </p>
            </CardContent>
          </Card>
          
          <Card className="hover:shadow-md transition-shadow cursor-pointer" onClick={() => window.location.href = '/evolution/instances'}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Instâncias Evolution</CardTitle>
              <Activity className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <p className="text-xs text-muted-foreground">
                Gerenciar conexões Evolution API
              </p>
            </CardContent>
          </Card>
        </div>

      {/* API Status Section */}
      <section className="mb-8">
        <h2 className="text-2xl font-semibold mb-4">Status da API</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Card>
            <CardHeader>
              <CardTitle>API Evolution</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-gray-500 mb-4">
                Status:{" "}
                {apiStatus.evolutionApi ? (
                  <span className="text-green-500">Funcional</span>
                ) : (
                  <span className="text-red-500">Não Funcional</span>
                )}
              </p>
              <Button 
                size="sm" 
                variant="outline" 
                onClick={checkApiStatus}
                className="w-full"
              >
                Testar Novamente
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>API Bitrix</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-gray-500 mb-4">
                Status:{" "}
                {apiStatus.bitrixApi ? (
                  <span className="text-green-500">Funcional</span>
                ) : (
                  <span className="text-red-500">Não Funcional</span>
                )}
              </p>
              <Button 
                size="sm" 
                variant="outline" 
                onClick={checkApiStatus}
                className="w-full"
              >
                Testar Novamente
              </Button>
            </CardContent>
          </Card>
        </div>
        
        {/* Quick Test Section */}
        <div className="mt-6 p-4 bg-blue-50 rounded-lg">
          <h3 className="font-medium mb-2">Teste Rápido</h3>
          <p className="text-sm text-gray-600 mb-4">
            Para diagnosticar problemas, teste as APIs individualmente:
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <h4 className="font-medium text-sm mb-2">Evolution API</h4>
              <p className="text-xs text-gray-500 mb-2">
                Configurar EVOLUTION_BASE_URL e EVOLUTION_API_KEY nas secrets do Supabase
              </p>
              <Button 
                size="sm" 
                onClick={async () => {
                  try {
                    const { data, error } = await supabase.functions.invoke("evolution-connector-v2", {
                      body: { action: "list_instances" },
                    });
                    console.log("Evolution test:", { data, error });
                    toast({
                      title: error ? "❌ Evolution Falha" : "✅ Evolution OK",
                      description: error?.message || `Instâncias: ${data?.instances?.length || 0}`,
                      variant: error ? "destructive" : "default",
                    });
                  } catch (e: any) {
                    toast({
                      title: "❌ Evolution Erro",
                      description: e.message,
                      variant: "destructive",
                    });
                  }
                }}
              >
                Testar Evolution
              </Button>
            </div>
            <div>
              <h4 className="font-medium text-sm mb-2">Bitrix24 API</h4>
              <p className="text-xs text-gray-500 mb-2">
                Requer autenticação OAuth. Faça login primeiro.
              </p>
              <Button 
                size="sm" 
                onClick={async () => {
                  try {
                    const { data, error } = await supabase.functions.invoke("bitrix-token-refresh", {
                      body: {},
                    });
                    console.log("Bitrix test:", { data, error });
                    toast({
                      title: error ? "❌ Bitrix Falha" : "✅ Bitrix OK",
                      description: error?.message || (data?.refreshed ? "Token atualizado" : "Token válido"),
                      variant: error ? "destructive" : "default",
                    });
                  } catch (e: any) {
                    toast({
                      title: "❌ Bitrix Erro",
                      description: e.message,
                      variant: "destructive",
                    });
                  }
                }}
              >
                Testar Bitrix
              </Button>
            </div>
          </div>
        </div>
      </section>
      </div>
    </div>
  );
};

export default Dashboard;
