import React, { useEffect, useState, useRef } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/components/ui/use-toast";
import { ArrowLeft } from "lucide-react";

export default function EvolutionInstanceDetail() {
  const { instanceName = "" } = useParams();
  const navigate = useNavigate();
  const [state, setState] = useState<string>("unknown");
  const [qr, setQr] = useState<string | null>(null);
  const timer = useRef<number | null>(null);

  async function fetchStatus() {
    // se a sua Edge exige lineId para resolver o nome, adapte aqui
    const lineId = instanceName.replace(/^evo_line_/, "");
    const { data, error } = await supabase.functions.invoke("evolution-connector-v2", {
      body: { action: "get_status_for_line", lineId },
    });
    if (error) {
      toast({ title: "Erro ao obter status", description: error.message, variant: "destructive" });
      return;
    }
    const s = (data?.state || "unknown").toLowerCase();
    setState(s);
    if (s.includes("connecting")) {
      const { data: qrData } = await supabase.functions.invoke("evolution-connector-v2", {
        body: { action: "get_qr_for_line", lineId },
      });
      setQr(qrData?.qr_base64 || null);
    } else {
      setQr(null);
    }
  }

  function startPolling() {
    if (timer.current) return;
    fetchStatus();
    timer.current = window.setInterval(fetchStatus, 4000) as unknown as number;
  }
  function stopPolling() {
    if (timer.current) window.clearInterval(timer.current);
    timer.current = null;
  }

  useEffect(() => {
    startPolling();
    return () => stopPolling();
  }, [instanceName]);

  const lineId = instanceName.replace(/^evo_line_/, "");

  async function start() {
    await supabase.functions.invoke("evolution-connector-v2", {
      body: { action: "start_session_for_line", lineId },
    });
    toast({ title: "Sessão iniciada" });
    fetchStatus();
  }

  return (
    <div className="container mx-auto py-8 px-4">
      <div className="mb-6">
        <Link to="/evolution/instances" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-primary mb-4">
          <ArrowLeft className="h-4 w-4" />
          Voltar para instâncias
        </Link>
        <h1 className="text-3xl font-bold">{instanceName}</h1>
        <p className="text-muted-foreground">Detalhes da instância Evolution API</p>
      </div>

      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Status da Conexão</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="text-lg">
              Status: <span className={`font-semibold ${
                state === "open" ? "text-green-600" : 
                state.includes("connecting") ? "text-yellow-600" : 
                "text-red-600"
              }`}>{state}</span>
            </div>
            <div className="flex gap-2">
              <Button onClick={start}>Conectar</Button>
              <Button variant="outline" onClick={fetchStatus}>Atualizar</Button>
            </div>
          </CardContent>
        </Card>

        {qr && (
          <Card>
            <CardHeader>
              <CardTitle>QR Code para Conexão</CardTitle>
            </CardHeader>
            <CardContent className="text-center">
              <img alt="QR Code WhatsApp" src={`data:image/png;base64,${qr}`} className="mx-auto mb-4" />
              <div className="text-sm text-muted-foreground">
                Escaneie o QR no WhatsApp e aguarde conectar…
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}