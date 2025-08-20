
import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { getOpenLinesWebhookUrl, listBitrixChannels, upsertBitrixChannel } from "@/services/bitrixOpenChannels";
import { Save, Copy, RefreshCcw } from "lucide-react";

export default function BitrixChannelConfig() {
  const { toast } = useToast();
  const [channelId, setChannelId] = useState("");
  const [channelName, setChannelName] = useState("");
  const [loading, setLoading] = useState(false);
  const [loadingList, setLoadingList] = useState(false);

  const webhookUrl = getOpenLinesWebhookUrl();

  const loadExisting = async () => {
    setLoadingList(true);
    try {
      const channels = await listBitrixChannels();
      if (channels.length > 0) {
        const ch = channels[0];
        setChannelId(ch.channel_id);
        setChannelName(ch.channel_name);
      }
    } catch (e) {
      console.error("[BitrixChannelConfig] loadExisting error:", e);
    } finally {
      setLoadingList(false);
    }
  };

  useEffect(() => {
    loadExisting();
  }, []);

  const onSave = async () => {
    if (!channelId || !channelName) {
      toast({
        title: "Campos obrigatórios",
        description: "Informe Channel ID e nome do canal.",
        variant: "destructive",
      });
      return;
    }
    setLoading(true);
    try {
      const saved = await upsertBitrixChannel({ channel_id: channelId.trim(), channel_name: channelName.trim() });
      toast({
        title: "Canal salvo",
        description: `Canal ${saved.channel_name} (ID: ${saved.channel_id}) atualizado.`,
      });
    } catch (e) {
      console.error("[BitrixChannelConfig] onSave error:", e);
      toast({
        title: "Erro ao salvar",
        description: "Não foi possível salvar o canal.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const copyWebhook = async () => {
    try {
      await navigator.clipboard.writeText(webhookUrl);
      toast({ title: "Copiado!", description: "Webhook URL copiada para a área de transferência." });
    } catch {
      toast({ title: "Falha ao copiar", description: "Copie manualmente a URL.", variant: "destructive" });
    }
  };

  return (
    <Card className="p-4 space-y-4">
      <div>
        <h3 className="text-base font-semibold">Open Channels (Inbox) do Bitrix24</h3>
        <p className="text-sm text-muted-foreground">
          Cole a URL abaixo como Webhook do canal no Bitrix24. Em seguida, salve o Channel ID e o nome do canal.
        </p>
      </div>

      <div>
        <Label>Webhook URL</Label>
        <div className="flex gap-2 mt-1">
          <Input value={webhookUrl} readOnly />
          <Button variant="outline" onClick={copyWebhook}>
            <Copy className="h-4 w-4 mr-2" /> Copiar
          </Button>
        </div>
        <p className="text-xs text-muted-foreground mt-1">
          Endpoint público: recebe eventos do Open Channels e registra nos logs.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div>
          <Label htmlFor="bx-channel-id">Channel ID</Label>
          <Input
            id="bx-channel-id"
            placeholder="Ex.: 1"
            value={channelId}
            onChange={(e) => setChannelId(e.target.value)}
          />
        </div>
        <div>
          <Label htmlFor="bx-channel-name">Nome do Canal</Label>
          <Input
            id="bx-channel-name"
            placeholder="Ex.: WhatsApp Suporte"
            value={channelName}
            onChange={(e) => setChannelName(e.target.value)}
          />
        </div>
      </div>

      <div className="flex gap-2">
        <Button onClick={onSave} disabled={loading}>
          <Save className="h-4 w-4 mr-2" />
          {loading ? "Salvando..." : "Salvar Canal"}
        </Button>
        <Button type="button" variant="outline" onClick={loadExisting} disabled={loadingList}>
          <RefreshCcw className="h-4 w-4 mr-2" />
          {loadingList ? "Atualizando..." : "Recarregar"}
        </Button>
      </div>
    </Card>
  );
}
