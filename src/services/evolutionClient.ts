import { API_CONFIG } from "@/config/api";
import type { EvoResponse, EvoConnectData, EvoQrData, EvoDiagnosticsData } from "@/types/evolution";

type Body = Record<string, any>;

async function postRaw(body: Body): Promise<any> {
  const res = await fetch(`${API_CONFIG.baseUrl}/evolution-connector-v2`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  try { return await res.json(); } catch { return {}; }
}

/** Normaliza respostas: se vierem campos no topo (success/ok/qr_base64 etc.),
 * embrulha em { success, ok, data: { ...rest } } para padronizar o consumo. */
function normalize<T = any>(raw: any): EvoResponse<T> {
  if (raw && typeof raw === "object" && "data" in raw) return raw as EvoResponse<T>;
  const { success = true, ok = true, error, message, code, ...rest } = raw || {};
  return { success: !!success, ok: !!ok, error, message, code, data: rest as T };
}

async function post<T = any>(action: string, body: Body): Promise<EvoResponse<T>> {
  const json = await postRaw({ action, ...body });
  return normalize<T>(json);
}

export const evolutionClient = {
  connectWhatsapp(lineId: string | number, instanceName?: string) {
    return post<EvoConnectData>("connect_whatsapp", { lineId, instanceName });
  },
  getQr(lineId: string | number, instanceName?: string) {
    return post<EvoQrData>("get_qr", { lineId, instanceName });
  },
  bindOpenLine(lineId: string | number, instanceName: string) {
    return post("bind_openline", { lineId, instanceName });
  },
  testSend(lineId: string | number, to: string, text: string) {
    return post("test_send_message", { lineId, to, text });
  },
  diag() {
    return post("diag_evolution", {});
  },
  getDiagnostics() {
    return post<EvoDiagnosticsData>("diag_evolution", {});
  },
  listInstances() {
    return post<EvoDiagnosticsData>("diag_evolution", {});
  },
};