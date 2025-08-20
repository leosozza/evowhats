
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { bindBitrixEvents } from "@/services/bitrixIntegration";
import { Webhook } from "lucide-react";
import { useState } from "react";

export default function BindEventsButton() {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);

  const onBind = async () => {
    setLoading(true);
    try {
      const res = await bindBitrixEvents();
      toast({ title: "Webhooks", description: res.message || "Eventos vinculados com sucesso." });
    } catch (e: any) {
      toast({ title: "Erro ao vincular eventos", description: e?.message || "Tente novamente.", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Button variant="outline" onClick={onBind} disabled={loading}>
      <Webhook className="h-4 w-4 mr-2" />
      {loading ? "Vinculando..." : "Ativar Webhooks"}
    </Button>
  );
}
