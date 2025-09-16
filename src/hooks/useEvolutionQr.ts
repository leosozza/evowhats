import { useState, useRef } from "react";
import type { EvoResponse, EvoQrData, EvoStatus } from "@/types/evolution";

const POLL_MS = Number(import.meta.env.VITE_EVOLUTION_QR_POLL_MS ?? 1500);
const POLL_TIMEOUT = Number(import.meta.env.VITE_EVOLUTION_QR_POLL_TIMEOUT_MS ?? 120000);

export function useEvolutionQr(
  apiInvoke: (action: string, payload: any) => Promise<EvoResponse<EvoQrData | null>>,
  instanceName: string
) {
  const [qr, setQr] = useState<string | null>(null);
  const [status, setStatus] = useState<EvoStatus | null>(null);
  const [running, setRunning] = useState(false);
  const stopRef = useRef(false);

  const start = async () => {
    setRunning(true);
    stopRef.current = false;
    setQr(null);
    const started = Date.now();

    while (!stopRef.current && Date.now() - started < POLL_TIMEOUT) {
      try {
        const r = await apiInvoke("get_qr", { instanceName });
        const data = r?.data ?? null;
        if (data?.qr_base64) {
          setQr(data.qr_base64);
          setStatus(data.status ?? null);
          break;
        }
        setStatus(data?.status ?? null);
        const s = (data?.status?.state || data?.status?.status || "").toString().toLowerCase();
        if (["connected", "open", "ready", "online"].includes(s)) break;
      } catch (e) {
        console.warn("QR polling error:", e);
      }
      await new Promise(res => setTimeout(res, POLL_MS));
    }
    setRunning(false);
  };

  const stop = () => { stopRef.current = true; setRunning(false); };

  return { qr, status, running, start, stop };
}