
import React, { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { MessageSquare, RefreshCw, Clock, CheckCircle, XCircle, AlertTriangle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

interface EventLog {
  id: string;
  event_type: string;
  event_data: any;
  status: string;
  error_message?: string;
  created_at: string;
  processed_at?: string;
}

const RealMessageMonitor = () => {
  const [events, setEvents] = useState<EventLog[]>([]);
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  const loadEvents = async () => {
    try {
      setLoading(true);
      
      const { data, error } = await supabase
        .from('bitrix_event_logs')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(20);

      if (error) throw error;

      setEvents(data || []);
    } catch (error: any) {
      console.error('Error loading events:', error);
      toast({
        title: "Erro ao carregar eventos",
        description: error.message || "Falha ao buscar logs de eventos",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadEvents();
    
    // Auto-refresh every 10 seconds
    const interval = setInterval(loadEvents, 10000);
    
    // Real-time subscription
    const subscription = supabase
      .channel('bitrix_events')
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'bitrix_event_logs'
      }, (payload) => {
        console.log('New event received:', payload);
        setEvents(prev => [payload.new as EventLog, ...prev.slice(0, 19)]);
      })
      .subscribe();

    return () => {
      clearInterval(interval);
      subscription.unsubscribe();
    };
  }, []);

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'processed':
        return <CheckCircle className="h-4 w-4 text-green-500" />;
      case 'failed':
        return <XCircle className="h-4 w-4 text-red-500" />;
      case 'pending':
        return <Clock className="h-4 w-4 text-yellow-500" />;
      default:
        return <AlertTriangle className="h-4 w-4 text-gray-500" />;
    }
  };

  const getStatusBadge = (status: string) => {
    const variants: Record<string, any> = {
      processed: "default",
      failed: "destructive", 
      pending: "secondary"
    };
    return variants[status] || "outline";
  };

  const formatEventData = (eventType: string, eventData: any) => {
    try {
      switch (eventType) {
        case 'message_received':
          const msgData = eventData?.message_data;
          const contactNumber = msgData?.key?.remoteJid?.replace('@s.whatsapp.net', '') || 'Unknown';
          const messageText = msgData?.message?.conversation || 
                             msgData?.message?.extendedTextMessage?.text || 
                             'Media message';
          return {
            contact: contactNumber,
            message: messageText.substring(0, 100) + (messageText.length > 100 ? '...' : ''),
            line: eventData?.line_id || 'N/A'
          };
        case 'connector_webhook':
          return {
            action: eventData?.action || 'Unknown',
            result: eventData?.result ? 'Success' : 'Failed',
            line: eventData?.line_id || 'N/A'
          };
        default:
          return {
            data: JSON.stringify(eventData).substring(0, 100) + '...'
          };
      }
    } catch (error) {
      return { error: 'Failed to parse event data' };
    }
  };

  const formatTime = (timestamp: string) => {
    return new Date(timestamp).toLocaleString('pt-BR', {
      day: '2-digit',
      month: '2-digit', 
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <MessageSquare className="h-5 w-5" />
            Monitor de Mensagens Reais
          </div>
          <Button
            onClick={loadEvents}
            variant="outline"
            size="sm"
            disabled={loading}
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
            Atualizar
          </Button>
        </CardTitle>
      </CardHeader>
      <CardContent>
        {loading && events.length === 0 ? (
          <div className="text-center py-8">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto"></div>
            <p className="text-sm text-muted-foreground mt-2">Carregando eventos...</p>
          </div>
        ) : events.length === 0 ? (
          <div className="text-center py-8">
            <MessageSquare className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <h3 className="font-medium">Nenhum evento registrado</h3>
            <p className="text-sm text-muted-foreground mt-1">
              Os eventos de mensagens e webhook aparecerão aqui em tempo real.
            </p>
          </div>
        ) : (
          <div className="space-y-3 max-h-96 overflow-y-auto">
            {events.map((event) => {
              const formattedData = formatEventData(event.event_type, event.event_data);
              
              return (
                <div key={event.id} className="border rounded-lg p-3 bg-card">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-2">
                      {getStatusIcon(event.status)}
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-sm">
                            {event.event_type.replace('_', ' ').toUpperCase()}
                          </span>
                          <Badge variant={getStatusBadge(event.status)}>
                            {event.status}
                          </Badge>
                        </div>
                        <p className="text-xs text-muted-foreground">
                          {formatTime(event.created_at)}
                        </p>
                      </div>
                    </div>
                  </div>
                  
                  <div className="mt-2 text-sm">
                    {event.event_type === 'message_received' && (
                      <div className="space-y-1">
                        <p><strong>Contato:</strong> {formattedData.contact}</p>
                        <p><strong>Linha:</strong> {formattedData.line}</p>
                        <p><strong>Mensagem:</strong> "{formattedData.message}"</p>
                      </div>
                    )}
                    
                    {event.event_type === 'connector_webhook' && (
                      <div className="space-y-1">
                        <p><strong>Ação:</strong> {formattedData.action}</p>
                        <p><strong>Resultado:</strong> {formattedData.result}</p>
                        <p><strong>Linha:</strong> {formattedData.line}</p>
                      </div>
                    )}
                    
                    {event.error_message && (
                      <p className="text-red-600 text-xs mt-1">
                        <strong>Erro:</strong> {event.error_message}
                      </p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default RealMessageMonitor;
