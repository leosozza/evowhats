
import React from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { 
  MessageSquare, 
  Phone, 
  Users, 
  Activity, 
  CheckCircle, 
  XCircle, 
  Clock,
  RefreshCw,
  Plus,
  Settings
} from 'lucide-react';
import { useEvowhatsSystem } from '@/hooks/useEvowhatsSystem';

export function EvowhatsControlPanel() {
  const { 
    systemStatus, 
    loading, 
    error, 
    refreshStatus, 
    createInstance, 
    bindBitrixEvents, 
    testOpenLines 
  } = useEvowhatsSystem();

  const handleCreateInstance = () => {
    const label = prompt('Nome da instância:');
    if (label) {
      createInstance(label);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Evowhats Control Panel</h2>
          <p className="text-gray-600">
            Sistema de multiatendimento WhatsApp integrado ao Bitrix24
          </p>
        </div>
        <Button onClick={refreshStatus} disabled={loading} variant="outline">
          <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
          Atualizar
        </Button>
      </div>

      {error && (
        <Card className="border-red-200 bg-red-50">
          <CardContent className="pt-6">
            <div className="flex items-center text-red-800">
              <XCircle className="h-4 w-4 mr-2" />
              {error}
            </div>
          </CardContent>
        </Card>
      )}

      {/* System Overview */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Conversas</CardTitle>
            <MessageSquare className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{systemStatus.conversations.total}</div>
            <div className="flex gap-2 mt-2">
              <Badge variant="default" className="text-xs">
                {systemStatus.conversations.open} abertas
              </Badge>
              <Badge variant="secondary" className="text-xs">
                {systemStatus.conversations.pending} pendentes
              </Badge>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Mensagens</CardTitle>
            <Activity className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{systemStatus.messages.total}</div>
            <div className="flex gap-2 mt-2">
              <Badge variant="outline" className="text-xs">
                ↓ {systemStatus.messages.inbound}
              </Badge>
              <Badge variant="outline" className="text-xs">
                ↑ {systemStatus.messages.outbound}
              </Badge>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">WhatsApp</CardTitle>
            <Phone className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="flex items-center">
              {systemStatus.evolution.connected ? (
                <>
                  <CheckCircle className="h-4 w-4 text-green-500 mr-2" />
                  <span className="text-sm text-green-700">Conectado</span>
                </>
              ) : (
                <>
                  <XCircle className="h-4 w-4 text-red-500 mr-2" />
                  <span className="text-sm text-red-700">Desconectado</span>
                </>
              )}
            </div>
            <div className="text-xs text-gray-500 mt-1">
              {systemStatus.evolution.instances.length} instâncias
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Bitrix24</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="flex items-center">
              {systemStatus.bitrix.connected ? (
                <>
                  <CheckCircle className="h-4 w-4 text-green-500 mr-2" />
                  <span className="text-sm text-green-700">Conectado</span>
                </>
              ) : (
                <>
                  <XCircle className="h-4 w-4 text-red-500 mr-2" />
                  <span className="text-sm text-red-700">Desconectado</span>
                </>
              )}
            </div>
            <div className="text-xs text-gray-500 mt-1">
              {systemStatus.bitrix.portal_url ? new URL(systemStatus.bitrix.portal_url).hostname : 'Não configurado'}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* WhatsApp Instances */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Instâncias WhatsApp</CardTitle>
              <CardDescription>
                Gerencie suas conexões Evolution API
              </CardDescription>
            </div>
            <Button onClick={handleCreateInstance}>
              <Plus className="h-4 w-4 mr-2" />
              Nova Instância
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {systemStatus.evolution.instances.length === 0 ? (
            <div className="text-center py-4 text-gray-500">
              Nenhuma instância configurada
            </div>
          ) : (
            <div className="space-y-3">
              {systemStatus.evolution.instances.map((instance, index) => (
                <div key={index} className="flex items-center justify-between p-3 border rounded-lg">
                  <div className="flex items-center space-x-3">
                    <div className={`h-2 w-2 rounded-full ${
                      instance.status === 'active' ? 'bg-green-500' :
                      instance.status === 'connecting' ? 'bg-yellow-500' :
                      instance.status === 'qr_required' ? 'bg-blue-500' :
                      'bg-red-500'
                    }`} />
                    <div>
                      <div className="font-medium">{instance.label}</div>
                      {instance.phone_hint && (
                        <div className="text-xs text-gray-500">{instance.phone_hint}</div>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center space-x-2">
                    <Badge variant={
                      instance.status === 'active' ? 'default' :
                      instance.status === 'connecting' ? 'secondary' :
                      instance.status === 'qr_required' ? 'outline' :
                      'destructive'
                    }>
                      {instance.status}
                    </Badge>
                    <Button variant="ghost" size="sm">
                      <Settings className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Bitrix Integration */}
      <Card>
        <CardHeader>
          <CardTitle>Integração Bitrix24</CardTitle>
          <CardDescription>
            Status da conexão e configuração do Open Channels
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              {systemStatus.bitrix.connected ? (
                <CheckCircle className="h-4 w-4 text-green-500" />
              ) : (
                <XCircle className="h-4 w-4 text-red-500" />
              )}
              <span>Conexão estabelecida</span>
            </div>
            {systemStatus.bitrix.portal_url && (
              <Badge variant="outline">{new URL(systemStatus.bitrix.portal_url).hostname}</Badge>
            )}
          </div>

          <Separator />

          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              {systemStatus.bitrix.events_bound ? (
                <CheckCircle className="h-4 w-4 text-green-500" />
              ) : (
                <Clock className="h-4 w-4 text-yellow-500" />
              )}
              <span>Eventos configurados</span>
            </div>
            {!systemStatus.bitrix.events_bound && systemStatus.bitrix.connected && (
              <Button onClick={bindBitrixEvents} size="sm">
                Configurar Eventos
              </Button>
            )}
          </div>

          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              {systemStatus.bitrix.openlines_configured ? (
                <CheckCircle className="h-4 w-4 text-green-500" />
              ) : (
                <Clock className="h-4 w-4 text-yellow-500" />
              )}
              <span>Open Channels ativo</span>
            </div>
            {systemStatus.bitrix.connected && (
              <Button onClick={testOpenLines} size="sm" variant="outline">
                Testar
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
