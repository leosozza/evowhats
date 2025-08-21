
import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { getQrForLine, getStatusForLine, startSessionForLine, ensureLineSession } from "@/services/evolutionConnector";
import { QrCode, Play, RefreshCw, CheckCircle2, AlertTriangle } from "lucide-react";

type Line = { ID: string; NAME: string };

export default function LineQrManager({ lines }: { lines: Line[] }) {
  const { toast } = useToast();
  const [loadingLine, setLoadingLine] = useState<string | null>(null);
  const [qrByLine, setQrByLine] = useState<Record<string, string | null>>({});
  const [statusByLine, setStatusByLine] = useState<Record<string, string>>({});

  const handleShowQr = async (line: Line) => {
    setLoadingLine(line.ID);
    try {
      // Garante sessão, inicia e busca QR
      await ensureLineSession({ bitrix_line_id: line.ID, bitrix_line_name: line.NAME });
      await startSessionForLine({ bitrix_line_id: line.ID, bitrix_line_name: line.NAME });
      const qrResp = await getQrForLine({ bitrix_line_id: line.ID, bitrix_line_name: line.NAME });
      const base64 = qrResp?.data?.base64 || qrResp?.data?.qrcode || null;
      setQrByLine((prev) => ({ ...prev, [line.ID]: base64 }));

      toast({
        title: base64 ? "QR atualizado" : "QR não disponível",
        description: base64 ? `Escaneie o QR para a linha ${line.NAME}.` : "Aguardando geração do QR.",
      });
    } catch (e: any) {
      console.error("[LineQrManager] QR error:", e);
      toast({
        title: "Erro ao obter QR",
        description: e.message || "Falha ao obter QR da linha.",
        variant: "destructive",
      });
    } finally {
      setLoadingLine(null);
    }
  };

  const handleRefreshStatus = async (line: Line) => {
    setLoadingLine(line.ID);
    try {
      const st = await getStatusForLine({ bitrix_line_id: line.ID, bitrix_line_name: line.NAME });
      const state = st?.data?.state || "unknown";
      setStatusByLine((prev) => ({ ...prev, [line.ID]: String(state) }));
    } catch (e: any) {
      console.error("[LineQrManager] Status error:", e);
      toast({
        title: "Erro ao obter status",
        description: e.message || "Falha ao obter status da linha.",
        variant: "destructive",
      });
    } finally {
      setLoadingLine(null);
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
          const status = (statusByLine[line.ID] || "").toLowerCase();
          const connected = status.includes("connected") || status.includes("open");
          const pending = status.includes("qr") || status.includes("pair") || status === "" || status === "unknown";

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
                      <Badge variant="outline">Status: {status || "desconhecido"}</Badge>
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
                </div>
              )}
            </Card>
          );
        })}
      </div>
    </Card>
  );
}
