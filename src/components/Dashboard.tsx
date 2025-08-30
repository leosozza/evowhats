import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
      
      // Check Bitrix API  
      const bitrixCheck = await supabase.functions.invoke("bitrix-openlines", {
        body: { action: "list_lines" },
      });
      
      console.log("Bitrix API response:", bitrixCheck);

      const evolutionOk = !evolutionCheck.error && (evolutionCheck.data?.ok === true || evolutionCheck.data?.instances !== undefined);
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
                <p className="text-sm text-gray-500">
                  Status:{" "}
                  {apiStatus.evolutionApi ? (
                    <span className="text-green-500">Funcional</span>
                  ) : (
                    <span className="text-red-500">Não Funcional</span>
                  )}
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>API Bitrix</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-gray-500">
                  Status:{" "}
                  {apiStatus.bitrixApi ? (
                    <span className="text-green-500">Funcional</span>
                  ) : (
                    <span className="text-red-500">Não Funcional</span>
                  )}
                </p>
              </CardContent>
            </Card>
          </div>
        </section>
      </div>
    </div>
  );
};

export default Dashboard;
