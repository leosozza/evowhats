import { supabase } from "@/integrations/supabase/client";
import { API_CONFIG } from "@/config/api";
import { ENV } from "@/config/env";
import type { EvoResponse, EvoConnectData, EvoQrData, EvoDiagnosticsData } from "@/types/evolution";

type Body = Record<string, any>;

function normalize<T = any>(raw: any): EvoResponse<T> {
  if (raw && typeof raw === "object") {
    const hasSuccess = Object.prototype.hasOwnProperty.call(raw, "success");
    const hasOk      = Object.prototype.hasOwnProperty.call(raw, "ok");
    const success = hasSuccess ? !!(raw as any).success : true;
    const ok      = hasOk ? !!(raw as any).ok : success;
    const code    = (raw as any).code;
    const error   = (raw as any).error;
    const message = (raw as any).message;
    const data    = Object.prototype.hasOwnProperty.call(raw, "data")
      ? (raw as any).data
      : raw;
    return { success, ok, code, error, message, data };
  }
  return { success: true, ok: true, data: raw as T };
}

async function invoke<T = any>(action: string, body: Body): Promise<EvoResponse<T>> {
  console.log("[evolutionClient] Invoking", action, "with body:", body);
  const { data, error } = await supabase.functions.invoke("evolution-connector-v2", {
    body: { action, ...body },
  });
  if (error) {
    console.warn("[evolutionClient] Invoke transport error:", error);
    return { success: false, ok: false, code: "INVOKE_TRANSPORT_ERROR", error: error.message };
  }
  console.log("[evolutionClient] Invoke raw:", data);
  return normalize<T>(data);
}

async function fetchDirect<T = any>(action: string, body: Body): Promise<EvoResponse<T>> {
  const { data: s } = await supabase.auth.getSession();
  const token = s?.session?.access_token;
  if (!ENV.FUNCTIONS_BASE_URL) {
    return { success:false, ok:false, code:"FUNCTIONS_URL_MISSING", error:"Configure VITE_FUNCTIONS_BASE_URL." };
  }
  
  try {
    const res = await fetch(`${ENV.FUNCTIONS_BASE_URL}/evolution-connector-v2`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "apikey": ENV.SUPABASE_PUBLISHABLE_KEY,
        "Authorization": `Bearer ${token ?? ENV.SUPABASE_PUBLISHABLE_KEY}`,
      },
      body: JSON.stringify({ action, ...body }),
    });
    let json: any = {};
    try { json = await res.json(); } catch {}
    if (!res.ok) console.warn("[evolutionClient] fetchDirect http", res.status, json);
    console.log("[evolutionClient] fetchDirect raw:", json);
    return normalize<T>(json);
  } catch (error: any) {
    console.error("[evolutionClient] fetchDirect failed:", error);
    return { success: false, ok: false, code: "FETCH_DIRECT_ERROR", error: error.message };
  }
}

async function post<T = any>(action: string, body: Body): Promise<EvoResponse<T>> {
  try {
    const r = await invoke<T>(action, body);
    
    // Se invoke retornou dados válidos (mesmo com success: false), não faz fallback
    // Fallback só para erros de transporte/CORS
    if (r && typeof r === 'object' && ('success' in r || 'ok' in r || 'data' in r)) {
      // Se é erro de transporte específico, tenta fallback
      if (r.code === "INVOKE_TRANSPORT_ERROR") {
        console.warn("[evolutionClient] Transport error, trying fallback:", action);
        return await fetchDirect<T>(action, body);
      }
      return r; // Retorna resposta válida do backend (mesmo que seja erro)
    }
    
    console.warn("[evolutionClient] Invalid response format, trying fallback:", r);
    return await fetchDirect<T>(action, body);
  } catch (error: any) {
    console.error("[evolutionClient] Unexpected error:", error);
    return { success: false, ok: false, code: "CLIENT_ERROR", error: error.message };
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
    return post("test_send", { lineId, to, text });
  },
  diag() {
    return post("diag_evolution_full", {});
  },
  getDiagnostics() {
    return post<EvoDiagnosticsData>("diag_evolution_full", {});
  },
  listInstances() {
    return post<EvoDiagnosticsData>("diag_instances", {}); // Corrigido para usar diag_instances
  },
  diagInstances() {
    return post("diag_instances", {});
  },
  diagDiscovery() {
    return post("diag_discovery", {});
  },
  resetDiscovery() {
    return post("diag_reset_discovery", {});
  },
  // Método genérico para calls customizados
  post: post,
};