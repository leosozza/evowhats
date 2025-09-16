import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Loader2, CheckCircle, XCircle, Info } from "lucide-react";
import { callEvolution } from "@/utils/callEvolution";
import { useToast } from "@/hooks/use-toast";

export function Diagnostics() {
  const [isRunning, setIsRunning] = useState(false);
  const [results, setResults] = useState<any>(null);
  const [instances, setInstances] = useState<any[]>([]);
  const { toast } = useToast();

  const runDiagnostics = async () => {
    setIsRunning(true);
    setResults(null);
    setInstances([]);

    try {
      // Run main diagnostics
      const diagResult = await callEvolution("diag");
      setResults(diagResult);
      
      // Get Evolution instances list for better diagnostics
      const evolutionResult = await callEvolution("diag_evolution");
      if (evolutionResult?.ok && evolutionResult?.instances) {
        setInstances(evolutionResult.instances);
      }
      
      if (diagResult?.ok) {
        toast({
          title: "Diagnóstico concluído",
          description: "Sistema funcionando corretamente",
        });
      }
    } catch (error) {
      console.error("Diagnostics error:", error);
      toast({
        title: "Erro no diagnóstico",
        description: error instanceof Error ? error.message : "Erro desconhecido",
        variant: "destructive",
      });
      setResults({ error: error instanceof Error ? error.message : "Erro desconhecido" });
    } finally {
      setIsRunning(false);
    }
  };

  const getStatusIcon = (status: boolean | undefined) => {
    if (status === true) return <CheckCircle className="h-4 w-4 text-green-500" />;
    if (status === false) return <XCircle className="h-4 w-4 text-red-500" />;
    return <Info className="h-4 w-4 text-blue-500" />;
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Diagnóstico do Sistema</CardTitle>
          <CardDescription>
            Verifique o status das conexões e configurações
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button 
            onClick={runDiagnostics} 
            disabled={isRunning}
            className="w-full"
          >
            {isRunning && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Executar Diagnóstico
          </Button>
          
          {results && (
            <div className="mt-4 space-y-4">
              {results.error ? (
                <Alert variant="destructive">
                  <XCircle className="h-4 w-4" />
                  <AlertDescription>{results.error}</AlertDescription>
                </Alert>
              ) : (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span>Sistema Evolution</span>
                    <Badge variant={results.ok ? "default" : "destructive"}>
                      {getStatusIcon(results.ok)}
                      <span className="ml-1">{results.ok ? "OK" : "Erro"}</span>
                    </Badge>
                  </div>
                  
                  {instances.length > 0 && (
                    <div className="border rounded p-3 bg-muted/50">
                      <h4 className="text-sm font-medium mb-2">Instâncias Evolution ({instances.length}):</h4>
                      <div className="space-y-1">
                        {instances.map((instance, idx) => (
                          <div key={idx} className="text-xs text-muted-foreground">
                            • {instance.instanceName || instance.name || instance.id || `Instance ${idx + 1}`}
                            {instance.state && ` (${instance.state})`}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  
                  {results.steps && Object.keys(results.steps).length > 0 && (
                    <div className="border rounded p-3 bg-muted/50">
                      <h4 className="text-sm font-medium mb-2">Detalhes:</h4>
                      <pre className="text-xs text-muted-foreground overflow-x-auto">
                        {JSON.stringify(results.steps, null, 2)}
                      </pre>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}