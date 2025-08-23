
import { useEffect, useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectTrigger, SelectContent, SelectItem, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { listSessionsForLines, upsertSessionBinding } from "@/services/waSessions";
import * as EvowhatsApi from "@/services/evowhatsApi";
import { Link2, Save, RefreshCw } from "lucide-react";

type Line = { ID: string; NAME: string };

export default function BindingsManager({ lines }: { lines: Line[] }) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [instances, setInstances] = useState<EvowhatsApi.InstanceStatus[]>([]);
  const [bindings, setBindings] = useState<Record<string, string>>({}); // lineId -> instanceName
  const [sessions, setSessions] = useState<Record<string, any>>({});

  const lineIds = useMemo(() => lines?.map(l => l.ID) || [], [lines]);

  const loadData = async () => {
    setLoading(true);
    try {
      const [instList, sessMap] = await Promise.all([
        EvowhatsApi.getInstancesStatus(),
        listSessionsForLines(lineIds)
      ]);
      setInstances(instList);
      setSessions(sessMap);
      const initial: Record<string, string> = {};
      lines.forEach((l) => {
        const sess = sessMap[l.ID];
        if (sess?.evo_instance_id) initial[l.ID] = sess.evo_instance_id;
        else initial[l.ID] = `evo_line_${l.ID}`;
      });
      setBindings(initial);
    } catch (e: any) {
      console.error("[BindingsManager] load error:", e);
      toast({ title: "Erro", description: e.message || "Falha ao carregar vínculos", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (lineIds.length > 0) loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lineIds.join(",")]);

  const handleSave = async (lineId: string) => {
    try {
      setLoading(true);
      const instanceName = bindings[lineId];
      if (!instanceName) {
        toast({ title: "Selecione uma instância", description: "Escolha uma instância para vincular", variant: "destructive" });
        return;
      }
      await upsertSessionBinding(lineId, instanceName);
      toast({ title: "Vínculo salvo", description: `Linha ${lineId} vinculada a ${instanceName}` });
      await loadData();
    } catch (e: any) {
      console.error("[BindingsManager] save error:", e);
      toast({ title: "Erro ao salvar", description: e.message || "Falha ao salvar vínculo", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  if (!lines || lines.length === 0) return null;

  return (
    <Card className="p-4 space-y-3">
      <div className="flex items-center gap-2">
        <Link2 className="h-4 w-4" />
        <Label className="font-medium">Vínculos Instância ⇄ Open Line</Label>
        <Button variant="ghost" size="icon" className={loading ? "animate-spin" : ""} onClick={loadData}>
          <RefreshCw className="h-4 w-4" />
        </Button>
      </div>
      <div className="space-y-3">
        {lines.map((line) => (
          <Card key={line.ID} className="p-3">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
              <div>
                <div className="font-medium">{line.NAME}</div>
                <div className="text-xs text-muted-foreground">ID: {line.ID}</div>
              </div>
              <div className="flex items-center gap-2">
                <Select
                  value={bindings[line.ID]}
                  onValueChange={(v) => setBindings((prev) => ({ ...prev, [line.ID]: v }))}
                  disabled={loading}
                >
                  <SelectTrigger className="w-64">
                    <SelectValue placeholder="Selecione instância" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={`evo_line_${line.ID}`}>{`evo_line_${line.ID}`}</SelectItem>
                    {instances.map((i) => (
                      <SelectItem key={i.instance_name} value={i.instance_name}>
                        {i.instance_name} {i.instance_status === "active" ? "✓" : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button size="sm" onClick={() => handleSave(line.ID)} disabled={loading}>
                  <Save className="h-4 w-4 mr-2" />
                  Salvar
                </Button>
              </div>
              {sessions[line.ID]?.status && (
                <div className="text-xs text-muted-foreground">
                  Status atual: {sessions[line.ID]?.status}
                </div>
              )}
            </div>
          </Card>
        ))}
      </div>
      <div className="text-xs text-muted-foreground">
        Dica: use um nome por linha (ex.: evo_line_{'{'}LINE_ID{'}'}) para facilitar o monitoramento.
      </div>
    </Card>
  );
}
