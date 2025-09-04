import React, { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate, Link } from "react-router-dom";
import { ArrowLeft, Eye } from "lucide-react";
import { evolutionApi, EvolutionApiError } from "@/lib/evolutionApi";

export default function EvolutionInstances() {
  const navigate = useNavigate();
  const [instances, setInstances] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [newLineId, setNewLineId] = useState("");
  const [testNumbers, setTestNumbers] = useState<{ [key: string]: string }>({});
  const [qrCodes, setQrCodes] = useState<{ [key: string]: string }>({});
  const [connectionStates, setConnectionStates] = useState<{ [key: string]: string }>({});
  const [activePolling, setActivePolling] = useState<{ [key: string]: boolean }>({});
  const [openChannels, setOpenChannels] = useState<any[]>([]);

  const loadInstances = async () => {
    try {
      setLoading(true);
      console.log(JSON.stringify({
        category: 'UI',
        view: 'EvolutionInstances',
        action: 'loadInstances'
      }));

      const data = await evolutionApi.listInstances();
      const instanceList = data?.instances || [];
      setInstances(instanceList);
      
      // Load connection states for each instance
      for (const instance of instanceList) {
        const instName = instance.instanceName || instance.instance?.instanceName;
        if (instName) {
          const lineId = instName.replace('evo_line_', '');
          checkConnectionState(lineId);
        }
      }
      
      toast({
        title: "✅ Sucesso",
        description: `${instanceList.length} instâncias carregadas`,
      });
    } catch (error: any) {
      console.error("Error loading instances:", error);
      
      let errorMsg = "Erro desconhecido";
      if (error instanceof EvolutionApiError) {
        errorMsg = error.message;
        if (error.details) errorMsg += ` - Status: ${error.statusCode}`;
      } else {
        errorMsg = error.message || String(error);
      }
      
      toast({
        title: "❌ Erro",
        description: errorMsg,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const loadOpenChannels = async () => {
    try {
      const { data, error } = await supabase.functions.invoke("bitrix-openlines", {
        body: { action: "list_lines" },
      });
      
      if (!error && data?.lines) {
        setOpenChannels(data.lines);
      }
    } catch (error) {
      console.error("Error loading open channels:", error);
    }
  };

  const checkConnectionState = async (lineId: string) => {
    try {
      console.log(JSON.stringify({
        category: 'UI',
        view: 'EvolutionInstances',
        action: 'checkConnectionState',
        lineId
      }));

      const data = await evolutionApi.getStatus(lineId);
      const state = (data?.state || "unknown").toLowerCase();
      setConnectionStates(prev => ({ ...prev, [lineId]: state }));

      return state;
    } catch (error: any) {
      console.error(`Error checking state for line ${lineId}:`, error);
      setConnectionStates(prev => ({ ...prev, [lineId]: "error" }));
      return "error";
    }
  };

  const startPolling = (lineId: string) => {
    if (activePolling[lineId]) return;

    setActivePolling(prev => ({ ...prev, [lineId]: true }));

    const poll = async () => {
      if (!activePolling[lineId]) return;

      try {
        const state = await checkConnectionState(lineId);
        
        if (state === "connecting") {
          // Get QR code
          try {
            const data = await evolutionApi.getQr(lineId);
            
            if (data?.qr_base64) {
              setQrCodes(prev => ({ ...prev, [lineId]: `data:image/png;base64,${data.qr_base64}` }));
            } else if (data?.pairingCode) {
              setQrCodes(prev => ({ ...prev, [lineId]: `pairing:${data.pairingCode}` }));
            }
          } catch (error) {
            console.error("Error getting QR:", error);
          }
          
          // Continue polling every 4 seconds
          setTimeout(() => {
            if (activePolling[lineId]) {
              poll();
            }
          }, 4000);
        } else if (state === "open") {
          // Connected, stop polling and clear QR
          setActivePolling(prev => ({ ...prev, [lineId]: false }));
          setQrCodes(prev => ({ ...prev, [lineId]: "" }));
          toast({
            title: "✅ Conectado",
            description: `Instância ${lineId} conectada com sucesso`,
          });
        } else {
          // Other states, stop polling after a few retries
          const retryStates = ["close", "error", "unknown"];
          if (retryStates.includes(state)) {
            setTimeout(() => {
              if (activePolling[lineId]) {
                poll();
              }
            }, 4000);
          } else {
            setActivePolling(prev => ({ ...prev, [lineId]: false }));
            setQrCodes(prev => ({ ...prev, [lineId]: "" }));
          }
        }
      } catch (error) {
        console.error("Polling error:", error);
        // Continue polling on error
        setTimeout(() => {
          if (activePolling[lineId]) {
            poll();
          }
        }, 4000);
      }
    };

    poll();
  };

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

      const data = await evolutionApi.ensureSession(newLineId);

      toast({
        title: "✅ Sucesso",
        description: `Instância ${data?.instanceName} criada/garantida`,
      });
      
      setNewLineId("");
      await loadInstances();
    } catch (error: any) {
      console.error("Error creating instance:", error);
      
      let errorMsg = "Erro desconhecido";
      if (error instanceof EvolutionApiError) {
        errorMsg = error.message;
        if (error.details) errorMsg += ` - Status: ${error.statusCode}`;
      } else {
        errorMsg = error.message || String(error);
      }
      
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

      const data = await evolutionApi.startSession(lineId);

      toast({
        title: "✅ Sessão iniciada",
        description: "Verificando status e gerando QR...",
      });
      
      startPolling(lineId);
    } catch (error: any) {
      console.error("Error connecting instance:", error);
      
      let errorMsg = "Erro desconhecido";
      if (error instanceof EvolutionApiError) {
        errorMsg = error.message;
        if (error.details) errorMsg += ` - Status: ${error.statusCode}`;
      } else {
        errorMsg = error.message || String(error);
      }
      
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

      const data = await evolutionApi.bindLine(instanceId, lineId);
      
      if (data?.warn) {
        toast({
          title: "⚠️ Aviso",
          description: "Binding não persistido, mas funcionalidade continua disponível",
        });
      } else {
        toast({
          title: "✅ Sucesso",
          description: `Instância vinculada ao canal ${lineId}`,
        });
      }
    } catch (error: any) {
      let errorMsg = "Erro desconhecido";
      if (error instanceof EvolutionApiError) {
        errorMsg = error.message;
        if (error.details) errorMsg += ` - Status: ${error.statusCode}`;
      } else {
        errorMsg = error.message || String(error);
      }
      
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

      const data = await evolutionApi.testSend(lineId, number, "Teste de envio da instância Evolution");

      toast({
        title: "✅ Sucesso",
        description: `Mensagem de teste enviada para ${number}`,
      });
    } catch (error: any) {
      console.error("Error sending test message:", error);
      
      let errorMsg = "Erro desconhecido";
      if (error instanceof EvolutionApiError) {
        errorMsg = error.message;
        if (error.details) errorMsg += ` - Status: ${error.statusCode}`;
      } else {
        errorMsg = error.message || String(error);
      }
      
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
                    <span className={`text-sm ${getStatusColor(state)}`}>
                      {state}
                    </span>
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
                      disabled={connectionStates[instance.instanceName?.replace('evo_line_', '') || instance.id] === "connecting"}
                    >
                      {connectionStates[instance.instanceName?.replace('evo_line_', '') || instance.id] === "connecting" 
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
