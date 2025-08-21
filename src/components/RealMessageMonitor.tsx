
import React, { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { MessageSquare, RefreshCw, Phone, Clock, CheckCircle, Smartphone } from "lucide-react";
import { useEvolutionRealTime } from "@/hooks/useEvolutionRealTime";
import { evolutionInstanceManager } from "@/services/evolutionInstances";

const RealMessageMonitor = () => {
  const { connectedInstances, messages } = useEvolutionRealTime();
  const [instances, setInstances] = useState<any[]>([]);

  useEffect(() => {
    const unsubscribe = evolutionInstanceManager.subscribe(setInstances);
    return unsubscribe;
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

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <MessageSquare className="h-5 w-5" />
            Monitor de Mensagens em Tempo Real
          </div>
          <div className="flex items-center gap-2">
            {connectedInstances.length > 0 ? (
              <Badge className="flex items-center gap-1">
                <CheckCircle className="h-3 w-3" />
                {connectedInstances.length} conectada(s)
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
          {instances.length === 0 ? (
            <div className="text-center py-4 text-muted-foreground">
              <Smartphone className="h-8 w-8 mx-auto mb-2 opacity-50" />
              <p className="text-sm">Nenhuma instância criada</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {instances.map((instance) => (
                <div key={instance.instanceName} className="flex items-center gap-2 p-2 border rounded">
                  <div className={`w-2 h-2 rounded-full ${
                    instance.status === 'connected' ? 'bg-green-500' : 
                    instance.status === 'connecting' ? 'bg-yellow-500 animate-pulse' :
                    'bg-gray-400'
                  }`} />
                  <span className="text-sm font-medium">{instance.instanceName}</span>
                  <Badge variant="outline" className="text-xs ml-auto">
                    {instance.status === 'connected' ? 'Online' :
                     instance.status === 'connecting' ? 'Conectando' :
                     instance.status === 'qr_ready' ? 'Aguardando QR' : 'Offline'}
                  </Badge>
                </div>
              ))}
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
                {connectedInstances.length > 0 
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
