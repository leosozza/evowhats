import React, { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "@/components/ui/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate, Link } from "react-router-dom";
import { ArrowLeft, Eye } from "lucide-react";

type Instance = { id: string; label?: string; status?: string; bound_line_id?: string };

export default function EvolutionInstances() {
  const navigate = useNavigate();
  const [instances, setInstances] = useState<Instance[]>([]);
  const [loading, setLoading] = useState(false);
  const [lineIdCreate, setLineIdCreate] = useState("");
  const [testTo, setTestTo] = useState("");

  async function listInstances() {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("evolution-connector-v2", {
        body: { action: "list_instances" },
      });
      if (error) throw error;
      console.log("instances raw:", data);
      setInstances(data?.instances || data?.data || []);
      toast({ title: "Evolution API OK" });
    } catch (e: any) {
      toast({ title: "Falha ao listar instâncias", description: e?.message || String(e), variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }

  async function ensure(lineId: string) {
    try {
      const { data, error } = await supabase.functions.invoke("evolution-connector-v2", {
        body: { action: "ensure_line_session", lineId },
      });
      if (error) throw error;
      toast({ title: `Instância criada/garantida: ${data?.instanceName}` });
      await listInstances();
    } catch (e: any) {
      toast({ title: "Erro ao criar instância", description: e?.message || String(e), variant: "destructive" });
    }
  }

  async function start(lineId: string) {
    try {
      const { error } = await supabase.functions.invoke("evolution-connector-v2", {
        body: { action: "start_session_for_line", lineId },
      });
      if (error) throw error;
      toast({ title: "Sessão iniciada, buscando status/QR..." });
    } catch (e: any) {
      toast({ title: "Erro ao iniciar sessão", description: e?.message || String(e), variant: "destructive" });
    }
  }

  async function status(lineId: string) {
    try {
      const { data, error } = await supabase.functions.invoke("evolution-connector-v2", {
        body: { action: "get_status_for_line", lineId },
      });
      if (error) throw error;
      toast({ title: `Status: ${data?.state || "unknown"}` });
    } catch (e: any) {
      toast({ title: "Erro ao obter status", description: e?.message || String(e), variant: "destructive" });
    }
  }

  async function showQr(lineId: string) {
    try {
      const { data, error } = await supabase.functions.invoke("evolution-connector-v2", {
        body: { action: "get_qr_for_line", lineId },
      });
      if (error) throw error;
      const b64 = data?.qr_base64;
      if (b64) {
        const w = window.open();
        w?.document.write(`<img alt="QR" src="data:image/png;base64,${b64}" />`);
      } else {
        toast({ title: "QR indisponível (estado não é 'connecting')" });
      }
    } catch (e: any) {
      toast({ title: "Erro ao obter QR", description: e?.message || String(e), variant: "destructive" });
    }
  }

  async function bind(instanceId: string, lineId: string) {
    try {
      const { error } = await supabase.functions.invoke("evolution-connector-v2", {
        body: { action: "bind_line", instanceId, lineId },
      });
      if (error) throw error;
      toast({ title: "Vinculado!" });
      await listInstances();
    } catch (e: any) {
      toast({ title: "Erro ao vincular", description: e?.message || String(e), variant: "destructive" });
    }
  }

  async function testSend(lineId: string) {
    if (!testTo) {
      toast({ title: "Informe um telefone para teste", variant: "destructive" });
      return;
    }
    try {
      const { error } = await supabase.functions.invoke("evolution-connector-v2", {
        body: { action: "test_send", lineId, to: testTo },
      });
      if (error) throw error;
      toast({ title: "Mensagem de teste enviada" });
    } catch (e: any) {
      toast({ title: "Erro no teste", description: e?.message || String(e), variant: "destructive" });
    }
  }

  useEffect(() => { listInstances(); }, []);

  return (
    <div className="container mx-auto py-8 px-4">
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <Button variant="ghost" onClick={() => navigate("/")} className="flex items-center gap-2">
            <ArrowLeft className="h-4 w-4" />
            Voltar ao Dashboard
          </Button>
          <h1 className="text-2xl font-bold">Instâncias Evolution</h1>
        </div>

        <Card>
          <CardHeader><CardTitle>Evolution API — Validação & Criação</CardTitle></CardHeader>
          <CardContent className="flex gap-2 items-end">
            <Button variant="outline" onClick={listInstances} disabled={loading}>
              {loading ? "Validando..." : "Validar API / Recarregar"}
            </Button>
            <div className="flex items-end gap-2">
              <div>
                <label className="block text-sm">Line ID</label>
                <Input value={lineIdCreate} onChange={e => setLineIdCreate(e.target.value)} placeholder="Ex.: 15" />
              </div>
              <Button onClick={() => lineIdCreate && ensure(lineIdCreate)}>Criar instância</Button>
            </div>
            <div className="flex items-end gap-2">
              <div>
                <label className="block text-sm">Telefone teste (E.164)</label>
                <Input value={testTo} onChange={e => setTestTo(e.target.value)} placeholder="+5511999999999" />
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4">
          {instances.map((it) => (
            <Card key={it.id} className="hover:shadow-md transition-shadow">
              <CardHeader>
                <CardTitle>
                  <Link to={`/evolution/instances/${it.id}`} className="hover:text-primary">
                    {it.label || it.id}
                  </Link>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <div className="text-sm text-muted-foreground">Status: {it.status || "—"}</div>
                <div className="flex gap-2 flex-wrap">
                  <Button size="sm" onClick={() => status(it.bound_line_id || it.id)}>Status</Button>
                  <Button size="sm" onClick={() => start(it.bound_line_id || it.id)}>Conectar / QR</Button>
                  <Button size="sm" variant="outline" onClick={() => showQr(it.bound_line_id || it.id)}>Mostrar QR</Button>
                  <Link to={`/evolution/instances/${it.id}`}>
                    <Button size="sm" variant="outline" className="flex items-center gap-1">
                      <Eye className="h-3 w-3" />
                      Detalhes
                    </Button>
                  </Link>
                </div>
                <div className="flex gap-2 items-end pt-2">
                  <Input placeholder="Line ID para bind" onKeyDown={(e) => {
                    if (e.key === "Enter") bind(it.id, (e.target as HTMLInputElement).value);
                  }} />
                  <Button size="sm" onClick={() => {
                    const input = (document.activeElement as HTMLInputElement);
                    bind(it.id, input?.value || "");
                  }}>Vincular</Button>
                </div>
                <div className="flex gap-2 items-center pt-2">
                  <Button size="sm" onClick={() => testSend(it.bound_line_id || it.id)}>Testar envio</Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {instances.length === 0 && !loading && <div className="text-sm text-muted-foreground">Nenhuma instância encontrada.</div>}
      </div>
    </div>
  );
}