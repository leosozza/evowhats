import { supabase } from "@/integrations/supabase/client";
import { API_CONFIG } from "@/config/api";
import { ENV } from "@/config/env";
import type { EvoResponse, EvoConnectData, EvoQrData, EvoDiagnosticsData } from "@/types/evolution";

type Body = Record<string, any>;

function normalize<T = any>(raw: any): EvoResponse<T> {
  if (raw && typeof raw === "object" && "data" in raw) return raw as EvoResponse<T>;
  const { success = true, ok = true, error, message, code, ...rest } = raw || {};
  return { success: !!success, ok: !!ok, error, message, code, data: rest as T };
}

async function invoke<T = any>(action: string, body: Body): Promise<EvoResponse<T>> {
  const { data, error } = await supabase.functions.invoke("evolution-connector-v2", {
    body: { action, ...body },
  });
  if (error) {
    console.error("[evolutionClient] invoke error:", error);
    return { success: false, ok: false, error: error.message, code: error.name };
  }
  return normalize<T>(data);
}

async function fetchDirect<T = any>(action: string, body: Body): Promise<EvoResponse<T>> {
  const { data: s } = await supabase.auth.getSession();
  const token = s?.session?.access_token;
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "apikey": ENV.SUPABASE_PUBLISHABLE_KEY,
    "Authorization": token ? `Bearer ${token}` : `Bearer ${ENV.SUPABASE_PUBLISHABLE_KEY}`,
  };
  const res = await fetch(`${API_CONFIG.baseUrl}/evolution-connector-v2`, {
    method: "POST",
    headers,
    body: JSON.stringify({ action, ...body }),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) console.error("[evolutionClient] fetchDirect http", res.status, json);
  return normalize<T>(json);
}

async function post<T = any>(action: string, body: Body): Promise<EvoResponse<T>> {
  const r = await invoke<T>(action, body);
  if (!r.success) {
    console.warn("[evolutionClient] invoke failed, fallback to fetchDirect:", action);
    return await fetchDirect<T>(action, body);
  }
  return r;
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
  // nome padronizado: usar "test_send"
  testSend(lineId: string | number, to: string, text: string) {
    return post("test_send", { lineId, to, text });
  },
  diag() {
    return post("diag_evolution_full", {});
  },
  getDiagnostics() {
    return post<EvoDiagnosticsData>("diag_evolution_full", {});
  },
  listInstances() {
    return post<EvoDiagnosticsData>("diag_evolution_full", {});
  },
};