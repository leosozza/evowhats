
import { useState, useEffect } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useSupabaseAuth } from "@/hooks/useSupabaseAuth";
import { Play, RefreshCw, CheckCircle, XCircle, Clock } from "lucide-react";

interface LineStatus {
  line_id: string;
  line_name: string;
  instance_name: string;
  status: string;
  success: boolean;
  error?: string;
}

export default function BindingsDashboard() {
  const { session } = useSupabaseAuth();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [testPhone, setTestPhone] = useState("");
  const [lineStatuses, setLineStatuses] = useState<LineStatus[]>([]);
  const [sessions, setSessions] = useState<any[]>([]);

  const loadSessions = async () => {
    if (!session?.user) return;

    try {
      setLoading(true);
      const { data: waSessions, error } = await supabase
        .from("wa_sessions")
        .select("*")
        .eq("user_id", session.user.id)
        .order("created_at", { ascending: false });

      if (error) throw error;
      setSessions(waSessions || []);
    } catch (error: any) {
      console.error("Error loading sessions:", error);
      toast({
        title: "Erro",
        description: "Falha ao carregar sessões",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  const checkLineStatus = async (lineId: string): Promise<LineStatus> => {
    try {
      const { data, error } = await supabase.functions.invoke("evolution-connector-v2", {
        body: {
          action: "get_status_for_line",
          bitrix_line_id: lineId,
          tenantId: session?.user?.id
        }
      });

      if (error) throw error;

      return {
        line_id: lineId,
        line_name: data.session_data?.bitrix_line_name || `Line ${lineId}`,
        instance_name: data.instance_name || "unknown",
        status: data.status || "unknown",
        success: data.success || false,
        error: data.error
      };
    } catch (error: any) {
      return {
        line_id: lineId,
        line_name: `Line ${lineId}`,
        instance_name: "unknown",
        status: "error",
        success: false,
        error: error.message
      };
    }
  };

  const refreshStatuses = async () => {
    if (!sessions.length) return;

    setLoading(true);
    try {
      const statusPromises = sessions.map(session => checkLineStatus(session.bitrix_line_id));
      const statuses = await Promise.all(statusPromises);
      setLineStatuses(statuses);
    } catch (error: any) {
      console.error("Error refreshing statuses:", error);
      toast({
        title: "Erro",
        description: "Falha ao atualizar status",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  const testSend = async (lineId: string) => {
    if (!testPhone.trim()) {
      toast({
        title: "Número requerido",
        description: "Informe um número de telefone para teste",
        variant: "destructive"
      });
      return;
    }

    if (!session?.user) return;

    try {
      setLoading(true);
      const { data, error } = await supabase.functions.invoke("evolution-connector-v2", {
        body: {
          action: "send_message",
          bitrix_line_id: lineId,
          phone_number: testPhone.replace(/[^\d+]/g, ""),
          message: "🚀 Teste de conectividade - Bindings Dashboard",
          tenantId: session.user.id
        }
      });

      if (error) throw error;

      if (data.success) {
        toast({
          title: "Teste enviado",
          description: `Mensagem enviada com sucesso para ${testPhone}`,
        });
      } else {
        throw new Error(data.error || "Falha no envio");
      }
    } catch (error: any) {
      console.error("Error testing send:", error);
      toast({
        title: "Erro no teste",
        description: error.message || "Falha ao enviar mensagem de teste",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  const getStatusBadge = (status: string, success: boolean) => {
    if (!success) {
      return <Badge variant="destructive"><XCircle className="w-3 h-3 mr-1" />Erro</Badge>;
    }

    switch (status?.toLowerCase()) {
      case "active":
      case "open":
      case "connected":
        return <Badge variant="default" className="bg-green-500"><CheckCircle className="w-3 h-3 mr-1" />Ativo</Badge>;
      case "connecting":
      case "pending":
        return <Badge variant="secondary"><Clock className="w-3 h-3 mr-1" />Conectando</Badge>;
      default:
        return <Badge variant="outline">{status || "Desconhecido"}</Badge>;
    }
  };

  useEffect(() => {
    loadSessions();
  }, [session]);

  useEffect(() => {
    if (sessions.length > 0) {
      refreshStatuses();
    }
  }, [sessions]);

  if (!session?.user) {
    return (
      <div className="container mx-auto p-6">
        <Card className="p-6 text-center">
          <p>Você precisa estar logado para ver os vínculos.</p>
        </Card>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Dashboard de Vínculos</h1>
          <p className="text-muted-foreground">
            Monitore o status das suas linhas e teste conectividade
          </p>
        </div>
        <Button 
          onClick={refreshStatuses} 
          disabled={loading}
          variant="outline"
        >
          <RefreshCw className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
          Atualizar Status
        </Button>
      </div>

      <Card className="p-6">
        <div className="flex items-center gap-4 mb-4">
          <Label htmlFor="testPhone" className="font-medium">
            Número para teste:
          </Label>
          <Input
            id="testPhone"
            placeholder="Ex: +5511999999999"
            value={testPhone}
            onChange={(e) => setTestPhone(e.target.value)}
            className="w-64"
          />
        </div>
      </Card>

      <div className="grid gap-4">
        {sessions.length === 0 ? (
          <Card className="p-6 text-center">
            <p className="text-muted-foreground">
              Nenhuma sessão WhatsApp encontrada. Configure uma linha primeiro.
            </p>
          </Card>
        ) : (
          sessions.map((session) => {
            const statusInfo = lineStatuses.find(s => s.line_id === session.bitrix_line_id);
            
            return (
              <Card key={session.id} className="p-4">
                <div className="flex items-center justify-between">
                  <div className="space-y-2">
                    <div className="flex items-center gap-3">
                      <h3 className="font-medium">
                        {session.bitrix_line_name || `Linha ${session.bitrix_line_id}`}
                      </h3>
                      {statusInfo && getStatusBadge(statusInfo.status, statusInfo.success)}
                    </div>
                    <div className="text-sm text-muted-foreground space-y-1">
                      <div><strong>Line ID:</strong> {session.bitrix_line_id}</div>
                      <div><strong>Instância:</strong> {session.evo_instance_id}</div>
                      <div><strong>Status sessão:</strong> {session.status}</div>
                      {statusInfo?.error && (
                        <div className="text-red-600">
                          <strong>Erro:</strong> {statusInfo.error}
                        </div>
                      )}
                      {session.last_sync_at && (
                        <div><strong>Último sync:</strong> {new Date(session.last_sync_at).toLocaleString()}</div>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <Button
                      size="sm"
                      onClick={() => testSend(session.bitrix_line_id)}
                      disabled={loading || !testPhone.trim() || statusInfo?.status !== "active"}
                    >
                      <Play className="w-4 h-4 mr-2" />
                      Testar Envio
                    </Button>
                  </div>
                </div>
              </Card>
            );
          })
        )}
      </div>

      <Card className="p-4 border-l-4 border-l-blue-500">
        <h3 className="font-medium mb-2">Como usar o Dashboard v2</h3>
        <div className="text-sm text-muted-foreground space-y-2">
          <p>1. <strong>Rebind eventos:</strong> Execute <code>bitrix-events-bind-v2</code> para registrar eventos de fechamento/transferência</p>
          <p>2. <strong>Webhook Evolution:</strong> Altere a URL do webhook para <code>.../functions/v1/evolution-webhook-v2</code></p>
          <p>3. <strong>Teste de envio:</strong> Informe um número e clique "Testar Envio" para verificar conectividade</p>
          <p>4. <strong>Status ativo:</strong> Apenas linhas com status "Ativo" podem enviar mensagens</p>
        </div>
      </Card>
    </div>
  );
}
