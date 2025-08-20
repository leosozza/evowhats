
import { useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import ConnectionStatus from "./ConnectionStatus";
import ConfigurationPanel from "./ConfigurationPanel";
import MessageMonitor from "./MessageMonitor";
import OpenChannelsManager from "./bitrix/OpenChannelsManager";
import { 
  Activity, 
  Settings, 
  MessageSquare,
  Zap
} from "lucide-react";

const Dashboard = () => {
  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="text-center space-y-2">
        <h1 className="text-3xl font-bold">EvoWhats Dashboard</h1>
        <p className="text-muted-foreground">
          Integração Evolution API + Bitrix24 Open Channels
        </p>
      </div>

      <Tabs defaultValue="connections" className="w-full">
        <TabsList className="grid w-full grid-cols-4">
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

        <TabsContent value="settings" className="mt-6">
          <ConfigurationPanel />
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default Dashboard;
