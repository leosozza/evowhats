import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Activity, Search } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { evolutionApi, EvolutionApiError } from "@/lib/evolutionApi";

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
      const result = await evolutionApi.diagnostic();
      
      const isHealthy = result?.ok === true;
      setApiStatus(prev => ({ ...prev, evolutionApi: isHealthy }));
      
      if (isHealthy) {
        toast({
          title: "✅ API Evolution",
          description: `API funcional com ${result?.steps?.fetchInstances?.instanceCount || 0} instâncias`,
        });
      } else {
        let errorMsg = "API Evolution não está funcional";
        
        if (result?.steps) {
          if (!result.steps.config?.ok) {
            errorMsg = "Configuração incompleta: verifique EVOLUTION_BASE_URL e EVOLUTION_API_KEY";
          } else {
            const failedStep = Object.entries(result.steps).find(([_, step]: [string, any]) => !step.ok);
            if (failedStep) {
              const [stepName, stepData] = failedStep as [string, any];
              errorMsg = `Falha em ${stepName}: ${stepData.error || `Status ${stepData.status}`}`;
              if (stepData.url) {
                errorMsg += ` (URL: ${stepData.url})`;
              }
            }
          }
        } else if (result?.error) {
          errorMsg = result.error;
        }
        
        toast({
          title: "❌ API Evolution",
          description: errorMsg,
          variant: "destructive",
        });
      }
    } catch (error: any) {
      console.error("Error checking Evolution API:", error);
      setApiStatus(prev => ({ ...prev, evolutionApi: false }));
      
      let errorMsg = "Erro desconhecido";
      let details = "";
      
      if (error instanceof EvolutionApiError) {
        errorMsg = error.message;
        details = error.details ? `Status: ${error.statusCode}` : "";
        if (error.url) details += ` URL: ${error.url}`;
      } else {
        errorMsg = error.message || String(error);
      }
      
      toast({
        title: "❌ Erro Evolution",
        description: `${errorMsg}${details ? ` (${details})` : ''}`,
        variant: "destructive",
      });
    }
  };

  const checkBitrixApi = async () => {
    try {
      const bitrixCheck = await supabase.functions.invoke("bitrix-token-refresh", {
        body: {},
      });
      
      console.log("Bitrix API response:", bitrixCheck);

      const bitrixOk = !bitrixCheck.error && bitrixCheck.data?.ok === true;

      setApiStatus(prev => ({
        ...prev,
        bitrixApi: bitrixOk,
      }));

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
      console.error("Error checking Bitrix API:", error);
      toast({
        title: "❌ Erro Bitrix",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const checkApiStatus = async () => {
    await Promise.all([checkEvolutionApi(), checkBitrixApi()]);
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
            <div className="space-y-2">
              <Button 
                size="sm" 
                variant="outline" 
                onClick={async () => {
                  try {
                    const result = await evolutionApi.diagnostic();
                    console.log("Evolution diagnostic:", result);
                    
                    if (result?.ok === true) {
                      setApiStatus(prev => ({ ...prev, evolutionApi: true }));
                      toast({
                        title: "✅ Evolution OK",
                        description: `Diagnóstico completo em ${result.totalMs}ms`,
                      });
                    } else {
                      setApiStatus(prev => ({ ...prev, evolutionApi: false }));
                      
                      // Show detailed step results
                      const failedSteps = Object.entries(result?.steps || {})
                        .filter(([_, step]: [string, any]) => !step.ok)
                        .map(([name, step]: [string, any]) => 
                          `${name}: ${step.error || `Status ${step.status}`}${step.details ? ` - ${step.details}` : ''}`
                        );
                      
                      toast({
                        title: "❌ Evolution Falha",
                        description: failedSteps.length > 0 
                          ? failedSteps.join('\n') 
                          : "Ver console para detalhes",
                        variant: "destructive",
                      });
                    }
                  } catch (e: any) {
                    console.error("Erro no diagnóstico:", e);
                    setApiStatus(prev => ({ ...prev, evolutionApi: false }));
                    
                    let errorMsg = "Erro desconhecido";
                    if (e instanceof EvolutionApiError) {
                      errorMsg = e.message;
                      if (e.details) errorMsg += ` - ${JSON.stringify(e.details)}`;
                    } else {
                      errorMsg = e.message || String(e);
                    }
                    
                    toast({
                      title: "❌ Evolution Erro",
                      description: errorMsg,
                      variant: "destructive",
                    });
                  }
                }}
                className="w-full"
              >
                Testar Novamente
              </Button>
              <Button 
                size="sm" 
                onClick={async () => {
                  try {
                    const result = await evolutionApi.diagnostic();
                    console.log("Evolution diagnostic full:", result);
                    
                    const diagnosticText = JSON.stringify(result, null, 2);
                    
                    toast({
                      title: result?.ok ? "✅ Evolution OK" : "❌ Evolution Falha",
                      description: result?.ok 
                        ? `Diagnóstico completo em ${result.totalMs}ms` 
                        : "Ver console para detalhes completos",
                      variant: result?.ok ? "default" : "destructive",
                    });
                    
                    // Show alert with full details
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
                    const result = await evolutionApi.listInstances();
                    console.log("Evolution test result:", result);
                    
                    const instances = result?.instances || [];
                    toast({
                      title: "✅ Evolution OK",
                      description: `${instances.length} instâncias encontradas`,
                      variant: "default",
                    });
                    
                    // Show raw JSON in modal/alert for debugging
                    const rawResponse = JSON.stringify(result, null, 2);
                    if (window.confirm(`Raw Response:\n\n${rawResponse}\n\nCopy to clipboard?`)) {
                      navigator.clipboard?.writeText(rawResponse);
                    }
                  } catch (e: any) {
                    console.error("Erro no teste Evolution:", e);
                    
                    let errorMsg = "Erro desconhecido";
                    let details = "";
                    
                    if (e instanceof EvolutionApiError) {
                      errorMsg = e.message;
                      details = `Status: ${e.statusCode}`;
                      if (e.details) details += ` - ${JSON.stringify(e.details)}`;
                    } else {
                      errorMsg = e.message || String(e);
                    }
                    
                    toast({
                      title: "❌ Evolution Erro",
                      description: `${errorMsg}${details ? ` (${details})` : ''}`,
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
