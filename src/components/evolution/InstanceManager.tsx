
import React, { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { 
  Plus, 
  QrCode, 
  Trash2, 
  Wifi, 
  WifiOff, 
  Clock,
  CheckCircle2,
  AlertCircle,
  Smartphone,
  Link
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { evolutionInstanceManager, type EvolutionInstance } from "@/services/evolutionInstances";

interface InstanceManagerProps {
  onInstanceSelect?: (instanceName: string) => void;
  showLinkOptions?: boolean;
  availableChannels?: Array<{ id: string; name: string }>;
}

export default function InstanceManager({ 
  onInstanceSelect, 
  showLinkOptions = false,
  availableChannels = []
}: InstanceManagerProps) {
  const { toast } = useToast();
  const [instances, setInstances] = useState<EvolutionInstance[]>([]);
  const [loading, setLoading] = useState(false);
  const [newInstanceName, setNewInstanceName] = useState("");
  const [selectedQrInstance, setSelectedQrInstance] = useState<string | null>(null);

  useEffect(() => {
    const unsubscribe = evolutionInstanceManager.subscribe(setInstances);
    return unsubscribe;
  }, []);

  const handleCreateInstance = async () => {
    if (!newInstanceName.trim()) {
      toast({
        title: "Nome obrigatório",
        description: "Digite um nome para a nova instância.",
        variant: "destructive",
      });
      return;
    }

    setLoading(true);
    try {
      const success = await evolutionInstanceManager.createInstance(newInstanceName.trim());
      
      if (success) {
        toast({
          title: "Instância criada!",
          description: `A instância "${newInstanceName}" foi criada com sucesso.`,
        });
        setNewInstanceName("");
      } else {
        toast({
          title: "Erro ao criar",
          description: "Falha ao criar a instância. Verifique se o nome não existe.",
          variant: "destructive",
        });
      }
    } finally {
      setLoading(false);
    }
  };

  const handleConnectInstance = async (instanceName: string) => {
    setLoading(true);
    try {
      const qrCode = await evolutionInstanceManager.connectInstance(instanceName);
      
      if (qrCode) {
        setSelectedQrInstance(instanceName);
        toast({
          title: "QR Code gerado!",
          description: "Escaneie o QR Code com seu WhatsApp.",
        });
      } else {
        toast({
          title: "Erro na conexão",
          description: "Não foi possível gerar o QR Code.",
          variant: "destructive",
        });
      }
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteInstance = async (instanceName: string) => {
    setLoading(true);
    try {
      const success = await evolutionInstanceManager.deleteInstance(instanceName);
      
      if (success) {
        toast({
          title: "Instância removida!",
          description: `A instância "${instanceName}" foi removida.`,
        });
      } else {
        toast({
          title: "Erro ao remover",
          description: "Falha ao remover a instância.",
          variant: "destructive",
        });
      }
    } finally {
      setLoading(false);
    }
  };

  const handleLinkToChannel = async (instanceName: string, channelId: string) => {
    const success = await evolutionInstanceManager.linkInstanceToChannel(instanceName, channelId);
    
    if (success) {
      toast({
        title: "Vinculado com sucesso!",
        description: `Instância vinculada ao canal selecionado.`,
      });
    } else {
      toast({
        title: "Erro na vinculação",
        description: "Falha ao vincular instância ao canal.",
        variant: "destructive",
      });
    }
  };

  const getStatusIcon = (status: EvolutionInstance['status']) => {
    switch (status) {
      case 'connected':
        return <CheckCircle2 className="h-4 w-4 text-green-500" />;
      case 'connecting':
        return <Clock className="h-4 w-4 text-yellow-500 animate-spin" />;
      case 'qr_ready':
        return <QrCode className="h-4 w-4 text-blue-500" />;
      default:
        return <WifiOff className="h-4 w-4 text-gray-500" />;
    }
  };

  const getStatusText = (status: EvolutionInstance['status']) => {
    switch (status) {
      case 'connected': return 'Conectado';
      case 'connecting': return 'Conectando...';
      case 'qr_ready': return 'Aguardando QR';
      default: return 'Desconectado';
    }
  };

  const getStatusVariant = (status: EvolutionInstance['status']) => {
    switch (status) {
      case 'connected': return 'default';
      case 'connecting': return 'secondary';
      case 'qr_ready': return 'outline';
      default: return 'secondary';
    }
  };

  const selectedQrData = selectedQrInstance 
    ? instances.find(i => i.instanceName === selectedQrInstance)?.qrCode 
    : null;

  return (
    <div className="space-y-6">
      {/* Create New Instance */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Smartphone className="h-5 w-5" />
            Criar Nova Instância WhatsApp
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex gap-2">
            <div className="flex-1">
              <Label htmlFor="instance-name">Nome da Instância</Label>
              <Input
                id="instance-name"
                placeholder="Ex: vendas, suporte, marketing..."
                value={newInstanceName}
                onChange={(e) => setNewInstanceName(e.target.value)}
                disabled={loading}
              />
            </div>
            <div className="flex items-end">
              <Button 
                onClick={handleCreateInstance} 
                disabled={loading || !newInstanceName.trim()}
              >
                <Plus className="h-4 w-4 mr-2" />
                Criar
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Instances List */}
      <Card>
        <CardHeader>
          <CardTitle>Instâncias Evolution API ({instances.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {instances.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Smartphone className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>Nenhuma instância criada ainda.</p>
              <p className="text-sm mt-2">Crie uma instância para começar a usar o WhatsApp.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {instances.map((instance) => (
                <Card key={instance.instanceName} className="p-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      {getStatusIcon(instance.status)}
                      <div>
                        <h3 className="font-medium">{instance.instanceName}</h3>
                        <div className="flex items-center gap-2 mt-1">
                          <Badge variant={getStatusVariant(instance.status)}>
                            {getStatusText(instance.status)}
                          </Badge>
                          {instance.owner && (
                            <Badge variant="outline" className="text-xs">
                              {instance.owner}
                            </Badge>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      {instance.status === 'disconnected' && (
                        <Button
                          size="sm"
                          onClick={() => handleConnectInstance(instance.instanceName)}
                          disabled={loading}
                        >
                          <Wifi className="h-4 w-4 mr-1" />
                          Conectar
                        </Button>
                      )}

                      {instance.status === 'qr_ready' && (
                        <Dialog>
                          <DialogTrigger asChild>
                            <Button size="sm" variant="outline">
                              <QrCode className="h-4 w-4 mr-1" />
                              Ver QR
                            </Button>
                          </DialogTrigger>
                          <DialogContent className="max-w-md">
                            <DialogHeader>
                              <DialogTitle>QR Code - {instance.instanceName}</DialogTitle>
                            </DialogHeader>
                            {instance.qrCode && (
                              <div className="flex flex-col items-center space-y-4">
                                <img
                                  src={`data:image/png;base64,${instance.qrCode}`}
                                  alt="QR Code"
                                  className="w-64 h-64 border rounded-lg bg-white"
                                />
                                <p className="text-sm text-center text-muted-foreground">
                                  Abra o WhatsApp no seu telefone e escaneie este código
                                </p>
                              </div>
                            )}
                          </DialogContent>
                        </Dialog>
                      )}

                      {instance.status === 'connected' && showLinkOptions && (
                        <div className="flex gap-1">
                          {availableChannels.map((channel) => (
                            <Button
                              key={channel.id}
                              size="sm"
                              variant="outline"
                              onClick={() => handleLinkToChannel(instance.instanceName, channel.id)}
                            >
                              <Link className="h-3 w-3 mr-1" />
                              {channel.name}
                            </Button>
                          ))}
                        </div>
                      )}

                      {onInstanceSelect && instance.status === 'connected' && (
                        <Button
                          size="sm"
                          onClick={() => onInstanceSelect(instance.instanceName)}
                        >
                          Selecionar
                        </Button>
                      )}

                      <Button
                        size="sm"
                        variant="destructive"
                        onClick={() => handleDeleteInstance(instance.instanceName)}
                        disabled={loading}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>

                  {instance.connectedAt && (
                    <div className="mt-2 text-xs text-muted-foreground">
                      Conectado em: {new Date(instance.connectedAt).toLocaleString('pt-BR')}
                    </div>
                  )}
                </Card>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
