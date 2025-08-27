import { useState, useEffect } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { useLineEvolution } from "@/hooks/useLineEvolution";
import { QrCode, Zap, Phone } from "lucide-react";

type Line = {
  ID: string;
  NAME: string;
  id: string;
  name: string;
};

function extractStatusColor(status: string): string {
  status = (status || "").toLowerCase();
  if (status.includes("open") || status.includes("connected")) return "green";
  if (status.includes("connecting") || status.includes("qr") || status.includes("pair")) return "yellow";
  return "red";
}

export default function LineQrManager({ lines }: { lines: Line[] }) {
  const { toast } = useToast();
  const [testPhone, setTestPhone] = useState("");
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

  const handleConnect = async (line: Line) => {
    try {
      await startSession(line.id); // Extract id from line object
      startPolling(line.id, 4000); // Extract id from line object
      toast({ title: "Iniciando conexão", description: `Conectando linha ${line.name}...` });
    } catch (e: any) {
      toast({ title: "Erro", description: e.message || "Falha ao conectar", variant: "destructive" });
    }
  };

  const handleRefresh = async (line: Line) => {
    try {
      await refreshStatus(line.id); // Extract id from line object
    } catch (e: any) {
      toast({ title: "Erro", description: e.message || "Falha ao atualizar", variant: "destructive" });
    }
  };

  const handleTestSend = async (line: Line) => {
    if (!testPhone.trim()) {
      toast({ title: "Telefone obrigatório", description: "Informe um telefone para teste", variant: "destructive" });
      return;
    }
    try {
      await testSend(line.id, testPhone); // Extract id from line object
      toast({ title: "Teste enviado", description: `Mensagem enviada para ${testPhone}` });
    } catch (e: any) {
      toast({ title: "Erro no teste", description: e.message || "Falha ao enviar", variant: "destructive" });
    }
  };

  useEffect(() => {
    lines.forEach((line) => {
      startPolling(line.id, 4000);
    });
    return () => {
      lines.forEach((line) => {
        stopPolling(line.id);
      });
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lines.map((l) => l.ID).join(",")]);

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {lines.map((line) => (
        <Card key={line.ID} className="bg-muted/50">
          <div className="flex items-center justify-between p-4">
            <div>
              <h3 className="text-lg font-semibold">{line.name}</h3>
              <p className="text-sm text-muted-foreground">ID: {line.id}</p>
            </div>
            <Badge variant="secondary" className="uppercase">
              {statusByLine[line.id] || "offline"}
            </Badge>
          </div>

          <div className="p-4 flex flex-col gap-3">
            {qrByLine[line.id] ? (
              <div className="flex flex-col items-center justify-center">
                <img src={qrByLine[line.id]} alt="QR Code" className="max-w-full h-auto" />
                <p className="text-xs text-muted-foreground mt-2">Escaneie para conectar</p>
              </div>
            ) : (
              <div className="flex items-center justify-center">
                <span className={`inline-block h-2 w-2 rounded-full bg-${extractStatusColor(statusByLine[line.id])}-500 mr-2`}></span>
                {statusByLine[line.id] === "connected" ? "Conectado" : "Aguardando leitura do QR Code..."}
              </div>
            )}

            <div className="flex gap-2">
              <Button
                variant="outline"
                onClick={() => handleConnect(line)}
                disabled={loadingLine === line.id}
                className="w-full"
              >
                {loadingLine === line.id ? (
                  <>
                    <QrCode className="mr-2 h-4 w-4 animate-spin" />
                    Conectando...
                  </>
                ) : (
                  <>
                    <QrCode className="mr-2 h-4 w-4" />
                    Reconectar
                  </>
                )}
              </Button>
              <Button variant="secondary" onClick={() => handleRefresh(line)} className="w-full">
                <Refresh className="mr-2 h-4 w-4" />
                Atualizar
              </Button>
            </div>

            <div className="flex items-center gap-2">
              <Input
                type="tel"
                placeholder="Telefone para teste"
                value={testPhone}
                onChange={(e) => setTestPhone(e.target.value)}
                className="flex-grow"
              />
              <Button variant="default" onClick={() => handleTestSend(line)} disabled={loadingLine === line.id}>
                <Zap className="mr-2 h-4 w-4" />
                Testar
              </Button>
            </div>
          </div>
        </Card>
      ))}
    </div>
  );
}

function Refresh(props: any) {
  return (
    <svg
      {...props}
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
      <path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16" />
      <path d="M12 18v-3h3" />
    </svg>
  );
}
