
import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "@/hooks/use-toast";
import { useLineEvolution } from "@/hooks/useLineEvolution";
import { supabase } from "@/integrations/supabase/client";
import { 
  Activity, 
  QrCode, 
  Link, 
  Send, 
  Zap,
  CheckCircle,
  AlertCircle,
  XCircle,
  RefreshCw
} from "lucide-react";

interface EvolutionInstance {
  id: string;
  label: string;
  status: string;
  bound_line_id?: string | null;
}

interface BitrixLine {
  ID: string;
  NAME: string;
}

const EvolutionInstances = () => {
  const [instances, setInstances] = useState<EvolutionInstance[]>([]);
  const [bitrixLines, setBitrixLines] = useState<BitrixLine[]>([]);
  const [loading, setLoading] = useState(false);
  const [testPhone, setTestPhone] = useState("");
  const [newLineId, setNewLineId] = useState("");
  const [selectedLineForBind, setSelectedLineForBind] = useState<Record<string, string>>({});

  const {
    loadingLine,
    statusByLine,
    qrByLine,
    startSession,
    refreshStatus,
    startPolling,
    stopPolling,
    testSend
  } = useLineEvolution();

  const loadInstances = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("evolution-connector-v2", {
        body: { action: "list_instances" }
      });

      if (error) throw error;
      if (!data?.ok) throw new Error(data?.error || "Failed to load instances");

      setInstances(data.instances || []);
      toast({
        title: "✅ API Evolution validada",
        description: `${data.instances?.length || 0} instância(s) encontrada(s)`,
      });
    } catch (error: any) {
      console.error("Error loading instances:", error);
      toast({
        title: "❌ Erro ao validar API",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const loadBitrixLines = async () => {
    try {
      const { data, error } = await supabase.functions.invoke("bitrix-openlines", {
        body: { action: "list_lines" }
      });

      if (error) throw error;
      if (data?.ok && data?.lines) {
        setBitrixLines(data.lines);
        toast({
          title: "✅ Linhas Bitrix carregadas",
          description: `${data.lines.length} linha(s) encontrada(s)`,
        });
      }
    } catch (error: any) {
      console.error("Error loading Bitrix lines:", error);
      toast({
        title: "❌ Erro ao carregar linhas Bitrix",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const createInstance = async () => {
    if (!newLineId.trim()) {
      toast({
        title: "❌ Erro",
        description: "Informe o ID da linha",
        variant: "destructive",
      });
      return;
    }

    try {
      await startSession(newLineId.trim());
      
      toast({
        title: "✅ Instância criada",
        description: `Instância para linha ${newLineId} criada com sucesso`,
      });
      
      setNewLineId("");
      await loadInstances();
    } catch (error: any) {
      console.error("Error creating instance:", error);
      toast({
        title: "❌ Erro ao criar instância",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const handleConnect = async (instanceId: string) => {
    try {
      const lineId = instances.find(i => i.id === instanceId)?.bound_line_id || instanceId.replace("evo_line_", "");
      
      await startSession(lineId);
      startPolling(lineId);
      
      toast({
        title: "🔄 Conectando...",
        description: "Iniciando conexão. QR Code será exibido em breve.",
      });
    } catch (error: any) {
      console.error("Error connecting:", error);
      toast({
        title: "❌ Erro ao conectar",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const handleBind = async (instanceId: string) => {
    const lineId = selectedLineForBind[instanceId];
    if (!lineId) {
      toast({
        title: "❌ Erro",
        description: "Selecione uma linha para vincular",
        variant: "destructive",
      });
      return;
    }

    try {
      const { data, error } = await supabase.functions.invoke("evolution-connector-v2", {
        body: { action: "bind_line", instanceId, lineId }
      });

      if (error) throw error;
      if (!data?.ok) throw new Error(data?.error || "Failed to bind");

      toast({
        title: "✅ Vinculado",
        description: `Instância ${instanceId} vinculada à linha ${lineId}`,
      });

      await loadInstances();
    } catch (error: any) {
      console.error("Error binding:", error);
      toast({
        title: "❌ Erro ao vincular",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const handleTestSend = async (instanceId: string) => {
    if (!testPhone.trim()) {
      toast({
        title: "❌ Erro",
        description: "Informe o número de telefone",
        variant: "destructive",
      });
      return;
    }

    try {
      const lineId = instances.find(i => i.id === instanceId)?.bound_line_id || instanceId.replace("evo_line_", "");
      await testSend(lineId, testPhone);
      
      toast({
        title: "✅ Mensagem enviada",
        description: `Teste enviado para ${testPhone}`,
      });
    } catch (error: any) {
      console.error("Error sending test:", error);
      toast({
        title: "❌ Erro no envio",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status?.toLowerCase()) {
      case "open":
        return <CheckCircle className="h-4 w-4 text-green-500" />;
      case "connecting":
        return <AlertCircle className="h-4 w-4 text-yellow-500" />;
      default:
        return <XCircle className="h-4 w-4 text-red-500" />;
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status?.toLowerCase()) {
      case "open":
        return <Badge variant="default" className="bg-green-500">Conectado</Badge>;
      case "connecting":
        return <Badge variant="secondary">Aguardando QR</Badge>;
      default:
        return <Badge variant="destructive">Desconectado</Badge>;
    }
  };

  useEffect(() => {
    loadInstances();
    loadBitrixLines();
  }, []);

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="text-center space-y-2">
        <h1 className="text-3xl font-bold">Integração Evolution API</h1>
        <p className="text-muted-foreground">
          Gerencie conexões WhatsApp via Evolution API
        </p>
      </div>

      {/* Configuração Geral */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Activity className="h-5 w-5" />
            Configuração Geral
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-4">
            <Button onClick={loadInstances} disabled={loading}>
              {loading ? (
                <>
                  <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                  Validando...
                </>
              ) : (
                "Validar API Evolution"
              )}
            </Button>
            <Button onClick={loadBitrixLines} variant="outline">
              Carregar Linhas Bitrix
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Gerenciar Sessões */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Zap className="h-5 w-5" />
            Gerenciar Sessões
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-4">
            <div className="flex-1">
              <Label htmlFor="lineId">ID da Linha</Label>
              <Input
                id="lineId"
                value={newLineId}
                onChange={(e) => setNewLineId(e.target.value)}
                placeholder="Ex: 15"
              />
            </div>
            <div className="flex items-end">
              <Button onClick={createInstance} disabled={loadingLine !== null}>
                {loadingLine ? "Criando..." : "Criar Instância"}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Lista de Instâncias */}
      <div className="grid gap-4">
        {instances.map((instance) => {
          const currentStatus = statusByLine[instance.bound_line_id || instance.id.replace("evo_line_", "")] || instance.status;
          const currentQr = qrByLine[instance.bound_line_id || instance.id.replace("evo_line_", "")];
          
          return (
            <Card key={instance.id}>
              <CardHeader>
                <CardTitle className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    {getStatusIcon(currentStatus)}
                    {instance.label}
                  </div>
                  {getStatusBadge(currentStatus)}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* QR Code */}
                {currentQr && (
                  <div className="flex flex-col items-center p-4 border rounded-lg bg-muted">
                    <QrCode className="h-6 w-6 mb-2" />
                    <img src={currentQr} alt="QR Code" className="max-w-xs" />
                    <p className="text-sm text-muted-foreground mt-2">
                      Escaneie com WhatsApp
                    </p>
                  </div>
                )}

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {/* Conectar */}
                  <div className="space-y-2">
                    <Label>Conexão</Label>
                    <Button 
                      onClick={() => handleConnect(instance.id)}
                      disabled={loadingLine !== null || currentStatus === "open"}
                      className="w-full"
                    >
                      {currentStatus === "open" ? "Conectado" : "Conectar / QR"}
                    </Button>
                  </div>

                  {/* Bind com Open Lines */}
                  <div className="space-y-2">
                    <Label>Vincular Linha Bitrix</Label>
                    <div className="flex gap-2">
                      <Select
                        value={selectedLineForBind[instance.id] || instance.bound_line_id || ""}
                        onValueChange={(value) => 
                          setSelectedLineForBind(prev => ({ ...prev, [instance.id]: value }))
                        }
                      >
                        <SelectTrigger className="flex-1">
                          <SelectValue placeholder="Selecionar linha" />
                        </SelectTrigger>
                        <SelectContent>
                          {bitrixLines.map(line => (
                            <SelectItem key={line.ID} value={line.ID}>
                              {line.NAME}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Button
                        onClick={() => handleBind(instance.id)}
                        size="sm"
                        variant="outline"
                      >
                        <Link className="h-4 w-4" />
                      </Button>
                    </div>
                    {instance.bound_line_id && (
                      <Badge variant="outline" className="text-xs">
                        Vinculado: {instance.bound_line_id}
                      </Badge>
                    )}
                  </div>

                  {/* Teste de Envio */}
                  <div className="space-y-2">
                    <Label>Teste de Envio</Label>
                    <div className="flex gap-2">
                      <Input
                        placeholder="+5511999999999"
                        value={testPhone}
                        onChange={(e) => setTestPhone(e.target.value)}
                        className="flex-1"
                      />
                      <Button
                        onClick={() => handleTestSend(instance.id)}
                        size="sm"
                        variant="outline"
                        disabled={currentStatus !== "open"}
                      >
                        <Send className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {instances.length === 0 && !loading && (
        <Card>
          <CardContent className="text-center py-8">
            <p className="text-muted-foreground">
              Nenhuma instância encontrada. Crie uma nova instância acima.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default EvolutionInstances;
