import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";
import {
  Activity,
  Eye,
  Link2,
  Settings,
  Zap,
} from "lucide-react";
import { useDashboardStats } from "@/hooks/useDashboardStats";
import { useBitrixConnection } from "@/hooks/useBitrixConnection";

const Dashboard = () => {
  const { stats, loading } = useDashboardStats();
  const { bitrixConnectionStatus } = useBitrixConnection();

  return (
    <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
      {/* Monitor em Tempo Real */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Monitor em Tempo Real</CardTitle>
          <Activity className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{stats.activeConnections}</div>
          <p className="text-xs text-muted-foreground">
            conexões ativas
          </p>
          <Button className="w-full mt-2" asChild>
            <Link to="/contact-center">
              <Eye className="mr-2 h-4 w-4" />
              Ver Monitor
            </Link>
          </Button>
        </CardContent>
      </Card>

      {/* Configuração */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Configuração</CardTitle>
          <Settings className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{bitrixConnectionStatus}</div>
          <p className="text-xs text-muted-foreground">
            status da integração
          </p>
          <Button className="w-full mt-2" asChild>
            <Link to="/connector">
              <Settings className="mr-2 h-4 w-4" />
              Configurar
            </Link>
          </Button>
        </CardContent>
      </Card>

      {/* Evolution API */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Evolution API</CardTitle>
          <Zap className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{stats.evolutionInstances}</div>
          <p className="text-xs text-muted-foreground">
            instâncias ativas
          </p>
          <Button className="w-full mt-2" asChild>
            <Link to="/evolution/instances">
              <Zap className="mr-2 h-4 w-4" />
              Gerenciar Instâncias
            </Link>
          </Button>
        </CardContent>
      </Card>

      {/* Vínculos */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Vínculos</CardTitle>
          <Link2 className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{stats.bindings}</div>
          <p className="text-xs text-muted-foreground">
            canais vinculados
          </p>
          <Button className="w-full mt-2" asChild>
            <Link to="/bindings">
              <Link2 className="mr-2 h-4 w-4" />
              Ver Vínculos
            </Link>
          </Button>
        </CardContent>
      </Card>

      {/* Leads Importados */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Leads</CardTitle>
          <Activity className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{stats.importedLeads}</div>
          <p className="text-xs text-muted-foreground">
            leads importados
          </p>
        </CardContent>
      </Card>

      {/* Mensagens Enviadas */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Mensagens</CardTitle>
          <Activity className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{stats.sentMessages}</div>
          <p className="text-xs text-muted-foreground">
            mensagens enviadas (30d)
          </p>
        </CardContent>
      </Card>
    </div>
  );
};

export default Dashboard;
