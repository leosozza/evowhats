
import { useState, useEffect } from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useToast } from "@/hooks/use-toast";
import { 
  MessageSquare, 
  RefreshCw, 
  Clock, 
  User, 
  Phone,
  CheckCircle,
  AlertTriangle,
  ExternalLink
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

interface BitrixMessage {
  id: string;
  event_type: string;
  event_data: any;
  created_at: string;
  status: string;
  user_id: string;
}

const RealMessageMonitor = () => {
  const { toast } = useToast();
  const [messages, setMessages] = useState<BitrixMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [autoRefresh, setAutoRefresh] = useState(true);

  useEffect(() => {
    loadMessages();
    
    if (autoRefresh) {
      const interval = setInterval(loadMessages, 5000); // Refresh every 5 seconds
      return () => clearInterval(interval);
    }
  }, [autoRefresh]);

  const loadMessages = async () => {
    try {
      setLoading(true);
      
      const { data: user } = await supabase.auth.getUser();
      if (!user.user) {
        throw new Error('Usuário não autenticado');
      }

      const { data, error } = await supabase
        .from('bitrix_event_logs')
        .select('*')
        .eq('user_id', user.user.id)
        .order('created_at', { ascending: false })
        .limit(50);

      if (error) {
        throw error;
      }

      setMessages(data || []);
    } catch (error: any) {
      console.error('Error loading messages:', error);
      if (!loading) { // Only show error if it's not during auto-refresh
        toast({
          title: "Erro ao carregar mensagens",
          description: error.message || "Falha ao carregar eventos do Bitrix24",
          variant: "destructive",
        });
      }
    } finally {
      setLoading(false);
    }
  };

  const getMessageTypeIcon = (eventType: string) => {
    switch (eventType) {
      case 'OnImConnectorMessageAdd':
        return <MessageSquare className="h-4 w-4 text-blue-500" />;
      case 'OnImConnectorMessageUpdate':
        return <RefreshCw className="h-4 w-4 text-orange-500" />;
      case 'OnImConnectorMessageDelete':
        return <AlertTriangle className="h-4 w-4 text-red-500" />;
      case 'openlines_event':
        return <Phone className="h-4 w-4 text-green-500" />;
      default:
        return <Clock className="h-4 w-4 text-gray-500" />;
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'processed':
        return <Badge className="bg-green-100 text-green-800">Processado</Badge>;
      case 'pending':
        return <Badge variant="secondary">Pendente</Badge>;
      case 'error':
        return <Badge variant="destructive">Erro</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  const formatEventData = (eventData: any) => {
    try {
      if (!eventData) return 'Sem dados';
      
      // Extract relevant info from different event types
      if (eventData.data) {
        const { user, message, chat } = eventData.data;
        if (message) {
          return `${user?.name || 'Usuário'}: ${message.text || message.body || 'Mensagem'}`;
        }
        if (chat) {
          return `Chat: ${chat.name || chat.id}`;
        }
      }
      
      // Fallback to raw data preview
      const text = JSON.stringify(eventData);
      return text.length > 100 ? text.substring(0, 100) + '...' : text;
    } catch {
      return 'Dados inválidos';
    }
  };

  const openEventDetails = (message: BitrixMessage) => {
    // Open a modal or new window with full event details
    const detailsWindow = window.open('', '_blank', 'width=800,height=600');
    if (detailsWindow) {
      detailsWindow.document.write(`
        <html>
          <head>
            <title>Detalhes do Evento - ${message.event_type}</title>
            <style>
              body { font-family: monospace; padding: 20px; }
              pre { background: #f5f5f5; padding: 15px; border-radius: 5px; overflow: auto; }
              .header { margin-bottom: 20px; padding-bottom: 10px; border-bottom: 1px solid #ccc; }
            </style>
          </head>
          <body>
            <div class="header">
              <h2>${message.event_type}</h2>
              <p><strong>Data:</strong> ${new Date(message.created_at).toLocaleString('pt-BR')}</p>
              <p><strong>Status:</strong> ${message.status}</p>
              <p><strong>ID:</strong> ${message.id}</p>
            </div>
            <h3>Dados do Evento:</h3>
            <pre>${JSON.stringify(message.event_data, null, 2)}</pre>
          </body>
        </html>
      `);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <MessageSquare className="h-5 w-5" />
            Monitor de Mensagens Reais
          </div>
          <div className="flex items-center gap-2">
            <Button
              onClick={() => setAutoRefresh(!autoRefresh)}
              variant={autoRefresh ? "default" : "outline"}
              size="sm"
            >
              {autoRefresh ? "Auto On" : "Auto Off"}
            </Button>
            <Button onClick={loadMessages} variant="outline" size="sm" disabled={loading}>
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            </Button>
          </div>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {/* Stats */}
          <div className="grid grid-cols-3 gap-4">
            <div className="text-center">
              <div className="text-2xl font-bold text-blue-600">{messages.length}</div>
              <div className="text-sm text-muted-foreground">Total Eventos</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-green-600">
                {messages.filter(m => m.status === 'processed').length}
              </div>
              <div className="text-sm text-muted-foreground">Processados</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-orange-600">
                {messages.filter(m => m.status === 'pending').length}
              </div>
              <div className="text-sm text-muted-foreground">Pendentes</div>
            </div>
          </div>

          {/* Messages List */}
          <ScrollArea className="h-[400px] w-full border rounded-md p-4">
            {messages.length === 0 ? (
              <div className="text-center py-8">
                <MessageSquare className="h-12 w-12 text-gray-300 mx-auto mb-4" />
                <p className="text-muted-foreground">
                  {loading ? "Carregando eventos..." : "Nenhum evento encontrado"}
                </p>
                <p className="text-sm text-muted-foreground mt-1">
                  Os eventos do Bitrix24 aparecerão aqui quando chegarem
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {messages.map((message) => (
                  <div
                    key={message.id}
                    className="flex items-start gap-3 p-3 border rounded-lg hover:bg-gray-50 cursor-pointer"
                    onClick={() => openEventDetails(message)}
                  >
                    <div className="flex-shrink-0 mt-1">
                      {getMessageTypeIcon(message.event_type)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between mb-1">
                        <p className="font-medium text-sm">
                          {message.event_type}
                        </p>
                        <div className="flex items-center gap-2">
                          {getStatusBadge(message.status)}
                          <ExternalLink className="h-3 w-3 text-gray-400" />
                        </div>
                      </div>
                      <p className="text-sm text-muted-foreground truncate">
                        {formatEventData(message.event_data)}
                      </p>
                      <p className="text-xs text-gray-400 mt-1">
                        {new Date(message.created_at).toLocaleString('pt-BR')}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </ScrollArea>

          {/* Instructions */}
          <div className="bg-muted p-4 rounded-lg">
            <h4 className="font-medium mb-2">Sobre este Monitor:</h4>
            <ul className="text-sm space-y-1">
              <li>• ✅ Mostra eventos reais recebidos do Bitrix24</li>
              <li>• 🔄 Atualização automática a cada 5 segundos</li>
              <li>• 👁️ Clique em qualquer evento para ver detalhes completos</li>
              <li>• 📊 Estatísticas de eventos processados e pendentes</li>
            </ul>
            <p className="text-xs text-muted-foreground mt-2">
              Para começar a receber mensagens, ative o conector em uma linha no Open Channels.
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

export default RealMessageMonitor;
