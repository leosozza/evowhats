
import React, { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "@/components/ui/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useLineEvolution } from "@/hooks/useLineEvolution";

export default function BindingsDashboard() {
  const [instances, setInstances] = useState<any[]>([]);
  const [lines, setLines] = useState<any[]>([]);
  const [selectedTo, setSelectedTo] = useState<string>("");
  const { startSession, testSend } = useLineEvolution();

  async function refresh() {
    const inst = await supabase.functions.invoke("evolution-connector-v2", {
      body: { action: "list_instances" },
    });
    setInstances(inst.data?.instances || []);
    const ln = await supabase.functions.invoke("bitrix-openlines", {
      body: { action: "list_lines" },
    });
    setLines(ln.data?.lines || []);
  }

  useEffect(() => { refresh(); }, []);

  async function bind(instanceId: string, lineId: string) {
    const { error } = await supabase.functions.invoke("evolution-connector-v2", {
      body: { action: "bind_line", instanceId, lineId },
    });
    if (error) toast({ title: "Falha ao vincular", variant: "destructive" });
    else toast({ title: "Vinculado!" });
    refresh();
  }

  async function startSessionForInstance(instanceId: string, lineId: string) {
    if (!lineId) {
      toast({ title: "Vincule uma linha primeiro", variant: "destructive" });
      return;
    }
    try {
      await supabase.functions.invoke("evolution-connector-v2", {
        body: { action: "start_session_for_line", lineId },
      });
      toast({ title: "Sessão iniciada" });
    } catch (error: any) {
      toast({ title: "Erro ao iniciar sessão", description: error.message, variant: "destructive" });
    }
  }

  async function showQr(instanceId: string, lineId: string) {
    if (!lineId) {
      toast({ title: "Vincule uma linha primeiro", variant: "destructive" });
      return;
    }
    try {
      const qr = await supabase.functions.invoke("evolution-connector-v2", {
        body: { action: "get_qr_for_line", lineId },
      });
      if (qr.data?.qr_base64) {
        const w = window.open();
        if (w) w.document.write(`<img src="${qr.data.qr_base64}" />`);
      } else {
        toast({ title: "QR não disponível", variant: "destructive" });
      }
    } catch (error: any) {
      toast({ title: "Erro ao obter QR", description: error.message, variant: "destructive" });
    }
  }

  async function handleTestSend(lineId: string) {
    if (!selectedTo.trim()) {
      toast({ title: "Informe um número de telefone", variant: "destructive" });
      return;
    }
    try {
      await testSend(lineId, selectedTo);
      toast({ title: "Mensagem de teste enviada!" });
    } catch (error: any) {
      toast({ title: "Erro no teste", description: error.message, variant: "destructive" });
    }
  }

  return (
    <div className="grid gap-6 md:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle>Instâncias Evolution</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {instances.map((it) => (
            <div key={it.id} className="border rounded p-3 space-y-2">
              <div className="flex items-center justify-between">
                <div>
                  <div className="font-medium">{it.label || it.id}</div>
                  <div className="text-sm text-muted-foreground">Status: {it.status}</div>
                </div>
                <div className="space-x-2">
                  <Button 
                    size="sm" 
                    onClick={() => startSessionForInstance(it.id, it.bound_line_id || "")}
                  >
                    Iniciar
                  </Button>
                  <Button 
                    size="sm" 
                    variant="outline" 
                    onClick={() => showQr(it.id, it.bound_line_id || "")}
                  >
                    Mostrar QR
                  </Button>
                </div>
              </div>
              <div className="flex gap-2 items-center">
                <select
                  className="border rounded p-2 flex-1"
                  value={it.bound_line_id || ""}
                  onChange={(e) => bind(it.id, e.target.value)}
                >
                  <option value="">Vincular a uma linha...</option>
                  {lines.map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.name} (id {l.id})
                    </option>
                  ))}
                </select>
                <Input
                  placeholder="Telefone teste (E.164)"
                  value={selectedTo}
                  onChange={(e) => setSelectedTo(e.target.value)}
                />
                <Button onClick={() => handleTestSend(it.bound_line_id)}>Testar envio</Button>
              </div>
            </div>
          ))}
          {instances.length === 0 && <div className="text-sm text-muted-foreground">Nenhuma instância encontrada.</div>}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Linhas Open Lines</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {lines.map((l) => (
            <div key={l.id} className="border rounded p-2">
              <div className="font-medium">{l.name}</div>
              <div className="text-sm text-muted-foreground">ID: {l.id}</div>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
