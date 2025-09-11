import { supabase, SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } from "@/integrations/supabase/client";

export interface RegisterConnectorRequest {
  connector?: string;
  name?: string;
  chatGroup?: "Y" | "N";
  icon?: any;
  placement_handler?: string;
}

export interface PublishConnectorDataRequest {
  connector?: string;
  line: string;
  data: Record<string, any>;
}

export interface ActivateConnectorRequest {
  connector?: string;
  line: string;
  active?: boolean;
}

export interface CreateLineRequest {
  name: string;
}

export interface BindLineRequest {
  line_id: string;
  wa_instance_id: string;
}

class BitrixManager {
  async startOAuth(portalUrl: string) {
    const { data, error } = await supabase.functions.invoke("bitrix-oauth-start", {
      body: { portal_url: portalUrl },
    });
    if (error) throw new Error(error.message || "Falha ao iniciar OAuth");
    return data as { auth_url: string };
  }

  async bindEvents(tenantId?: string) {
    const { data, error } = await supabase.functions.invoke("bitrix-events-bind-v2", {
      body: { tenantId: tenantId || await this.getCurrentUserId() },
    });
    if (error) throw new Error(error.message || "Falha ao vincular eventos");
    return data as { success: boolean; message: string };
  }

  async registerConnector(params: RegisterConnectorRequest) {
    const { data, error } = await supabase.functions.invoke("bitrix-openlines-manager", {
      body: {
        action: "register_connector",
        ...params,
      },
    });
    if (error) throw new Error(error.message || "Falha ao registrar conector");
    return data;
  }

  async publishConnectorData(params: PublishConnectorDataRequest) {
    const { data, error } = await supabase.functions.invoke("bitrix-openlines-manager", {
      body: {
        action: "publish_connector_data",
        connector: params.connector,
        line: params.line,
        data: params.data,
      },
    });
    if (error) throw new Error(error.message || "Falha ao publicar dados do conector");
    return data;
  }

  async activateConnector(params: ActivateConnectorRequest) {
    const { data, error } = await supabase.functions.invoke("bitrix-openlines-manager", {
      body: {
        action: "activate_connector",
        connector: params.connector,
        line: params.line,
        active: params.active ?? true,
      },
    });
    if (error) throw new Error(error.message || "Falha ao ativar conector");
    return data;
  }

  async getStatus(connector = "evolution_whatsapp") {
    const { data, error } = await supabase.functions.invoke("bitrix-openlines-manager", {
      body: {
        action: "get_status",
        connector,
      },
    });
    if (error) throw new Error(error.message || "Falha ao obter status");
    return data;
  }

  async getLines() {
    const { data, error } = await supabase.functions.invoke("bitrix-openlines-manager", {
      body: { action: "list_lines" },
    });
    if (error) throw new Error(error.message || "Falha ao obter linhas");
    return data;
  }

  async createLine(params: CreateLineRequest) {
    const { data, error } = await supabase.functions.invoke("bitrix-openlines-manager", {
      body: {
        action: "create_line",
        ...params,
      },
    });
    if (error) throw new Error(error.message || "Falha ao criar linha");
    return data;
  }

  async bindLine(params: BindLineRequest) {
    const response = await fetch(
      `${await this.getFunctionBaseUrl()}/bitrix-openlines-manager/bind-line`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${(await supabase.auth.getSession()).data.session?.access_token}`,
          apikey: SUPABASE_PUBLISHABLE_KEY,
        },
        body: JSON.stringify(params),
      }
    );

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: "Unknown error" }));
      throw new Error(error.error || "Falha ao vincular linha");
    }

    return response.json();
  }

  async syncLeads() {
    const { data, error } = await supabase.functions.invoke("bitrix-sync", {});
    if (error) throw new Error(error.message || "Falha ao sincronizar leads");
    return data as { success: boolean; imported?: number };
  }

  private async getCurrentUserId(): Promise<string> {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error("Usuário não autenticado");
    return user.id;
  }

  private async getFunctionBaseUrl(): Promise<string> {
    return `${SUPABASE_URL}/functions/v1`;
  }
}

export const bitrixManager = new BitrixManager();