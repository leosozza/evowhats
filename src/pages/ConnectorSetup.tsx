
import React, { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { QrCode, CheckCircle2, AlertTriangle, RefreshCw } from "lucide-react";
import { getQrForLine, getStatusForLine, startSessionForLine, ensureLineSession } from "@/services/evolutionConnector";

export default function ConnectorSetup() {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [lineId, setLineId] = useState<string>("");
  const [lineName, setLineName] = useState<string>("");
  const [qrCode, setQrCode] = useState<string | null>(null);
  const [status, setStatus] = useState<string>("");

  useEffect(() => {
    // Pegar parâmetros da URL (enviados pelo Bitrix)
    const urlParams = new URLSearchParams(window.location.search);
    const lineIdParam = urlParams.get("LINE_ID");
    const lineNameParam = urlParams.get("LINE_NAME");
    
    if (lineIdParam) {
      setLineId(lineIdParam);
      setLineName(lineNameParam || `Linha ${lineIdParam}`);
      loadQrCode(lineIdParam, lineNameParam || undefined);
    }
  }, []);

  const loadQrCode = async (lineId: string, lineName?: string) => {
    setLoading(true);
    try {
      // Garantir que a sessão existe
      await ensureLineSession({ bitrix_line_id: lineId, bitrix_line_name: lineName });
      
      // Iniciar a sessão
      await startSessionForLine({ bitrix_line_id: lineId, bitrix_line_name: lineName });
      
      // Buscar QR Code
      const qrResp = await getQrForLine({ bitrix_line_id: lineId, bitrix_line_name: lineName });
      const base64 = qrResp?.data?.base64 || qrResp?.data?.qrcode || null;
      setQrCode(base64);

      // Buscar status
      const statusResp = await getStatusForLine({ bitrix_line_id: lineId, bitrix_line_name: lineName });
      const state = statusResp?.data?.state || "unknown";
      setStatus(String(state));

      if (!base64) {
        toast({
          title: "QR Code não disponível",
          description: "Aguardando geração do QR Code. Tente novamente em alguns segundos.",
          variant: "destructive",
        });
      }
    } catch (error: any) {
      console.error("Erro ao carregar QR Code:", error);
      toast({
        title: "Erro ao carregar QR Code",
        description: error.message || "Falha ao obter QR Code da linha.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleRefresh = () => {
    if (lineId) {
      loadQrCode(lineId, lineName);
    }
  };

  const isConnected = status.toLowerCase().includes("connected") || status.toLowerCase().includes("open");

  return (
    <div className="min-h-screen bg-background p-4">
      <div className="max-w-2xl mx-auto space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <QrCode className="h-5 w-5" />
              Configuração do WhatsApp - {lineName}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="text-center space-y-4">
              <div className="flex items-center justify-center gap-2">
                {isConnected ? (
                  <Badge className="gap-1">
                    <CheckCircle2 className="h-3 w-3 text-green-500" />
                    Conectado
                  </Badge>
                ) : (
                  <Badge variant="secondary" className="gap-1">
                    <AlertTriangle className="h-3 w-3 text-orange-500" />
                    Aguardando Conexão
                  </Badge>
                )}
                <Button variant="outline" size="sm" onClick={handleRefresh} disabled={loading}>
                  <RefreshCw className={`h-4 w-4 mr-1 ${loading ? 'animate-spin' : ''}`} />
                  Atualizar
                </Button>
              </div>

              {isConnected ? (
                <div className="space-y-4">
                  <div className="p-6 bg-green-50 border border-green-200 rounded-lg">
                    <CheckCircle2 className="h-12 w-12 text-green-500 mx-auto mb-4" />
                    <h3 className="font-semibold text-green-800">WhatsApp Conectado!</h3>
                    <p className="text-green-600 mt-2">
                      Sua linha está conectada e pronta para receber mensagens.
                    </p>
                  </div>
                  <Button 
                    onClick={() => window.close()} 
                    className="w-full"
                  >
                    Finalizar Configuração
                  </Button>
                </div>
              ) : (
                <div className="space-y-4">
                  {loading ? (
                    <div className="flex items-center justify-center p-8">
                      <RefreshCw className="h-8 w-8 animate-spin text-muted-foreground" />
                      <span className="ml-2 text-muted-foreground">Carregando QR Code...</span>
                    </div>
                  ) : qrCode ? (
                    <div className="space-y-4">
                      <div className="bg-white p-6 rounded-lg border-2 border-dashed border-muted-foreground/25 inline-block mx-auto">
                        <img
                          src={`data:image/png;base64,${qrCode}`}
                          alt="QR Code WhatsApp"
                          className="w-64 h-64 mx-auto"
                        />
                      </div>
                      <div className="space-y-2 text-center">
                        <h3 className="font-semibold">Escaneie o QR Code</h3>
                        <ol className="text-sm text-muted-foreground space-y-1 text-left max-w-md mx-auto">
                          <li>1. Abra o WhatsApp no seu celular</li>
                          <li>2. Toque em Menu (⋮) ou Configurações</li>
                          <li>3. Toque em "Aparelhos conectados"</li>
                          <li>4. Toque em "Conectar um aparelho"</li>
                          <li>5. Aponte a câmera para o QR Code acima</li>
                        </ol>
                      </div>
                    </div>
                  ) : (
                    <div className="text-center p-8">
                      <AlertTriangle className="h-12 w-12 text-orange-500 mx-auto mb-4" />
                      <p className="text-muted-foreground">
                        Não foi possível gerar o QR Code. Clique em "Atualizar" para tentar novamente.
                      </p>
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="text-xs text-muted-foreground bg-muted p-3 rounded">
              <p><strong>Linha:</strong> {lineName}</p>
              <p><strong>ID:</strong> {lineId}</p>
              <p><strong>Status:</strong> {status}</p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
