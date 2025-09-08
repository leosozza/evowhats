import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Activity, Search } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { api } from "@/api/provider";
import { unwrap, isErr } from "@/core/result";
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

  const checkEvolutionApi = async () => {
    try {
      const result = await api.evolution.diag();
      
      if (isErr(result)) {
        const errorMsg = result.error instanceof Error ? result.error.message : String(result.error);
        throw new Error(errorMsg || "Evolution API offline");
      }
      
      const diagData = result.value;
      const isHealthy = diagData?.ok === true;
      setApiStatus(prev => ({ ...prev, evolutionApi: isHealthy }));
      
      if (isHealthy) {
        toast({
          title: "✅ API Evolution",
          description: `API funcional com ${diagData?.steps?.fetchInstances?.instanceCount ?? 'N/A'} instâncias`,
        });
      } else {
        let errorMsg = "Desconectada";
        
        if (diagData?.steps) {
          if (!diagData.steps.config?.ok) {
            errorMsg = "Desconectada (configuração incompleta)";
          } else {
            const failedStep = Object.entries(diagData.steps).find(([_, step]: [string, any]) => !step?.ok);
            if (failedStep) {
              const [_, stepData] = failedStep as [string, any];
              const reason = stepData?.reason || stepData?.error || `status ${stepData?.status}`;
              errorMsg = `Desconectada (${reason})`;
            }
          }
        } else if (diagData?.error) {
          errorMsg = `Desconectada (${diagData.error})`;
        }
        
        toast({
          title: "Evolution API",
          description: errorMsg,
        });
      }
    } catch (error: any) {
      console.error("Error checking Evolution API:", error);
      setApiStatus(prev => ({ ...prev, evolutionApi: false }));
      
      toast({
        title: "Evolution API",
        description: "Desconectada (diagnóstico indisponível)",
      });
    }
  };

  const checkBitrixApi = async () => {
    try {
      const result = await api.bitrix.tokenStatus();
      
      if (isErr(result)) {
        const errorMsg = result.error instanceof Error ? result.error.message : String(result.error);
        throw new Error(errorMsg || "Bitrix API offline");
      }
      
      const bitrixData = result.value;
      const bitrixOk = bitrixData?.ok === true;

      setApiStatus(prev => ({
        ...prev,
        bitrixApi: bitrixOk,
      }));

      if (bitrixOk) {
        toast({
          title: "✅ API Bitrix",
          description: `API Bitrix está funcional - Portal: ${bitrixData.portal || 'N/A'}`,
        });
      } else {
        toast({
          title: "API Bitrix",
          description: "API Bitrix não está funcional",
        });
      }
    } catch (error: any) {
      console.error("Error checking Bitrix API:", error);
      setApiStatus(prev => ({ ...prev, bitrixApi: false }));
      
      toast({
        title: "API Bitrix",
        description: `Desconectada (${error.message})`,
      });
    }
  };

  const checkApiStatus = async () => {
    await Promise.all([checkEvolutionApi(), checkBitrixApi()]);
  };

  useEffect(() => {
    console.log("VITE_SUPABASE_URL", import.meta.env.VITE_SUPABASE_URL);
    const pk = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || import.meta.env.VITE_SUPABASE_ANON_KEY;
    console.log("VITE_SUPABASE_KEY", pk ? String(pk).slice(0, 8) + "…" : "undefined");
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
            <div className="space-y-2">
              <Button 
                size="sm" 
                variant="outline" 
                onClick={async () => {
                  await checkEvolutionApi();
                }}
                className="w-full"
              >
                Testar Novamente
              </Button>
              <Button 
                size="sm" 
                onClick={async () => {
                  try {
                    const result = await api.evolution.diag();
                    if (isErr(result)) {
                      throw new Error(result.error instanceof Error ? result.error.message : String(result.error));
                    }
                    
                    const diagnosticText = JSON.stringify(result.value, null, 2);
                    
                    toast({
                      title: result.value?.ok ? "✅ Evolution OK" : "❌ Evolution Falha",
                      description: result.value?.ok 
                        ? "Diagnóstico completo" 
                        : "Ver console para detalhes completos",
                    });
                    
                    if (window.confirm(`Diagnóstico Evolution API:\n\n${diagnosticText}\n\nCopiar para clipboard?`)) {
                      navigator.clipboard?.writeText(diagnosticText);
                    }
                  } catch (e: any) {
                    console.error("Erro no diagnóstico:", e);
                    toast({
                      title: "❌ Evolution Erro",
                      description: e.message || "Erro ao executar diagnóstico",
                      variant: "destructive",
                    });
                  }
                }}
                className="w-full"
              >
                <Search className="h-4 w-4 mr-2" />
                Diagnóstico Completo
              </Button>
            </div>
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
                onClick={checkBitrixApi}
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
                    const result = await api.evolution.list();
                    if (isErr(result)) {
                      throw new Error(result.error instanceof Error ? result.error.message : String(result.error));
                    }
                    
                    const instances = result.value?.instances || [];
                    toast({
                      title: "✅ Evolution OK",
                      description: `${instances.length} instâncias encontradas`,
                    });
                    
                    const rawResponse = JSON.stringify(result.value, null, 2);
                    if (window.confirm(`Raw Response:\n\n${rawResponse}\n\nCopy to clipboard?`)) {
                      navigator.clipboard?.writeText(rawResponse);
                    }
                  } catch (e: any) {
                    console.error("Erro no teste Evolution:", e);
                    
                    const errorMsg = e?.message || String(e);
                    
                    toast({
                      title: "❌ Evolution Erro",
                      description: errorMsg,
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
                    const result = await api.bitrix.tokenStatus();
                    if (isErr(result)) {
                      throw new Error(result.error instanceof Error ? result.error.message : String(result.error));
                    }
                    
                    toast({
                      title: "✅ Bitrix OK",
                      description: result.value?.ok ? `Portal: ${result.value.portal || 'N/A'}` : "Token inválido",
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
