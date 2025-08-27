
import { useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import ConnectionStatus from "./ConnectionStatus";
import ConfigurationPanel from "./ConfigurationPanel";
import MessageMonitor from "./MessageMonitor";
import RealMessageMonitor from "./RealMessageMonitor";
import OpenChannelsManager from "./bitrix/OpenChannelsManager";
import { 
  Activity, 
  Settings, 
  MessageSquare,
  Zap,
  Radio,
  Bot
} from "lucide-react";
import { useNavigate } from "react-router-dom";

const Dashboard = () => {
  const navigate = useNavigate();

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="text-center space-y-2">
        <h1 className="text-3xl font-bold">EvoWhats Dashboard</h1>
        <p className="text-muted-foreground">
          Integração Evolution API + Bitrix24 Open Channels
        </p>
      </div>

      {/* Quick Actions */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Zap className="h-5 w-5" />
            Ações Rápidas
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex gap-4">
            <Button onClick={() => navigate("/evolution/instances")} className="flex items-center gap-2">
              <Bot className="h-4 w-4" />
              Instâncias Evolution
            </Button>
            <Button onClick={() => navigate("/bindings")} variant="outline" className="flex items-center gap-2">
              <Activity className="h-4 w-4" />
              Gerenciar Bindings
            </Button>
          </div>
        </CardContent>
      </Card>

      <Tabs defaultValue="connections" className="w-full">
        <TabsList className="grid w-full grid-cols-5">
          <TabsTrigger value="connections" className="flex items-center gap-2">
            <Activity className="h-4 w-4" />
            Conexões
          </TabsTrigger>
          <TabsTrigger value="openlines" className="flex items-center gap-2">
            <MessageSquare className="h-4 w-4" />
            Open Channels
          </TabsTrigger>
          <TabsTrigger value="messages" className="flex items-center gap-2">
            <Zap className="h-4 w-4" />
            Mensagens
          </TabsTrigger>
          <TabsTrigger value="real-messages" className="flex items-center gap-2">
            <Radio className="h-4 w-4" />
            Monitor Real
          </TabsTrigger>
          <TabsTrigger value="settings" className="flex items-center gap-2">
            <Settings className="h-4 w-4" />
            Configurações
          </TabsTrigger>
        </TabsList>

        <TabsContent value="connections" className="mt-6">
          <ConnectionStatus />
        </TabsContent>

        <TabsContent value="openlines" className="mt-6">
          <OpenChannelsManager />
        </TabsContent>

        <TabsContent value="messages" className="mt-6">
          <MessageMonitor />
        </TabsContent>

        <TabsContent value="real-messages" className="mt-6">
          <RealMessageMonitor />
        </TabsContent>

        <TabsContent value="settings" className="mt-6">
          <ConfigurationPanel />
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default Dashboard;
