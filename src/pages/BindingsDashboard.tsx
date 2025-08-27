import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { RefreshCw, Settings, Link2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useLineEvolution } from "@/hooks/useLineEvolution";
import { listOpenChannelsLines } from "@/services/bitrixOpenChannelsManager";
import BindingsManager from "@/components/bitrix/BindingsManager";
import LineQrManager from "@/components/bitrix/LineQrManager";

type Line = {
  ID: string;
  NAME: string;
  id: string;
  name: string;
};

const BindingsDashboard = () => {
  const { toast } = useToast();
  const [lines, setLines] = useState<Line[]>([]);
  const [loading, setLoading] = useState(true);
  
  const {
    loadingLine,
    statusByLine,
    qrByLine,
    startSession,
    refreshStatus,
    startPolling,
    stopPolling,
    testSend,
  } = useLineEvolution();

  const loadLines = async () => {
    setLoading(true);
    try {
      const fetchedLines = await listOpenChannelsLines();
      // Adaptando a estrutura dos dados, se necessário
      const adaptedLines = fetchedLines.map(line => ({
        ...line,
        id: line.ID,
        name: line.NAME
      }));
      setLines(adaptedLines);
    } catch (e: any) {
      toast({ title: "Erro", description: e.message || "Falha ao carregar linhas", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadLines();
  }, []);

  const handleConnect = async (line: Line) => {
    try {
      await startSession(line.id);
      startPolling(line.id, 4000);
      toast({ title: "Iniciando conexão", description: `Conectando linha ${line.name}...` });
    } catch (e: any) {
      toast({ title: "Erro", description: e.message || "Falha ao conectar", variant: "destructive" });
    }
  };

  const handleRefresh = async (line: Line) => {
    try {
      await refreshStatus(line.id);
    } catch (e: any) {
      toast({ title: "Erro", description: e.message || "Falha ao atualizar", variant: "destructive" });
    }
  };

  const handleTestSend = async (line: Line) => {
    try {
      await testSend(line.id, "+5511999999999");
      toast({ title: "Teste enviado", description: "Mensagem de teste enviada com sucesso" });
    } catch (e: any) {
      toast({ title: "Erro no teste", description: e.message || "Falha ao enviar", variant: "destructive" });
    }
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <Settings className="h-4 w-4" />
            Gerenciar Integração Bitrix24
          </CardTitle>
          <Button variant="ghost" size="icon" className={loading ? "animate-spin" : ""} onClick={loadLines}>
            <RefreshCw className="h-4 w-4" />
          </Button>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center">
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Carregando linhas...
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {lines.map((line) => (
                <Card key={line.ID} className="p-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="font-medium">{line.NAME}</div>
                      <div className="text-xs text-muted-foreground">ID: {line.ID}</div>
                    </div>
                    <div>
                      {loadingLine === line.id ? (
                        <Badge variant="secondary">Conectando...</Badge>
                      ) : statusByLine[line.id] === "connected" ? (
                        <Badge className="bg-green-100 text-green-800">Conectado</Badge>
                      ) : statusByLine[line.id] === "error" ? (
                        <Badge variant="destructive">Erro</Badge>
                      ) : (
                        <Button variant="outline" size="xs" onClick={() => handleConnect(line)}>
                          Conectar
                        </Button>
                      )}
                      <Button variant="ghost" size="icon" onClick={() => handleRefresh(line)}>
                        <RefreshCw className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                  {qrByLine[line.id] && (
                    <div className="mt-3">
                      <img src={qrByLine[line.id]} alt="QR Code" className="w-32 h-32 mx-auto" />
                    </div>
                  )}
                </Card>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <BindingsManager lines={lines} />
      <LineQrManager lines={lines} />
    </div>
  );
};

export default BindingsDashboard;

import { Loader2 } from "lucide-react";
