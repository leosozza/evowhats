import { useEffect, useRef, useState } from "react";

const POLL_MS = Number(import.meta.env.VITE_EVOLUTION_QR_POLL_MS ?? 1500);
const POLL_TIMEOUT = Number(import.meta.env.VITE_EVOLUTION_QR_POLL_TIMEOUT_MS ?? 120000);

export function useEvolutionQr(apiInvoke: (action: string, payload: any) => Promise<any>, instanceName: string) {
  const [qr, setQr] = useState<string | null>(null);
  const [status, setStatus] = useState<any>(null);
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
        if (r?.qr_base64) { 
          setQr(r.qr_base64); 
          setStatus(r.status); 
          break; 
        }
        setStatus(r?.status ?? null);
        const state = (r?.status?.state || r?.status?.status || "").toString().toLowerCase();
        if (["connected", "open", "ready", "online"].includes(state)) break;
      } catch (error) {
        console.error("QR polling error:", error);
      }
      await new Promise(res => setTimeout(res, POLL_MS));
    }
    setRunning(false);
  };

  const stop = () => { 
    stopRef.current = true; 
    setRunning(false); 
  };

  return { qr, status, running, start, stop };
}