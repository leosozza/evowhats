import { useState, useEffect } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { 
  MessageSquare, 
  Users, 
  Activity, 
  Settings, 
  BarChart3,
  Zap,
  Link as LinkIcon,
  Wifi
} from "lucide-react";
import ConfigurationPanel from "./ConfigurationPanel";
import MessageMonitor from "./MessageMonitor";
import ConnectionStatus from "./ConnectionStatus";
import IntegrationGuide from "./IntegrationGuide";
import { supabase } from "@/integrations/supabase/client";
import { useSupabaseAuth } from "@/hooks/useSupabaseAuth";
import { getBitrixAuthStatus } from "@/services/bitrixAuthStatus";

const Dashboard = () => {
  const { user } = useSupabaseAuth();
  const [stats, setStats] = useState({
    totalConversations: 0,
    totalMessages: 0,
    activeConnections: 0
  });

  useEffect(() => {
    if (user) {
      loadRealStats();
    }
  }, [user]);

  const loadRealStats = async () => {
    try {
      // Get conversations count
      const { count: conversationsCount } = await supabase
        .from('conversations')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', user?.id);

      // Get messages count by joining with conversations
      const { count: messagesCount } = await supabase
        .from('messages')
        .select(`
          *,
          conversations!inner(user_id)
        `, { count: 'exact', head: true })
        .eq('conversations.user_id', user?.id);

      // Get active connection status (check if Evolution API and Bitrix are configured)
      const { data: userConfig } = await supabase
        .from('user_configurations')
        .select('*')
        .eq('user_id', user?.id)
        .eq('is_active', true)
        .maybeSingle();

      let activeConnections = 0;
      if (userConfig?.evolution_api_key && userConfig?.evolution_base_url) {
        activeConnections++;
      }

      // Check if Bitrix OAuth is active
      const bitrixStatus = await getBitrixAuthStatus();
      if (bitrixStatus.isConnected && bitrixStatus.hasValidTokens) {
        activeConnections++;
      }

      setStats({
        totalConversations: conversationsCount || 0,
        totalMessages: messagesCount || 0,
        activeConnections
      });
    } catch (error) {
      console.error('Error loading stats:', error);
      setStats({
        totalConversations: 0,
        totalMessages: 0,
        activeConnections: 0
      });
    }
  };

  return (
    <div className="container mx-auto px-6 py-8">
      <Tabs defaultValue="overview" className="space-y-6">
        <TabsList className="grid w-full grid-cols-5">
          <TabsTrigger value="overview">Visão Geral</TabsTrigger>
          <TabsTrigger value="messages">Mensagens</TabsTrigger>
          <TabsTrigger value="connections">Conexões</TabsTrigger>
          <TabsTrigger value="config" data-value="config">Configurações</TabsTrigger>
          <TabsTrigger value="guide">Guia</TabsTrigger>
        </TabsList>
        
        <TabsContent value="overview" className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">
                  Total de Conversas
                </CardTitle>
                <MessageSquare className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{stats.totalConversations}</div>
                <p className="text-xs text-muted-foreground">
                  {stats.totalConversations === 0 ? "Nenhuma conversa ainda" : "Conversas sincronizadas"}
                </p>
              </CardContent>
            </Card>
            
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">
                  Total de Mensagens
                </CardTitle>
                <BarChart3 className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{stats.totalMessages}</div>
                <p className="text-xs text-muted-foreground">
                  {stats.totalMessages === 0 ? "Nenhuma mensagem ainda" : "Mensagens processadas"}
                </p>
              </CardContent>
            </Card>
            
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">
                  Conexões Ativas
                </CardTitle>
                <Zap className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{stats.activeConnections}</div>
                <p className="text-xs text-muted-foreground">
                  {stats.activeConnections === 0 ? "Configure as integrações" : `${stats.activeConnections} de 2 serviços`}
                </p>
                <div className="flex space-x-2 mt-2">
                  <Badge variant="outline" className="text-xs">
                    Evolution API {stats.activeConnections >= 1 ? "✓" : "✗"}
                  </Badge>
                  <Badge variant="outline" className="text-xs">
                    Bitrix24 {stats.activeConnections >= 2 ? "✓" : "✗"}
                  </Badge>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
        
        <TabsContent value="messages">
          <MessageMonitor />
        </TabsContent>
        
        <TabsContent value="connections" className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <ConnectionStatus
              title="Evolution API"
              status="disconnected"
              description="Configure a API Evolution para WhatsApp"
              icon={<Wifi className="h-5 w-5" />}
            />
            <ConnectionStatus
              title="Bitrix24"
              status="disconnected"
              description="Configure a integração OAuth com Bitrix24"
              icon={<LinkIcon className="h-5 w-5" />}
            />
          </div>
        </TabsContent>
        
        <TabsContent value="config">
          <ConfigurationPanel />
        </TabsContent>
        
        <TabsContent value="guide">
          <IntegrationGuide />
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default Dashboard;
