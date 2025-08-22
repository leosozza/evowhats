
import { useCallback, useEffect, useRef, useState } from "react";
import { ensureLineSession, getQrForLine, getStatusForLine, startSessionForLine } from "@/services/evolutionConnector";
import { updateSessionStatus } from "@/services/evolutionInstanceManager";

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

  const persistStatus = useCallback(async (lineId: string, stateRaw: string, qrBase64?: string | null) => {
    const connected = isConnected(stateRaw);
    const pending = isPending(stateRaw);

    const statusColumn = connected ? "CONNECTED" : pending ? "PENDING_QR" : String(stateRaw || "UNKNOWN").toUpperCase();
    await updateSessionStatus(lineId, statusColumn, qrBase64 || undefined);
  }, []);

  const fetchQrIfNeeded = useCallback(async (line: Line, currentState: string) => {
    if (!isPending(currentState)) {
      // Clear local QR if not pending
      setQrByLine(prev => {
        const next = { ...prev };
        next[line.ID] = null;
        return next;
      });
      return;
    }

    const qrResp = await getQrForLine({ bitrix_line_id: line.ID, bitrix_line_name: line.NAME });
    const base64 = qrResp?.data?.base64 || qrResp?.data?.qrcode || null;

    setQrByLine(prev => ({ ...prev, [line.ID]: base64 }));
    await persistStatus(line.ID, currentState, base64);
  }, [persistStatus]);

  const refreshStatus = useCallback(async (line: Line) => {
    setLoadingLine(line.ID);
    try {
      const st = await getStatusForLine({ bitrix_line_id: line.ID, bitrix_line_name: line.NAME });
      const stateRaw = normalizeState(st?.data?.state || st?.data?.status || "unknown");

      setStatusByLine(prev => ({ ...prev, [line.ID]: stateRaw }));

      if (isConnected(stateRaw)) {
        // Conectado: limpar QR e persistir status CONNECTED
        setQrByLine(prev => ({ ...prev, [line.ID]: null }));
        await persistStatus(line.ID, stateRaw, null);
      } else {
        // Pendente/desconectado: tentar obter QR
        await fetchQrIfNeeded(line, stateRaw);
      }
    } finally {
      setLoadingLine(null);
    }
  }, [fetchQrIfNeeded, persistStatus]);

  const startSession = useCallback(async (line: Line) => {
    setLoadingLine(line.ID);
    try {
      await ensureLineSession({ bitrix_line_id: line.ID, bitrix_line_name: line.NAME });
      await startSessionForLine({ bitrix_line_id: line.ID, bitrix_line_name: line.NAME });
      // Após iniciar, já força um refresh que também traz o QR quando necessário
      await refreshStatus(line);
    } finally {
      setLoadingLine(null);
    }
  }, [refreshStatus]);

  const startPolling = useCallback((line: Line, intervalMs: number = 5000) => {
    // Evitar múltiplos timers
    if (timersRef.current.has(line.ID)) return;

    // Faz um refresh imediato e inicia o intervalo
    refreshStatus(line);
    const id = window.setInterval(() => {
      refreshStatus(line);
    }, intervalMs);

    timersRef.current.set(line.ID, id);
  }, [refreshStatus]);

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
      // Cleanup ao desmontar
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
  };
}
