
import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export type Line = { ID: string; NAME: string };

type UseLineEvolutionState = {
  loadingLine: string | null;
  statusByLine: Record<string, string>;
  qrByLine: Record<string, string | null>;
};

type UseLineEvolutionApi = {
  startSession: (line: Line) => Promise<void>;
  refreshStatus: (line: Line) => Promise<void>;
  startPolling: (line: Line, intervalMs?: number) => void;
  stopPolling: (lineId: string) => void;
  stopAll: () => void;
  testSend: (lineId: string, to: string) => Promise<any>;
} & UseLineEvolutionState;

function normalizeState(s?: string): string {
  const v = (s || "").toLowerCase();
  if (!v) return "unknown";
  return v;
}

function isConnected(state: string) {
  const s = normalizeState(state);
  return s.includes("connected") || s.includes("open");
}

function isPending(state: string) {
  const s = normalizeState(state);
  return s.includes("qr") || s.includes("pair") || s === "" || s === "unknown" || s.includes("connecting");
}

export function useLineEvolution(): UseLineEvolutionApi {
  const [loadingLine, setLoadingLine] = useState<string | null>(null);
  const [statusByLine, setStatusByLine] = useState<Record<string, string>>({});
  const [qrByLine, setQrByLine] = useState<Record<string, string | null>>({});
  const timersRef = useRef<Map<string, number>>(new Map());

  const getOrCreateSession = useCallback(async (line: Line) => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error("Usuário não autenticado");

    // Verificar se já existe sessão
    let { data: session } = await supabase
      .from('wa_sessions')
      .select('*')
      .eq('user_id', user.id)
      .eq('bitrix_line_id', line.ID)
      .maybeSingle();

    if (!session) {
      // Criar nova sessão com nome de instância determinístico
      const instanceName = `evo_line_${line.ID}`;
      
      const { data: newSession, error } = await supabase
        .from('wa_sessions')
        .insert({
          user_id: user.id,
          bitrix_line_id: line.ID,
          bitrix_line_name: line.NAME,
          evo_instance_id: instanceName,
          status: 'PENDING_QR'
        })
        .select()
        .single();

      if (error) throw error;
      session = newSession;
    }

    return session;
  }, []);

  const updateSessionInDB = useCallback(async (lineId: string, status: string, qrCode?: string | null) => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const updateData: any = {
      status,
      last_sync_at: new Date().toISOString()
    };

    if (qrCode !== undefined) {
      updateData.qr_code = qrCode;
    }

    if (status === 'CONNECTED') {
      updateData.connected_at = new Date().toISOString();
    }

    await supabase
      .from('wa_sessions')
      .update(updateData)
      .eq('user_id', user.id)
      .eq('bitrix_line_id', lineId);
  }, []);

  const startSession = useCallback(async (line: Line) => {
    setLoadingLine(line.ID);
    try {
      // 1. Garantir que existe sessão no DB
      const session = await getOrCreateSession(line);
      
      // 2. Chamar Evolution API para iniciar/conectar instância
      const { data: createResult, error: createError } = await supabase.functions.invoke("evolution-connector-v2", {
        body: { 
          action: "ensure_line_session", 
          bitrix_line_id: line.ID, 
          bitrix_line_name: line.NAME 
        },
      });

      if (createError) throw createError;
      if (createResult?.error) throw new Error(createResult.error);

      // 3. Iniciar sessão
      const { data: startResult, error: startError } = await supabase.functions.invoke("evolution-connector-v2", {
        body: { 
          action: "start_session_for_line", 
          lineId: line.ID
        },
      });

      if (startError) throw startError;
      if (startResult?.error) throw new Error(startResult.error);

      // 4. Buscar status inicial
      await refreshStatus(line);
      
    } finally {
      setLoadingLine(null);
    }
  }, [getOrCreateSession]);

  const refreshStatus = useCallback(async (line: Line) => {
    try {
      // Buscar status da Evolution API
      const { data: statusResult, error: statusError } = await supabase.functions.invoke("evolution-connector-v2", {
        body: { 
          action: "get_status_for_line", 
          lineId: line.ID
        },
      });

      if (statusError) throw statusError;
      if (statusResult?.error) throw new Error(statusResult.error);

      const stateRaw = normalizeState(statusResult?.data?.state || statusResult?.data?.status || "unknown");
      setStatusByLine(prev => ({ ...prev, [line.ID]: stateRaw }));

      if (isConnected(stateRaw)) {
        // Conectado: limpar QR
        setQrByLine(prev => ({ ...prev, [line.ID]: null }));
        await updateSessionInDB(line.ID, 'CONNECTED', null);
      } else if (isPending(stateRaw)) {
        // Pendente: buscar QR
        try {
          const { data: qrResult, error: qrError } = await supabase.functions.invoke("evolution-connector-v2", {
            body: { 
              action: "get_qr_for_line", 
              lineId: line.ID
            },
          });

          if (!qrError && qrResult?.data) {
            const base64 = qrResult.data.base64 || qrResult.data.qrcode || null;
            setQrByLine(prev => ({ ...prev, [line.ID]: base64 }));
            await updateSessionInDB(line.ID, 'PENDING_QR', base64);
          }
        } catch (qrErr) {
          console.warn("[useLineEvolution] QR fetch failed:", qrErr);
        }
      } else {
        // Outro status
        await updateSessionInDB(line.ID, stateRaw.toUpperCase());
      }

    } catch (error) {
      console.error("[useLineEvolution] Status refresh failed:", error);
      setStatusByLine(prev => ({ ...prev, [line.ID]: "error" }));
    }
  }, [updateSessionInDB]);

  const testSend = useCallback(async (lineId: string, to: string) => {
    return supabase.functions.invoke("evolution-connector-v2", {
      body: { action: "test_send", lineId, to, text: "Ping de teste" },
    });
  }, []);

  const startPolling = useCallback((line: Line, intervalMs: number = 5000) => {
    // Evitar múltiplos timers
    if (timersRef.current.has(line.ID)) return;

    const poll = async () => {
      try {
        await refreshStatus(line);
        // Se conectado, parar o polling
        const currentStatus = statusByLine[line.ID] || "";
        if (isConnected(currentStatus)) {
          stopPolling(line.ID);
        }
      } catch (error) {
        console.error("[useLineEvolution] Polling error:", error);
      }
    };

    // Poll inicial
    poll();
    
    // Configurar intervalo
    const id = window.setInterval(poll, intervalMs);
    timersRef.current.set(line.ID, id);
  }, [refreshStatus, statusByLine]);

  const stopPolling = useCallback((lineId: string) => {
    const id = timersRef.current.get(lineId);
    if (id) {
      clearInterval(id);
      timersRef.current.delete(lineId);
    }
  }, []);

  const stopAll = useCallback(() => {
    timersRef.current.forEach((id) => clearInterval(id));
    timersRef.current.clear();
  }, []);

  useEffect(() => {
    return () => {
      stopAll();
    };
  }, [stopAll]);

  return {
    loadingLine,
    statusByLine,
    qrByLine,
    startSession,
    refreshStatus,
    startPolling,
    stopPolling,
    stopAll,
    testSend,
  };
}
