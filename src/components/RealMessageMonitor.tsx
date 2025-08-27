
import React, { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { MessageSquare, RefreshCw, Phone, Clock, CheckCircle, Smartphone } from "lucide-react";
import { useEvolutionRealTime } from "@/hooks/useEvolutionRealTime";
import { supabase } from "@/integrations/supabase/client";

interface EvolutionInstance {
  id: string;
  label: string;
  status: string;
  bound_line_id?: string | null;
}

const RealMessageMonitor = () => {
  const { connectedInstances, messages } = useEvolutionRealTime();
  const [instances, setInstances] = useState<EvolutionInstance[]>([]);
  const [loading, setLoading] = useState(false);

  const loadInstances = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("evolution-connector-v2", {
        body: { action: "list_instances" }
      });

      if (error) throw error;
      if (!data?.ok) throw new Error(data?.error || "Failed to load instances");

      const instancesData = data.instances || [];
      setInstances(instancesData.map((inst: any) => ({
        id: inst.instanceName || inst.instance?.instanceName || inst.name,
        label: inst.instanceName || inst.instance?.instanceName || inst.name,
        status: inst.instance?.state || inst.state || 'disconnected',
        bound_line_id: null
      })));

    } catch (error: any) {
      console.error("Error loading instances:", error);
      setInstances([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadInstances();
    // Recarregar a cada 10 segundos
    const interval = setInterval(loadInstances, 10000);
    return () => clearInterval(interval);
  }, []);

  const formatTime = (timestamp: string) => {
    return new Date(timestamp).toLocaleString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });
  };

  const formatPhoneNumber = (number: string) => {
    // Format Brazilian phone numbers
    if (number && number.length >= 10) {
      const cleaned = number.replace(/\D/g, '');
      if (cleaned.length === 11) {
        return `+55 (${cleaned.slice(0,2)}) ${cleaned.slice(2,7)}-${cleaned.slice(7)}`;
      }
      if (cleaned.length === 10) {
        return `+55 (${cleaned.slice(0,2)}) ${cleaned.slice(2,6)}-${cleaned.slice(6)}`;
      }
    }
    return number;
  };

  const getMessageTypeColor = (type: string) => {
    switch (type) {
      case 'text': return 'bg-blue-100 text-blue-800';
      case 'image': return 'bg-green-100 text-green-800';
      case 'audio': return 'bg-purple-100 text-purple-800';
      case 'video': return 'bg-red-100 text-red-800';
      case 'document': return 'bg-orange-100 text-orange-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const getInstanceStatus = (status: string) => {
    switch (status?.toLowerCase()) {
      case 'open':
        return { label: 'Online', color: 'bg-green-500', variant: 'default' as const };
      case 'connecting':
        return { label: 'Conectando', color: 'bg-yellow-500 animate-pulse', variant: 'secondary' as const };
      case 'qr':
      case 'qr_ready':
        return { label: 'Aguardando QR', color: 'bg-blue-500 animate-pulse', variant: 'outline' as const };
      default:
        return { label: 'Offline', color: 'bg-gray-400', variant: 'destructive' as const };
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <MessageSquare className="h-5 w-5" />
            Monitor de Mensagens em Tempo Real
          </div>
          <div className="flex items-center gap-2">
            <Button onClick={loadInstances} size="sm" variant="outline" disabled={loading}>
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
              Atualizar
            </Button>
            {instances.filter(i => i.status === 'open').length > 0 ? (
              <Badge className="flex items-center gap-1">
                <CheckCircle className="h-3 w-3" />
                {instances.filter(i => i.status === 'open').length} conectada(s)
              </Badge>
            ) : (
              <Badge variant="secondary">Nenhuma instância conectada</Badge>
            )}
          </div>
        </CardTitle>
      </CardHeader>
      <CardContent>
        {/* Connection Status */}
        <div className="mb-6">
          <h3 className="font-medium mb-3">Status das Instâncias</h3>
          {loading ? (
            <div className="text-center py-4 text-muted-foreground">
              <RefreshCw className="h-6 w-6 mx-auto mb-2 animate-spin" />
              <p className="text-sm">Carregando instâncias...</p>
            </div>
          ) : instances.length === 0 ? (
            <div className="text-center py-4 text-muted-foreground">
              <Smartphone className="h-8 w-8 mx-auto mb-2 opacity-50" />
              <p className="text-sm">Nenhuma instância encontrada</p>
              <p className="text-xs mt-1">Vá para "Instâncias Evolution" para criar uma nova conexão</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {instances.map((instance) => {
                const statusInfo = getInstanceStatus(instance.status);
                return (
                  <div key={instance.id} className="flex items-center gap-2 p-3 border rounded-lg">
                    <div className={`w-3 h-3 rounded-full ${statusInfo.color}`} />
                    <div className="flex-1 min-w-0">
                      <span className="text-sm font-medium truncate block">{instance.label}</span>
                      <span className="text-xs text-muted-foreground">ID: {instance.id}</span>
                    </div>
                    <Badge variant={statusInfo.variant} className="text-xs">
                      {statusInfo.label}
                    </Badge>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Messages */}
        <div>
          <h3 className="font-medium mb-3">Mensagens Recentes</h3>
          {messages.length === 0 ? (
            <div className="text-center py-8">
              <MessageSquare className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <h3 className="font-medium">Nenhuma mensagem ainda</h3>
              <p className="text-sm text-muted-foreground mt-1">
                {instances.filter(i => i.status === 'open').length > 0 
                  ? "As mensagens aparecerão aqui em tempo real quando chegarem."
                  : "Conecte uma instância WhatsApp para receber mensagens."
                }
              </p>
            </div>
          ) : (
            <div className="space-y-3 max-h-96 overflow-y-auto">
              {messages.map((message) => (
                <div key={message.id} className="border rounded-lg p-3 bg-card">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-2 mb-2">
                      <Badge variant="outline" className="text-xs">
                        {message.instanceName}
                      </Badge>
                      <Badge className={`text-xs ${getMessageTypeColor(message.messageType)}`}>
                        {message.messageType.toUpperCase()}
                      </Badge>
                      <Badge variant={message.isFromMe ? "default" : "secondary"} className="text-xs">
                        {message.isFromMe ? "Enviada" : "Recebida"}
                      </Badge>
                    </div>
                    <span className="text-xs text-muted-foreground">
                      {formatTime(message.timestamp)}
                    </span>
                  </div>
                  
                  <div className="space-y-2 text-sm">
                    <div className="flex items-center gap-2">
                      <Phone className="h-3 w-3 text-muted-foreground" />
                      <span className="font-medium">
                        {formatPhoneNumber(message.isFromMe ? message.toNumber : message.fromNumber)}
                      </span>
                      {message.isFromMe && message.toNumber && (
                        <span className="text-muted-foreground">← para {formatPhoneNumber(message.toNumber)}</span>
                      )}
                    </div>
                    
                    <div className="bg-muted p-2 rounded text-sm">
                      {message.messageType === 'text' ? (
                        <span>"{message.message}"</span>
                      ) : (
                        <span className="italic">[{message.messageType.toUpperCase()}] {message.message}</span>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
};

export default RealMessageMonitor;
