import { useState, useEffect, useCallback } from 'react';
import { useSupabaseAuth } from './useSupabaseAuth';
import { useToast } from '@/hooks/use-toast';
import * as EvowhatsApi from '@/services/evowhatsApi';

export interface SystemStatus {
  evolution: {
    connected: boolean;
    instances: EvowhatsApi.InstanceStatus[];
    lastUpdate: string;
  };
  bitrix: EvowhatsApi.BitrixIntegrationStatus;
  conversations: {
    total: number;
    open: number;
    pending: number;
    closed: number;
  };
  messages: {
    total: number;
    inbound: number;
    outbound: number;
  };
}

export function useEvowhatsSystem() {
  const { session } = useSupabaseAuth();
  const { toast } = useToast();
  const [systemStatus, setSystemStatus] = useState<SystemStatus>({
    evolution: { connected: false, instances: [], lastUpdate: new Date().toISOString() },
    bitrix: { connected: false, events_bound: false, openlines_configured: false },
    conversations: { total: 0, open: 0, pending: 0, closed: 0 },
    messages: { total: 0, inbound: 0, outbound: 0 },
  });
  
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refreshStatus = useCallback(async () => {
    if (!session?.user) return;

    try {
      setLoading(true);
      setError(null);

      const [instances, bitrixStatus, conversations] = await Promise.all([
        EvowhatsApi.getInstancesStatus(),
        EvowhatsApi.getBitrixStatus(),
        EvowhatsApi.getConversations(),
      ]);

      // Calculate conversation stats - simplified since we don't have status field
      const conversationStats = {
        total: conversations.length,
        open: conversations.length, // assume all are open for now
        pending: 0,
        closed: 0,
      };

      // Calculate message stats
      const allMessages = conversations.flatMap(conv => conv.messages || []);
      const messageStats = allMessages.reduce(
        (acc, msg) => {
          acc.total++;
          acc[msg.direction === 'in' ? 'inbound' : 'outbound']++;
          return acc;
        },
        { total: 0, inbound: 0, outbound: 0 }
      );

      setSystemStatus({
        evolution: {
          connected: instances.some(inst => inst.instance_status === 'active'),
          instances,
          lastUpdate: new Date().toISOString(),
        },
        bitrix: bitrixStatus,
        conversations: conversationStats,
        messages: messageStats,
      });

    } catch (err: any) {
      console.error('[useEvowhatsSystem] Error refreshing status:', err);
      setError(err.message || 'Failed to refresh system status');
      
      toast({
        title: 'Erro de Sistema',
        description: 'Falha ao atualizar status do sistema',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  }, [session?.user, toast]);

  const createInstance = useCallback(async (label: string, config: any = {}) => {
    try {
      await EvowhatsApi.createInstance(label, config);
      await refreshStatus(); // Refresh to show new instance
      
      toast({
        title: 'Instância Criada',
        description: `Instância ${label} foi criada com sucesso`,
      });
    } catch (err: any) {
      console.error('[useEvowhatsSystem] Error creating instance:', err);
      toast({
        title: 'Erro ao Criar Instância',
        description: err.message || 'Falha ao criar instância WhatsApp',
        variant: 'destructive',
      });
    }
  }, [refreshStatus, toast]);

  const bindBitrixEvents = useCallback(async () => {
    try {
      await EvowhatsApi.bindBitrixEvents();
      await refreshStatus(); // Refresh to show updated status
      
      toast({
        title: 'Eventos Vinculados',
        description: 'Eventos do Bitrix foram configurados com sucesso',
      });
    } catch (err: any) {
      console.error('[useEvowhatsSystem] Error binding events:', err);
      toast({
        title: 'Erro ao Vincular Eventos',
        description: err.message || 'Falha ao configurar eventos do Bitrix',
        variant: 'destructive',
      });
    }
  }, [refreshStatus, toast]);

  const testOpenLines = useCallback(async () => {
    if (!systemStatus.bitrix.connected) {
      toast({
        title: 'Bitrix não conectado',
        description: 'Conecte-se ao Bitrix antes de testar Open Lines',
        variant: 'destructive',
      });
      return;
    }

    try {
      await EvowhatsApi.testOpenLines('Teste de integração do Evowhats');
      
      toast({
        title: 'Teste Realizado',
        description: 'Mensagem de teste enviada para Open Lines',
      });
    } catch (err: any) {
      console.error('[useEvowhatsSystem] Error testing OpenLines:', err);
      toast({
        title: 'Erro no Teste',
        description: err.message || 'Falha ao testar Open Lines',
        variant: 'destructive',
      });
    }
  }, [systemStatus.bitrix.connected, toast]);

  // Auto-refresh every 30 seconds
  useEffect(() => {
    if (!session?.user) return;

    refreshStatus();
    const interval = setInterval(refreshStatus, 30000);
    return () => clearInterval(interval);
  }, [session?.user, refreshStatus]);

  return {
    systemStatus,
    loading,
    error,
    refreshStatus,
    createInstance,
    bindBitrixEvents,
    testOpenLines,
  };
}
