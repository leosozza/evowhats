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
  async createInstance(instanceName: string): Promise<EvolutionResponse> {
    const { data, error } = await supabase.functions.invoke("evolution-connector-v2", {
      body: {
        action: "instance.createOrAttach",
        instanceName,
      },
    });
    
    if (error) {
      return { ok: false, error: error.message || "Falha ao criar instância" };
    }
    
    return {
      ok: true,
      instanceId: data?.instanceId || instanceName,
      ...data,
    };
  }

  async getStatus(instanceName: string): Promise<EvolutionResponse> {
    const { data, error } = await supabase.functions.invoke("evolution-connector-v2", {
      body: {
        action: "instance.status",
        instanceName,
      },
    });
    
    if (error) {
      return { ok: false, error: error.message || "Falha ao obter status" };
    }
    
    return {
      ok: true,
      status: data?.status || data?.state || "unknown",
      ...data,
    };
  }

  async getQRCode(instanceName: string): Promise<EvolutionResponse> {
    const { data, error } = await supabase.functions.invoke("evolution-connector-v2", {
      body: {
        action: "instance.qr",
        instanceName,
      },
    });
    
    if (error) {
      return { ok: false, error: error.message || "Falha ao obter QR code" };
    }
    
    return {
      ok: true,
      qrCode: data?.qrCode || data?.qr,
      ...data,
    };
  }

  async logout(instanceName: string): Promise<EvolutionResponse> {
    const { data, error } = await supabase.functions.invoke("evolution-connector-v2", {
      body: {
        action: "instance.logout",
        instanceName,
      },
    });
    
    if (error) {
      return { ok: false, error: error.message || "Falha ao desconectar" };
    }
    
    return { ok: true, ...data };
  }

  async sendMessage(instanceName: string, to: string, text: string): Promise<EvolutionResponse> {
    const { data, error } = await supabase.functions.invoke("evolution-connector-v2", {
      body: {
        action: "send_message",
        instanceName,
        to,
        message: { text },
      },
    });
    
    if (error) {
      return { ok: false, error: error.message || "Falha ao enviar mensagem" };
    }
    
    return { ok: true, ...data };
  }

  async sendMediaMessage(instanceName: string, to: string, mediaUrl: string, caption?: string): Promise<EvolutionResponse> {
    const { data, error } = await supabase.functions.invoke("evolution-connector-v2", {
      body: {
        action: "send_message",
        instanceName,
        to,
        message: { mediaUrl, caption },
      },
    });
    
    if (error) {
      return { ok: false, error: error.message || "Falha ao enviar mídia" };
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