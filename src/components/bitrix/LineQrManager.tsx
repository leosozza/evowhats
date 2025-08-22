
import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { QrCode, Play, RefreshCw, CheckCircle2, AlertTriangle } from "lucide-react";
import { useLineEvolution } from "@/hooks/useLineEvolution";

type Line = { ID: string; NAME: string };

export default function LineQrManager({ lines }: { lines: Line[] }) {
  const { toast } = useToast();
  const {
    loadingLine,
    qrByLine,
    statusByLine,
    startSession,
    refreshStatus,
    startPolling,
  } = useLineEvolution();
  const [lastActionLine, setLastActionLine] = useState<string | null>(null);

  const handleShowQr = async (line: Line) => {
    setLastActionLine(line.ID);
    try {
      await startSession(line);
      startPolling(line);
      toast({
        title: "Sessão iniciada",
        description: `Iniciando conexão para a linha ${line.NAME}. QR será exibido se necessário.`,
      });
    } catch (e: any) {
      console.error("[LineQrManager] Session start error:", e);
      toast({
        title: "Erro ao iniciar sessão",
        description: e.message || "Falha ao iniciar sessão Evolution para a linha.",
        variant: "destructive",
      });
    }
  };

  const handleRefreshStatus = async (line: Line) => {
    setLastActionLine(line.ID);
    try {
      await refreshStatus(line);
      toast({
        title: "Status atualizado",
        description: `Status da linha ${line.NAME} foi verificado.`,
      });
    } catch (e: any) {
      console.error("[LineQrManager] Refresh error:", e);
      toast({
        title: "Erro ao atualizar",
        description: e.message || "Falha ao verificar status da linha.",
        variant: "destructive",
      });
    }
  };

  if (!lines || lines.length === 0) return null;

  return (
    <Card className="p-4 space-y-3">
      <div className="flex items-center justify-between">
        <Label className="font-medium">Conexão WhatsApp Evolution API</Label>
      </div>
      <div className="space-y-3">
        {lines.map((line) => {
          const currentStatus = statusByLine[line.ID] || "";
          const stateLower = currentStatus.toLowerCase();
          const connected = stateLower.includes("connected") || stateLower.includes("open");
          const pending = stateLower.includes("qr") || stateLower.includes("pair") || stateLower === "" || stateLower === "unknown" || stateLower.includes("connecting");
          const qrCode = qrByLine[line.ID];

          return (
            <Card key={line.ID} className="p-3">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
                <div>
                  <div className="font-medium">{line.NAME}</div>
                  <div className="text-xs text-muted-foreground">ID: {line.ID}</div>
                  <div className="text-xs text-muted-foreground">Instância: evo_line_{line.ID}</div>
                  <div className="mt-2 flex items-center gap-2">
                    {connected ? (
                      <Badge className="gap-1 bg-green-100 text-green-800">
                        <CheckCircle2 className="h-3 w-3" />
                        Conectado
                      </Badge>
                    ) : pending ? (
                      <Badge variant="secondary" className="gap-1">
                        <AlertTriangle className="h-3 w-3 text-orange-500" />
                        {qrCode ? "QR Disponível" : "Aguardando..."}
                      </Badge>
                    ) : (
                      <Badge variant="outline">
                        {currentStatus || "Desconhecido"}
                      </Badge>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleRefreshStatus(line)}
                    disabled={loadingLine === line.ID}
                  >
                    <RefreshCw className={`h-4 w-4 mr-1 ${loadingLine === line.ID ? "animate-spin" : ""}`} />
                    Verificar
                  </Button>

                  <Button
                    size="sm"
                    onClick={() => handleShowQr(line)}
                    disabled={loadingLine === line.ID}
                    className="bg-green-600 hover:bg-green-700"
                  >
                    <Play className="h-4 w-4 mr-1" />
                    {connected ? "Reconectar" : "Conectar"}
                  </Button>
                </div>
              </div>

              {qrCode && (
                <div className="mt-4 p-3 bg-gray-50 rounded-lg">
                  <div className="flex items-center justify-center">
                    <img
                      alt={`QR Code para ${line.NAME}`}
                      src={`data:image/png;base64,${qrCode}`}
                      className="w-48 h-48 border rounded bg-white p-2"
                    />
                  </div>
                  <div className="text-sm text-center text-muted-foreground mt-2">
                    <QrCode className="h-4 w-4 inline mr-1" />
                    Escaneie este QR no WhatsApp para conectar
                  </div>
                  {lastActionLine === line.ID && (
                    <div className="text-xs text-center text-muted-foreground mt-1">
                      O QR é atualizado automaticamente até a conexão ser estabelecida
                    </div>
                  )}
                </div>
              )}

              {loadingLine === line.ID && (
                <div className="mt-3 flex items-center justify-center text-sm text-muted-foreground">
                  <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                  Processando...
                </div>
              )}
            </Card>
          );
        })}
      </div>
      
      <div className="text-xs text-muted-foreground bg-blue-50 p-3 rounded">
        <strong>Como funciona:</strong>
        <br />
        1. Clique em "Conectar" para iniciar uma nova sessão Evolution
        <br />
        2. Se necessário, um QR Code será exibido para pareamento
        <br />
        3. Escaneie o QR no WhatsApp para conectar a linha
        <br />
        4. O status será atualizado automaticamente quando conectado
      </div>
    </Card>
  );
}
