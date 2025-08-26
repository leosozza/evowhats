
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
  return s.includes("open") || s.includes("connected");
}

function isPending(state: string) {
  const s = normalizeState(state);
  return s.includes("connecting") || s.includes("qr") || s.includes("pair") || s === "" || s === "unknown";
}

export function useLineEvolution(): UseLineEvolutionApi {
  const [loadingLine, setLoadingLine] = useState<string | null>(null);
  const [statusByLine, setStatusByLine] = useState<Record<string, string>>({});
  const [qrByLine, setQrByLine] = useState<Record<string, string | null>>({});
  const timersRef = useRef<Map<string, number>>(new Map());

  const startSession = useCallback(async (line: Line) => {
    setLoadingLine(line.ID);
    try {
      console.log(`[useLineEvolution] Starting session for line ${line.ID}`);
      
      // 1. Ensure line session exists
      const { data: ensureResult, error: ensureError } = await supabase.functions.invoke("evolution-connector-v2", {
        body: { 
          action: "ensure_line_session", 
          bitrix_line_id: line.ID, 
          bitrix_line_name: line.NAME 
        },
      });

      if (ensureError) throw ensureError;
      if (!ensureResult?.ok) throw new Error(ensureResult?.error || "Failed to ensure session");

      // 2. Start session
      const { data: startResult, error: startError } = await supabase.functions.invoke("evolution-connector-v2", {
        body: { 
          action: "start_session_for_line", 
          lineId: line.ID
        },
      });

      if (startError) throw startError;
      if (!startResult?.ok) throw new Error(startResult?.error || "Failed to start session");

      // 3. Initial status check
      await refreshStatus(line);
      
    } finally {
      setLoadingLine(null);
    }
  }, []);

  const refreshStatus = useCallback(async (line: Line) => {
    try {
      console.log(`[useLineEvolution] Refreshing status for line ${line.ID}`);
      
      // Get status
      const { data: statusResult, error: statusError } = await supabase.functions.invoke("evolution-connector-v2", {
        body: { 
          action: "get_status_for_line", 
          lineId: line.ID
        },
      });

      if (statusError) throw statusError;
      if (!statusResult?.ok) throw new Error(statusResult?.error || "Failed to get status");

      const state = normalizeState(statusResult?.state || statusResult?.data?.state || "unknown");
      setStatusByLine(prev => ({ ...prev, [line.ID]: state }));

      if (isConnected(state)) {
        // Connected: clear QR
        setQrByLine(prev => ({ ...prev, [line.ID]: null }));
        console.log(`[useLineEvolution] Line ${line.ID} connected, clearing QR`);
      } else if (isPending(state)) {
        // Pending: get QR
        try {
          const { data: qrResult, error: qrError } = await supabase.functions.invoke("evolution-connector-v2", {
            body: { 
              action: "get_qr_for_line", 
              lineId: line.ID
            },
          });

          if (!qrError && qrResult?.ok && qrResult?.qr_base64) {
            setQrByLine(prev => ({ ...prev, [line.ID]: qrResult.qr_base64 }));
            console.log(`[useLineEvolution] QR updated for line ${line.ID}`);
          } else if (qrResult?.pairing_code) {
            // If pairing code is available, show it as text instead of QR
            console.log(`[useLineEvolution] Pairing code available for line ${line.ID}: ${qrResult.pairing_code}`);
          }
        } catch (qrErr) {
          console.warn("[useLineEvolution] QR fetch failed:", qrErr);
        }
      }

    } catch (error) {
      console.error("[useLineEvolution] Status refresh failed:", error);
      setStatusByLine(prev => ({ ...prev, [line.ID]: "error" }));
    }
  }, []);

  const testSend = useCallback(async (lineId: string, to: string) => {
    console.log(`[useLineEvolution] Testing send to ${to} via line ${lineId}`);
    
    const { data, error } = await supabase.functions.invoke("evolution-connector-v2", {
      body: { action: "test_send", lineId, to, text: "Ping de teste" },
    });
    
    if (error) throw error;
    if (!data?.ok) throw new Error(data?.error || "Test send failed");
    
    return data;
  }, []);

  const startPolling = useCallback((line: Line, intervalMs: number = 4000) => {
    // Avoid multiple timers
    if (timersRef.current.has(line.ID)) return;

    console.log(`[useLineEvolution] Starting polling for line ${line.ID}`);

    const poll = async () => {
      try {
        await refreshStatus(line);
        // If connected, stop polling
        const currentStatus = statusByLine[line.ID] || "";
        if (isConnected(currentStatus)) {
          console.log(`[useLineEvolution] Line ${line.ID} connected, stopping polling`);
          stopPolling(line.ID);
        }
      } catch (error) {
        console.error("[useLineEvolution] Polling error:", error);
      }
    };

    // Initial poll
    poll();
    
    // Set interval
    const id = window.setInterval(poll, intervalMs);
    timersRef.current.set(line.ID, id);
  }, [refreshStatus, statusByLine]);

  const stopPolling = useCallback((lineId: string) => {
    const id = timersRef.current.get(lineId);
    if (id) {
      console.log(`[useLineEvolution] Stopping polling for line ${lineId}`);
      clearInterval(id);
      timersRef.current.delete(lineId);
    }
  }, []);

  const stopAll = useCallback(() => {
    console.log("[useLineEvolution] Stopping all polling");
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
