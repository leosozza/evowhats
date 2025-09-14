import React, { useEffect, useState, useCallback, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "@/hooks/use-toast";
import { useNavigate, Link } from "react-router-dom";
import { ArrowLeft, Eye } from "lucide-react";
import { api } from "@/api/provider";
import { unwrap, isErr } from "@/core/result";
import { ConnectionStatusIndicator } from "@/components/ConnectionStatusIndicator";

export default function EvolutionInstances() {
  const navigate = useNavigate();
  const [instances, setInstances] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [newLineId, setNewLineId] = useState("");
  const [testNumbers, setTestNumbers] = useState<{ [key: string]: string }>({});
  const [qrCodes, setQrCodes] = useState<{ [key: string]: string }>({});
  const [connectionStates, setConnectionStates] = useState<{ [key: string]: string }>({});
  const [pollingInstances, setPollingInstances] = useState<Set<string>>(new Set());
  const [openChannels, setOpenChannels] = useState<any[]>([]);
  const pollingIntervals = useRef<{ [key: string]: NodeJS.Timeout }>({});

  // Limpeza de intervals ao desmontar
  useEffect(() => {
    return () => {
      Object.values(pollingIntervals.current).forEach(clearInterval);
    };
  }, []);

  const loadInstances = async () => {
    try {
      setLoading(true);
      console.log(JSON.stringify({
        category: 'UI',
        view: 'EvolutionInstances',
        action: 'loadInstances'
      }));

      const result = await api.evolution.list();
      
      if (isErr(result)) {
        const errorMsg = result.error instanceof Error ? result.error.message : String(result.error);
        throw new Error(errorMsg || "Failed to load instances");
      }

      const instanceList = result.value.instances || [];
      setInstances(instanceList);
      
      // Load connection states for each instance
      for (const instance of instanceList) {
        const lineId = instance.id.replace('evo_line_', '');
        checkConnectionState(lineId);
      }
      
      toast({
        title: "✅ Sucesso",
        description: `${instanceList.length} instâncias carregadas`,
      });
    } catch (error: any) {
      console.error("Error loading instances:", error);
      
      toast({
        title: "❌ Erro",
        description: error.message || "Erro desconhecido",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const loadOpenChannels = async () => {
    try {
      const result = await api.bitrix.listLines();
      
      if (!isErr(result) && result.value?.lines) {
        setOpenChannels(result.value.lines);
      }
    } catch (error) {
      console.error("Error loading open channels:", error);
    }
  };

  const checkConnectionState = async (lineId: string) => {
    try {
      const result = await api.evolution.status(lineId);
      
      if (isErr(result)) {
        const errorMsg = result.error instanceof Error ? result.error.message : String(result.error);
        console.error(`Error checking state for line ${lineId}:`, errorMsg);
        setConnectionStates(prev => ({ ...prev, [lineId]: "error" }));
        return "error";
      }

      const state = (result.value?.state || "unknown").toLowerCase();
      setConnectionStates(prev => ({ ...prev, [lineId]: state }));

      return state;
    } catch (error: any) {
      console.error(`Error checking state for line ${lineId}:`, error);
      setConnectionStates(prev => ({ ...prev, [lineId]: "error" }));
      return "error";
    }
  };

  const startSimplePolling = useCallback((lineId: string) => {
    // Parar polling existente se houver
    if (pollingIntervals.current[lineId]) {
      clearInterval(pollingIntervals.current[lineId]);
    }

    setPollingInstances(prev => new Set(prev).add(lineId));

    const poll = async () => {
      try {
        const state = await checkConnectionState(lineId);
        
        // Se conectando, tentar pegar QR code
        if (state === "connecting" || state === "pending_qr") {
          try {
            const qrResult = await api.evolution.qr(lineId);
            
            if (!isErr(qrResult)) {
              const qrData = qrResult.value;
              if (qrData?.qr_base64) {
                setQrCodes(prev => ({ ...prev, [lineId]: `data:image/png;base64,${qrData.qr_base64}` }));
              } else if (qrData?.base64) {
                setQrCodes(prev => ({ ...prev, [lineId]: `data:image/png;base64,${qrData.base64}` }));
              }
            }
          } catch (error) {
            console.error("Error getting QR:", error);
          }
        } else if (state === "open" || state === "connected") {
          // Conectado - parar polling
          clearInterval(pollingIntervals.current[lineId]);
          delete pollingIntervals.current[lineId];
          setPollingInstances(prev => {
            const newSet = new Set(prev);
            newSet.delete(lineId);
            return newSet;
          });
          setQrCodes(prev => ({ ...prev, [lineId]: "" }));
          
          toast({
            title: "✅ Conectado",
            description: `Instância ${lineId} conectada com sucesso`,
          });
        }
      } catch (error) {
        console.error("Polling error:", error);
      }
    };

    // Polling inicial e depois a cada 5 segundos
    poll();
    pollingIntervals.current[lineId] = setInterval(poll, 5000);

    // Auto-stop após 2 minutos
    setTimeout(() => {
      if (pollingIntervals.current[lineId]) {
        clearInterval(pollingIntervals.current[lineId]);
        delete pollingIntervals.current[lineId];
        setPollingInstances(prev => {
          const newSet = new Set(prev);
          newSet.delete(lineId);
          return newSet;
        });
      }
    }, 120000);
  }, []);

  const createInstance = async () => {
    if (!newLineId) {
      toast({
        title: "⚠️ Atenção", 
        description: "Digite um Line ID",
        variant: "destructive",
      });
      return;
    }

    try {
      console.log(JSON.stringify({
        category: 'UI',
        view: 'EvolutionInstances',
        action: 'createInstance',
        lineId: newLineId
      }));

      // Primeiro garante a instância
      const ensureResult = await api.evolution.ensure(newLineId);
      
      if (isErr(ensureResult)) {
        const errorMsg = ensureResult.error instanceof Error ? ensureResult.error.message : String(ensureResult.error);
        throw new Error(errorMsg || "Failed to ensure instance");
      }

      toast({
        title: "✅ Instância garantida",
        description: `Instância ${ensureResult.value?.instance} criada/garantida`,
      });
      
      setNewLineId("");
      await loadInstances();
    } catch (error: any) {
      console.error("Error creating instance:", error);
      
      const errorMsg = error?.message || String(error) || "Erro desconhecido";
      
      toast({
        title: "❌ Erro",
        description: errorMsg,
        variant: "destructive",
      });
    }
  };

  const connectInstance = async (lineId: string) => {
    try {
      console.log(JSON.stringify({
        category: 'UI',
        view: 'EvolutionInstances',
        action: 'connectInstance',
        lineId
      }));

      const result = await api.evolution.start(lineId);
      
      if (isErr(result)) {
        const errorMsg = result.error instanceof Error ? result.error.message : String(result.error);
        throw new Error(errorMsg || "Failed to start session");
      }

      toast({
        title: "✅ Sessão iniciada",
        description: "Verificando status e gerando QR...",
      });
      
      startSimplePolling(lineId);
    } catch (error: any) {
      console.error("Error connecting instance:", error);
      
      const errorMsg = error?.message || String(error) || "Erro desconhecido";
      
      toast({
        title: "❌ Erro",
        description: errorMsg,
        variant: "destructive",
      });
    }
  };

  const bindToChannel = async (instanceId: string, lineId: string) => {
    try {
      console.log(JSON.stringify({
        category: 'UI',
        view: 'EvolutionInstances',
        action: 'bindToChannel',
        instanceId,
        lineId
      }));

      const result = await api.evolution.bind(instanceId, lineId);
      
      if (isErr(result)) {
        const errorMsg = result.error instanceof Error ? result.error.message : String(result.error);
        throw new Error(errorMsg || "Failed to bind line");
      }
      
      toast({
        title: "✅ Sucesso",
        description: `Instância vinculada ao canal ${lineId}`,
      });
    } catch (error: any) {
      const errorMsg = error?.message || String(error) || "Erro desconhecido";
      
      toast({
        title: "❌ Erro",
        description: errorMsg,
        variant: "destructive",
      });
    }
  };

  const testSend = async (lineId: string) => {
    const number = testNumbers[lineId];
    if (!number) {
      toast({
        title: "⚠️ Atenção",
        description: "Digite um número para testar",
        variant: "destructive",
      });
      return;
    }

    try {
      console.log(JSON.stringify({
        category: 'UI',
        view: 'EvolutionInstances',
        action: 'testSend',
        lineId,
        to: number
      }));

      const result = await api.evolution.testSend(lineId, number, "Teste de envio da instância Evolution");
      
      if (isErr(result)) {
        const errorMsg = result.error instanceof Error ? result.error.message : String(result.error);
        throw new Error(errorMsg || "Failed to send test message");
      }

      toast({
        title: "✅ Sucesso",
        description: `Mensagem de teste enviada para ${number}`,
      });
    } catch (error: any) {
      console.error("Error sending test message:", error);
      
      const errorMsg = error?.message || String(error) || "Erro desconhecido";
      
      toast({
        title: "❌ Erro",
        description: errorMsg,
        variant: "destructive",
      });
    }
  };

  useEffect(() => {
    loadInstances();
    loadOpenChannels();
  }, []);

  const getStatusColor = (state: string) => {
    switch (state) {
      case "open": return "text-green-500";
      case "connecting": return "text-yellow-500";
      case "close": return "text-red-500";
      case "error": return "text-red-500";
      default: return "text-gray-500";
    }
  };

  return (
    <div className="container mx-auto py-8 px-4">
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <Button variant="ghost" onClick={() => navigate("/")} className="flex items-center gap-2">
            <ArrowLeft className="h-4 w-4" />
            Voltar ao Dashboard
          </Button>
          <h1 className="text-2xl font-bold">Instâncias Evolution</h1>
        </div>

        <Card>
          <CardHeader><CardTitle>Evolution API — Validação & Criação</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="flex gap-2 items-end">
              <Button variant="outline" onClick={loadInstances} disabled={loading}>
                {loading ? "Validando..." : "Validar API / Recarregar"}
              </Button>
              <div className="flex items-end gap-2">
                <div>
                  <label className="block text-sm">Line ID</label>
                  <Input 
                    value={newLineId} 
                    onChange={e => setNewLineId(e.target.value)} 
                    placeholder="Ex.: 15" 
                  />
                </div>
                <Button onClick={createInstance}>Criar instância</Button>
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4">
          {instances.map((instance) => {
            const instName = instance.instanceName || instance.instance?.instanceName;
            const lineId = (instName?.replace('evo_line_', '')) || instance.id;
            const state = connectionStates[lineId] || "unknown";
            
            return (
              <Card key={instance.id} className="hover:shadow-md transition-shadow">
                <CardHeader>
                  <CardTitle className="flex items-center justify-between">
                    <Link to={`/evolution/instances/${instance.id}`} className="hover:text-primary">
                      {(instance.instanceName || instance.instance?.instanceName) || instance.id}
                    </Link>
                    <ConnectionStatusIndicator 
                      status={state}
                      isLoading={pollingInstances.has(lineId)}
                      instanceName={instName}
                    />
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex gap-2 flex-wrap">
                    <Button
                      size="sm" 
                      onClick={() => checkConnectionState(lineId)}
                    >
                      Verificar Status
                    </Button>
                    
                    <Button
                      onClick={() => {
                        const lineId = instance.instanceName?.replace('evo_line_', '') || instance.id;
                        connectInstance(lineId);
                      }}
                      disabled={pollingInstances.has(instance.instanceName?.replace('evo_line_', '') || instance.id)}
                    >
                      {pollingInstances.has(instance.instanceName?.replace('evo_line_', '') || instance.id)
                        ? "Conectando..." 
                        : "Conectar / QR"}
                    </Button>

                    {/* Bind to Open Channel */}
                    <div className="flex gap-2 mt-2">
                      <select 
                        className="flex-1 border rounded px-2 py-1 text-sm"
                        onChange={(e) => {
                          if (e.target.value) {
                            bindToChannel((instance.instanceName || instance.instance?.instanceName) || instance.id, e.target.value);
                          }
                        }}
                      >
                        <option value="">Vincular ao canal OL...</option>
                        {openChannels.map(channel => (
                          <option key={channel.ID} value={channel.ID}>
                            {channel.NAME} (ID: {channel.ID})
                          </option>
                        ))}
                      </select>
                    </div>
                    
                    <Link to={`/evolution/instances/${instance.id}`}>
                      <Button size="sm" variant="outline" className="flex items-center gap-1">
                        <Eye className="h-3 w-3" />
                        Detalhes
                      </Button>
                    </Link>
                  </div>

                  {/* QR Code display */}
                  {qrCodes[((instance.instanceName || instance.instance?.instanceName)?.replace('evo_line_', '')) || instance.id] && (
                    <div className="mt-4 p-4 border rounded bg-white">
                      {qrCodes[((instance.instanceName || instance.instance?.instanceName)?.replace('evo_line_', '')) || instance.id].startsWith('pairing:') ? (
                        <div>
                          <p className="text-sm font-medium mb-2">Código de Pareamento:</p>
                          <div className="text-center text-2xl font-mono bg-gray-100 p-4 rounded">
                            {qrCodes[((instance.instanceName || instance.instance?.instanceName)?.replace('evo_line_', '')) || instance.id].replace('pairing:', '')}
                          </div>
                          <p className="text-xs text-muted-foreground mt-2 text-center">
                            Digite este código no WhatsApp para parear
                          </p>
                        </div>
                      ) : (
                        <div>
                          <p className="text-sm font-medium mb-2">Escaneie este QR Code:</p>
                          <img 
                            src={qrCodes[((instance.instanceName || instance.instance?.instanceName)?.replace('evo_line_', '')) || instance.id]} 
                            alt="QR Code"
                            className="w-48 h-48 mx-auto border"
                          />
                          <p className="text-xs text-muted-foreground mt-2 text-center">
                            O QR Code será atualizado automaticamente a cada 4 segundos
                          </p>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Test send */}
                  <div className="flex gap-2 items-end">
                    <div className="flex-1">
                      <label className="block text-xs text-muted-foreground">Teste de envio</label>
                      <Input 
                        placeholder="+5511999999999" 
                        value={testNumbers[lineId] || ""}
                        onChange={(e) => setTestNumbers(prev => ({ ...prev, [lineId]: e.target.value }))}
                      />
                    </div>
                    <Button size="sm" onClick={() => testSend(lineId)}>
                      Enviar
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>

        {instances.length === 0 && !loading && (
          <div className="text-center py-8 text-muted-foreground">
            Nenhuma instância encontrada. Crie uma nova instância acima.
          </div>
        )}
      </div>
    </div>
  );
}
