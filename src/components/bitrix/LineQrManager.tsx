
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
        description: `Se a linha ${line.NAME} não estiver conectada, o QR será exibido e atualizado automaticamente.`,
      });
    } catch (e: any) {
      console.error("[LineQrManager] QR error:", e);
      toast({
        title: "Erro ao iniciar/obter QR",
        description: e.message || "Falha ao iniciar sessão Evolution ou obter QR da linha.",
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
        description: `Status da linha ${line.NAME} foi atualizado.`,
      });
    } catch (e: any) {
      console.error("[LineQrManager] Status error:", e);
      toast({
        title: "Erro ao obter status",
        description: e.message || "Falha ao obter status da linha.",
        variant: "destructive",
      });
    }
  };

  if (!lines || lines.length === 0) return null;

  return (
    <Card className="p-4 space-y-3">
      <div className="flex items-center justify-between">
        <Label className="font-medium">Conexão WhatsApp por Linha (Evolution)</Label>
      </div>
      <div className="space-y-3">
        {lines.map((line) => {
          const stateLower = (statusByLine[line.ID] || "").toLowerCase();
          const connected = stateLower.includes("connected") || stateLower.includes("open");
          const pending = stateLower.includes("qr") || stateLower.includes("pair") || stateLower === "" || stateLower === "unknown" || stateLower.includes("connecting");

          return (
            <Card key={line.ID} className="p-3">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
                <div>
                  <div className="font-medium">{line.NAME}</div>
                  <div className="text-xs text-muted-foreground">ID: {line.ID}</div>
                  <div className="mt-2 flex items-center gap-2">
                    {connected ? (
                      <Badge className="gap-1">
                        <CheckCircle2 className="h-3 w-3 text-green-500" />
                        Conectado
                      </Badge>
                    ) : pending ? (
                      <Badge variant="secondary" className="gap-1">
                        <AlertTriangle className="h-3 w-3 text-orange-500" />
                        Aguardando Conexão
                      </Badge>
                    ) : (
                      <Badge variant="outline">Status: {stateLower || "desconhecido"}</Badge>
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
                    Status
                  </Button>

                  <Button
                    size="sm"
                    onClick={() => handleShowQr(line)}
                    disabled={loadingLine === line.ID}
                  >
                    <QrCode className="h-4 w-4 mr-1" />
                    Mostrar QR
                  </Button>

                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleShowQr(line)}
                    disabled={loadingLine === line.ID}
                  >
                    <Play className="h-4 w-4 mr-1" />
                    Iniciar
                  </Button>
                </div>
              </div>

              {qrByLine[line.ID] && (
                <div className="mt-3">
                  <img
                    alt={`QR ${line.NAME}`}
                    src={`data:image/png;base64,${qrByLine[line.ID]}`}
                    className="w-48 h-48 border rounded bg-white"
                  />
                  <div className="text-xs text-muted-foreground mt-2">
                    Escaneie o QR no WhatsApp para conectar a linha.
                  </div>
                  {lastActionLine === line.ID && (
                    <div className="text-[11px] text-muted-foreground mt-1">
                      O QR é atualizado automaticamente a cada poucos segundos até conectar.
                    </div>
                  )}
                </div>
              )}
            </Card>
          );
        })}
      </div>
    </Card>
  );
}
