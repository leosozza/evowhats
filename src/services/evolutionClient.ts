import { supabase } from "@/integrations/supabase/client";

export interface CreateInstanceRequest {
  instanceName: string;
  number?: string;
}

export interface SendMessageRequest {
  instanceName: string;
  to: string;
  message: {
    text?: string;
    mediaUrl?: string;
    caption?: string;
  };
}

export interface EvolutionResponse {
  ok: boolean;
  error?: string;
  instanceId?: string;
  status?: string;
  qrCode?: string;
  data?: any;
}

class EvolutionClient {
  async createInstance(lineId: string): Promise<EvolutionResponse> {
    const { data, error } = await supabase.functions.invoke("evolution-connector-v2", {
      body: {
        action: "ensure_line_session",
        lineId,
      },
    });
    
    if (error) {
      return { ok: false, error: error.message || "Falha ao criar instância" };
    }
    
    return {
      ok: true,
      instanceId: data?.instance || `evo_line_${lineId}`,
      ...data,
    };
  }

  async getStatus(lineId: string): Promise<EvolutionResponse> {
    const { data, error } = await supabase.functions.invoke("evolution-connector-v2", {
      body: {
        action: "get_status_for_line",
        lineId,
      },
    });
    
    if (error) {
      return { ok: false, error: error.message || "Falha ao obter status" };
    }
    
    return {
      ok: true,
      status: data?.state || "unknown",
      ...data,
    };
  }

  async getQRCode(lineId: string): Promise<EvolutionResponse> {
    const { data, error } = await supabase.functions.invoke("evolution-connector-v2", {
      body: {
        action: "get_qr_for_line",
        lineId,
      },
    });
    
    if (error) {
      return { ok: false, error: error.message || "Falha ao obter QR code" };
    }
    
    return {
      ok: true,
      qrCode: data?.qr_base64 || data?.base64,
      ...data,
    };
  }

  async startSession(lineId: string, number?: string): Promise<EvolutionResponse> {
    const { data, error } = await supabase.functions.invoke("evolution-connector-v2", {
      body: {
        action: "start_session_for_line",
        lineId,
        number,
      },
    });
    
    if (error) {
      return { ok: false, error: error.message || "Falha ao iniciar sessão" };
    }
    
    return { ok: true, ...data };
  }

  async sendMessage(lineId: string, to: string, text: string): Promise<EvolutionResponse> {
    const { data, error } = await supabase.functions.invoke("evolution-connector-v2", {
      body: {
        action: "test_send",
        lineId,
        to,
        text,
      },
    });
    
    if (error) {
      return { ok: false, error: error.message || "Falha ao enviar mensagem" };
    }
    
    return { ok: true, ...data };
  }

  async bindLine(lineId: string, waInstanceId: string): Promise<EvolutionResponse> {
    const { data, error } = await supabase.functions.invoke("evolution-connector-v2", {
      body: {
        action: "bind_line",
        lineId,
        waInstanceId,
      },
    });
    
    if (error) {
      return { ok: false, error: error.message || "Falha ao vincular linha" };
    }
    
    return { ok: true, ...data };
  }

  async listInstances(): Promise<EvolutionResponse & { instances?: any[] }> {
    const { data, error } = await supabase.functions.invoke("evolution-connector-v2", {
      body: {
        action: "list_instances",
      },
    });
    
    if (error) {
      return { ok: false, error: error.message || "Falha ao listar instâncias" };
    }
    
    return { ok: true, instances: data?.instances || [], ...data };
  }

  async getDiagnostics(): Promise<EvolutionResponse> {
    const { data, error } = await supabase.functions.invoke("evolution-connector-v2", {
      body: {
        action: "diag",
      },
    });
    
    if (error) {
      return { ok: false, error: error.message || "Falha ao obter diagnósticos" };
    }
    
    return { ok: true, ...data };
  }
}

export const evolutionClient = new EvolutionClient();