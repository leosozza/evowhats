
import React, { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "@/components/ui/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { openBitrixPopup, getPortalFromIframe } from "@/utils/bitrixAuth";

export default function ConnectorSetup() {
  const [portalUrl, setPortalUrl] = useState(getPortalFromIframe() || "");
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<null | { ok: boolean; refreshed?: boolean }>(null);

  const handlePortalUrlChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const url = e.target.value;
    setPortalUrl(url);
    localStorage.setItem('bitrix_portal_url', url);
  };

  async function refreshToken() {
    try {
      setLoading(true);
      const { data, error } = await supabase.functions.invoke("bitrix-token-refresh", { body: {} });
      if (error) throw error;
      setStatus(data);
    } catch (e: any) {
      toast({ title: "Erro ao checar Bitrix", description: e?.message || String(e), variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { refreshToken(); }, []);

  return (
    <div className="space-y-4">
      <div className="flex gap-2 items-end">
        <div className="flex-1">
          <label className="block text-sm">URL do Portal Bitrix24</label>
          <Input 
            value={portalUrl} 
            onChange={handlePortalUrlChange} 
            placeholder="https://seuportal.bitrix24.com.br" 
          />
        </div>
        <Button
          onClick={() =>
            openBitrixPopup(async ({ ok, reason }) => {
              if (ok) {
                await refreshToken();
                toast({ title: "Bitrix conectado!" });
              } else {
                toast({ title: "Falha ao conectar Bitrix", description: reason, variant: "destructive" });
              }
            })
          }
        >
          Reconectar OAuth
        </Button>
        <Button variant="outline" onClick={refreshToken} disabled={loading}>
          {loading ? "Verificando..." : "Checar status"}
        </Button>
      </div>

      <div className="text-sm text-muted-foreground">
        Status: {status ? (status.ok ? (status.refreshed ? "Token atualizado" : "Token válido") : "Desconectado") : "Carregando..."}
      </div>
    </div>
  );
}
