
import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "@/components/ui/use-toast";
import { openBitrixPopup, getPortalFromIframe } from "@/utils/bitrixAuth";
import { supabase } from "@/integrations/supabase/client";

export default function ConnectorSetup() {
  const [portalUrl, setPortalUrl] = useState<string>(getPortalFromIframe() || "");

  async function handleReconnect() {
    if (!portalUrl) {
      toast({ title: "Informe o portal do Bitrix24", variant: "destructive" });
      return;
    }
    openBitrixPopup(async () => {
      // Após callback concluir, peça um refresh do status no backend
      await supabase.functions.invoke("bitrix-token-refresh", { body: {} }).catch(() => {});
      toast({ title: "Bitrix conectado!" });
    });
  }

  return (
    <div className="space-y-3">
      <div className="grid gap-2">
        <label>URL do Portal Bitrix24</label>
        <Input
          placeholder="https://seudominio.bitrix24.com.br"
          value={portalUrl}
          onChange={(e) => setPortalUrl(e.target.value)}
        />
      </div>
      <Button onClick={handleReconnect}>Reconectar OAuth</Button>
    </div>
  );
}
