import { API_CONFIG } from "@/config/api";
import { supabase } from "@/integrations/supabase/client";
import { ENV } from "@/config/env";
import type { EvoResponse, EvoConnectData, EvoQrData, EvoDiagnosticsData } from "@/types/evolution";

type Body = Record<string, any>;

// Normaliza respostas: se não vier "data", embrulha o resto em data
function normalize<T = any>(raw: any): EvoResponse<T> {
  if (raw && typeof raw === "object" && "data" in raw) return raw as EvoResponse<T>;
  const { success = true, ok = true, error, message, code, ...rest } = raw || {};
  return { success: !!success, ok: !!ok, error, message, code, data: rest as T };
}

// 1) Preferir supabase.functions.invoke (leva JWT automaticamente)
async function invoke<T = any>(action: string, body: Body): Promise<EvoResponse<T>> {
  console.log(`[evolutionClient] Invoking ${action} with body:`, body);
  const { data, error } = await supabase.functions.invoke("evolution-connector-v2", {
    body: { action, ...body },
  });
  
  if (error) {
    console.error(`[evolutionClient] Invoke error for ${action}:`, error);
    return { success: false, ok: false, error: error.message, code: error.name };
  }
  
  console.log(`[evolutionClient] Invoke success for ${action}:`, data);
  return normalize<T>(data);
}

// 2) Fallback (se precisar atingir URL direta), incluindo Authorization e apikey
async function fetchDirect<T = any>(action: string, body: Body): Promise<EvoResponse<T>> {
  console.log(`[evolutionClient] Using fetchDirect for ${action}`);
  const { data: s } = await supabase.auth.getSession();
  const token = s?.session?.access_token;
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "apikey": ENV.SUPABASE_PUBLISHABLE_KEY,
    "Authorization": `Bearer ${token ?? ENV.SUPABASE_PUBLISHABLE_KEY}`,
  };
  
  console.log(`[evolutionClient] Headers for ${action}:`, { ...headers, Authorization: token ? "Bearer [TOKEN]" : "Bearer [ANON_KEY]" });
  
  const res = await fetch(`${API_CONFIG.baseUrl}/evolution-connector-v2`, {
    method: "POST",
    headers,
    body: JSON.stringify({ action, ...body }),
  });
  
  console.log(`[evolutionClient] Response status for ${action}:`, res.status);
  const json = await res.json().catch(() => ({}));
  console.log(`[evolutionClient] Response data for ${action}:`, json);
  return normalize<T>(json);
}

async function post<T = any>(action: string, body: Body): Promise<EvoResponse<T>> {
  try {
    // tente via invoke (JWT do usuário). Se falhar por CORS local, usa fallback:
    return await invoke<T>(action, body);
  } catch (error) {
    console.warn(`[evolutionClient] Invoke failed for ${action}, trying fetchDirect:`, error);
    return await fetchDirect<T>(action, body);
  }
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