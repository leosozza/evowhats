
import React, { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toast } from "@/components/ui/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useLineEvolution } from "@/hooks/useLineEvolution";
import { 
  QrCode, 
  Play, 
  RefreshCw, 
  CheckCircle2, 
  AlertTriangle, 
  Send, 
  Link,
  Phone
} from "lucide-react";

export default function BindingsDashboard() {
  const [instances, setInstances] = useState<any[]>([]);
  const [lines, setLines] = useState<any[]>([]);
  const [selectedTo, setSelectedTo] = useState<string>("");
  const [refreshing, setRefreshing] = useState(false);
  
  const { 
    loadingLine, 
    statusByLine, 
    qrByLine, 
    startSession, 
    refreshStatus,
    startPolling, 
    testSend 
  } = useLineEvolution();

  async function refresh() {
    setRefreshing(true);
    try {
      // Get Evolution instances
      const { data: instData, error: instError } = await supabase.functions.invoke("evolution-connector-v2", {
        body: { action: "list_instances" },
      });
      
      if (instError) {
        console.error("Failed to fetch instances:", instError);
        toast({ 
          title: "Erro ao buscar instâncias", 
          description: instError.message,
          variant: "destructive" 
        });
      } else {
        setInstances(instData?.instances || []);
      }

      // Get Bitrix Open Lines
      const { data: linesData, error: linesError } = await supabase.functions.invoke("bitrix-openlines", {
        body: { action: "list_lines" },
      });
      
      if (linesError) {
        console.error("Failed to fetch lines:", linesError);
        toast({ 
          title: "Erro ao buscar linhas", 
          description: linesError.message,
          variant: "destructive" 
        });
      } else {
        setLines(linesData?.lines || []);
      }
    } finally {
      setRefreshing(false);
    }
  }

  useEffect(() => { 
    refresh(); 
  }, []);

  async function bind(instanceId: string, lineId: string) {
    try {
      const { data, error } = await supabase.functions.invoke("evolution-connector-v2", {
        body: { action: "bind_line", instanceId, lineId },
      });
      
      if (error) throw error;
      if (!data?.ok) throw new Error("Failed to bind line");
      
      toast({ title: "Linha vinculada com sucesso!" });
      refresh();
    } catch (error: any) {
      toast({ 
        title: "Falha ao vincular linha", 
        description: error.message,
        variant: "destructive" 
      });
    }
  }

  async function handleStartSession(instanceId: string, lineId: string) {
    if (!lineId) {
      toast({ title: "Vincule uma linha primeiro", variant: "destructive" });
      return;
    }
    
    try {
      // Map to hook expected format
      const mappedLine = { id: lineId, name: `Line ${lineId}` };
      await startSession(mappedLine);
      startPolling(mappedLine);
      toast({ title: "Sessão iniciada com sucesso!" });
    } catch (error: any) {
      toast({ 
        title: "Erro ao iniciar sessão", 
        description: error.message, 
        variant: "destructive" 
      });
    }
  }

  async function handleRefreshStatus(lineId: string) {
    if (!lineId) return;
    
    try {
      // Map to hook expected format
      const mappedLine = { id: lineId, name: `Line ${lineId}` };
      await refreshStatus(mappedLine);
      toast({ title: "Status atualizado!" });
    } catch (error: any) {
      toast({ 
        title: "Erro ao atualizar status", 
        description: error.message, 
        variant: "destructive" 
      });
    }
  }

  async function handleTestSend(lineId: string) {
    if (!selectedTo.trim()) {
      toast({ title: "Informe um número de telefone", variant: "destructive" });
      return;
    }
    
    if (!lineId) {
      toast({ title: "Vincule uma linha primeiro", variant: "destructive" });
      return;
    }
    
    try {
      await testSend(lineId, selectedTo);
      toast({ title: "Mensagem de teste enviada com sucesso!" });
    } catch (error: any) {
      toast({ 
        title: "Erro no teste de envio", 
        description: error.message, 
        variant: "destructive" 
      });
    }
  }

  function getStatusBadge(status: string) {
    const state = status.toLowerCase();
    
    if (state.includes("open") || state.includes("connected")) {
      return (
        <Badge className="gap-1 bg-green-100 text-green-800">
          <CheckCircle2 className="h-3 w-3" />
          Conectado
        </Badge>
      );
    }
    
    if (state.includes("connecting") || state.includes("qr")) {
      return (
        <Badge variant="secondary" className="gap-1">
          <AlertTriangle className="h-3 w-3 text-orange-500" />
          Conectando
        </Badge>
      );
    }
    
    return (
      <Badge variant="outline">
        {status || "Desconhecido"}
      </Badge>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Painel de Integrações</h1>
        <Button onClick={refresh} disabled={refreshing}>
          <RefreshCw className={`h-4 w-4 mr-2 ${refreshing ? "animate-spin" : ""}`} />
          {refreshing ? "Atualizando..." : "Atualizar"}
        </Button>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        {/* Evolution Instances */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <QrCode className="h-5 w-5" />
              Instâncias Evolution API
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {instances.length === 0 ? (
              <div className="text-sm text-muted-foreground text-center py-8">
                Nenhuma instância encontrada.
                <br />
                Configure a Evolution API nas configurações.
              </div>
            ) : (
              instances.map((instance) => {
                const lineId = instance.bound_line_id;
                const currentStatus = lineId ? statusByLine[lineId] || instance.status : instance.status;
                const qrCode = lineId ? qrByLine[lineId] : null;
                const isLoading = lineId ? loadingLine === lineId : false;

                return (
                  <Card key={instance.id} className="p-4">
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <div>
                          <div className="font-medium">{instance.label}</div>
                          <div className="text-sm text-muted-foreground">ID: {instance.id}</div>
                        </div>
                        {getStatusBadge(currentStatus)}
                      </div>

                      {/* Line Binding */}
                      <div className="flex gap-2 items-center">
                        <Link className="h-4 w-4 text-muted-foreground" />
                        <select
                          className="flex-1 border rounded p-2 text-sm"
                          value={lineId || ""}
                          onChange={(e) => bind(instance.id, e.target.value)}
                        >
                          <option value="">Vincular à linha Open Lines...</option>
                          {lines.map((line) => (
                            <option key={line.ID} value={line.ID}>
                              {line.NAME} (ID: {line.ID})
                            </option>
                          ))}
                        </select>
                      </div>

                      {/* Actions */}
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          onClick={() => handleStartSession(instance.id, lineId)}
                          disabled={!lineId || isLoading}
                          className="bg-green-600 hover:bg-green-700"
                        >
                          <Play className="h-4 w-4 mr-1" />
                          Iniciar/QR
                        </Button>
                        
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleRefreshStatus(lineId)}
                          disabled={!lineId || isLoading}
                        >
                          <RefreshCw className={`h-4 w-4 mr-1 ${isLoading ? "animate-spin" : ""}`} />
                          Status
                        </Button>
                      </div>

                      {/* Test Send */}
                      <div className="flex gap-2 items-center">
                        <Phone className="h-4 w-4 text-muted-foreground" />
                        <Input
                          placeholder="Telefone para teste (ex: +5511999999999)"
                          value={selectedTo}
                          onChange={(e) => setSelectedTo(e.target.value)}
                          className="flex-1"
                        />
                        <Button
                          size="sm"
                          onClick={() => handleTestSend(lineId)}
                          disabled={!lineId || !selectedTo.trim()}
                        >
                          <Send className="h-4 w-4 mr-1" />
                          Testar
                        </Button>
                      </div>

                      {/* QR Code Display */}
                      {qrCode && (
                        <div className="mt-4 p-4 bg-gray-50 rounded-lg text-center">
                          <img
                            src={qrCode}
                            alt={`QR Code para ${instance.label}`}
                            className="w-48 h-48 mx-auto border rounded bg-white p-2"
                          />
                          <div className="text-sm text-muted-foreground mt-2">
                            <QrCode className="h-4 w-4 inline mr-1" />
                            Escaneie este QR no WhatsApp para conectar
                          </div>
                        </div>
                      )}

                      {isLoading && (
                        <div className="flex items-center justify-center text-sm text-muted-foreground">
                          <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                          Processando...
                        </div>
                      )}
                    </div>
                  </Card>
                );
              })
            )}
          </CardContent>
        </Card>

        {/* Bitrix Open Lines */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Phone className="h-5 w-5" />
              Linhas Open Lines (Bitrix24)
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {lines.length === 0 ? (
              <div className="text-sm text-muted-foreground text-center py-8">
                Nenhuma linha encontrada.
                <br />
                Configure o Bitrix24 primeiro.
              </div>
            ) : (
              lines.map((line) => {
                const currentStatus = statusByLine[line.ID] || "unknown";
                const hasQr = !!qrByLine[line.ID];
                
                return (
                  <Card key={line.ID} className="p-3">
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="font-medium">{line.NAME}</div>
                        <div className="text-sm text-muted-foreground">
                          ID: {line.ID} | Status: {currentStatus}
                        </div>
                        {hasQr && (
                          <div className="text-xs text-orange-600 mt-1">
                            QR Code disponível para escaneamento
                          </div>
                        )}
                      </div>
                      {getStatusBadge(currentStatus)}
                    </div>
                  </Card>
                );
              })
            )}
          </CardContent>
        </Card>
      </div>

      {/* Instructions */}
      <Card>
        <CardContent className="pt-6">
          <div className="text-sm space-y-2">
            <h3 className="font-medium">Como usar:</h3>
            <ol className="list-decimal list-inside space-y-1 text-muted-foreground">
              <li>Configure a Evolution API nas configurações</li>
              <li>Configure o Bitrix24 OAuth</li>
              <li>Vincule uma instância Evolution a uma linha Open Lines</li>
              <li>Clique em "Iniciar/QR" para conectar</li>
              <li>Escaneie o QR Code no WhatsApp</li>
              <li>Teste o envio com um número válido</li>
            </ol>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
