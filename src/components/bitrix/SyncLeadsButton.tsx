
import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { syncBitrixLeads } from "@/services/bitrixIntegration";
import { RefreshCw, Download, CheckCircle } from "lucide-react";
import { getBitrixAuthStatus } from "@/services/bitrixAuthStatus";
import { supabase } from "@/integrations/supabase/client";

const SyncLeadsButton = () => {
  const [syncing, setSyncing] = useState(false);
  const [lastSync, setLastSync] = useState<Date | null>(null);
  const [syncCount, setSyncCount] = useState<number>(0);
  const [isConnected, setIsConnected] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    checkConnectionStatus();
    loadLastSyncInfo();
  }, []);

  const checkConnectionStatus = async () => {
    try {
      const status = await getBitrixAuthStatus();
      setIsConnected(status.isConnected && status.hasValidTokens);
    } catch (error) {
      setIsConnected(false);
    }
  };

  const loadLastSyncInfo = async () => {
    try {
      // Get real conversation count as sync indicator
      const { count } = await supabase
        .from('conversations')
        .select('*', { count: 'exact', head: true });
      
      if (count && count > 0) {
        setSyncCount(count);
        // Get the most recent conversation date
        const { data } = await supabase
          .from('conversations')
          .select('created_at')
          .order('created_at', { ascending: false })
          .limit(1);
        
        if (data && data[0]) {
          setLastSync(new Date(data[0].created_at));
        }
      }
    } catch (error) {
      console.error('Error loading sync info:', error);
    }
  };

  const handleSync = async () => {
    if (!isConnected) {
      toast({
        title: "Conexão necessária",
        description: "Conecte-se ao Bitrix24 via OAuth primeiro.",
        variant: "destructive",
      });
      return;
    }

    setSyncing(true);
    
    try {
      const result = await syncBitrixLeads();
      
      if (result.success) {
        const imported = result.imported || 0;
        setSyncCount(prevCount => prevCount + imported);
        setLastSync(new Date());
        
        toast({
          title: "Sincronização concluída!",
          description: imported > 0 
            ? `${imported} novos contatos sincronizados.`
            : "Nenhum novo contato encontrado.",
        });
        
        // Reload sync info to get real data
        await loadLastSyncInfo();
      } else {
        throw new Error("Falha na sincronização");
      }
    } catch (error: any) {
      console.error("[SyncLeads] Sync error:", error);
      toast({
        title: "Erro na sincronização",
        description: error.message || "Falha ao sincronizar leads do Bitrix24",
        variant: "destructive",
      });
    } finally {
      setSyncing(false);
    }
  };

  if (!isConnected) {
    return (
      <Button disabled variant="outline" size="sm">
        <RefreshCw className="h-4 w-4 mr-2" />
        Conecte ao Bitrix24 primeiro
      </Button>
    );
  }

  return (
    <div className="space-y-2">
      <Button 
        onClick={handleSync} 
        disabled={syncing}
        variant="outline" 
        size="sm"
      >
        <RefreshCw className={`h-4 w-4 mr-2 ${syncing ? 'animate-spin' : ''}`} />
        {syncing ? "Sincronizando..." : "Sincronizar Contatos"}
      </Button>
      
      {(syncCount > 0 || lastSync) && (
        <div className="text-xs text-muted-foreground space-y-1">
          {syncCount > 0 && (
            <div className="flex items-center gap-1">
              <CheckCircle className="h-3 w-3 text-green-500" />
              <span>{syncCount} contatos sincronizados</span>
            </div>
          )}
          {lastSync && (
            <div className="flex items-center gap-1">
              <Download className="h-3 w-3" />
              <span>Último sync: {lastSync.toLocaleString('pt-BR')}</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default SyncLeadsButton;
