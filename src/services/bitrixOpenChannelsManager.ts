import { supabase } from "@/integrations/supabase/client";

export interface ConnectorStatus {
  registered: boolean;
  published: boolean;
  tilePlaced: boolean;
  lines: any[];
  activeConnections: string[];
}

export async function getOpenChannelsStatus(): Promise<ConnectorStatus> {
  const { data, error } = await supabase.functions.invoke("bitrix-openlines-manager", {
    body: { action: "get_status" },
  });
  if (error) throw new Error(error.message || "Falha ao verificar status");
  return data?.status || data?.result;
}

export async function listOpenChannelsLines() {
  const { data, error } = await supabase.functions.invoke("bitrix-openlines", {
    body: { action: "list_lines" },
  });
  if (error) throw new Error(error.message || "Falha ao listar linhas");
  return data?.lines || data?.result || [];
}

export async function registerConnector(params: {
  connector: string;
  name: string;
  icon: string;
  chatGroup?: string;
}) {
  const { data, error } = await supabase.functions.invoke("bitrix-openlines-manager", {
    body: {
      action: "register_connector",
      ...params,
    },
  });
  if (error) throw new Error(error.message || "Falha ao registrar conector");
  return data;
}

export async function publishConnectorData(params: {
  connector: string;
  data: any;
}) {
  const { data, error } = await supabase.functions.invoke("bitrix-openlines-manager", {
    body: {
      action: "publish_connector_data",
      ...params,
    },
  });
  if (error) throw new Error(error.message || "Falha ao publicar dados do conector");
  return data;
}

export async function addToContactCenter(params: {
  placement: string;
  handlerUrl: string;
}) {
  const { data, error } = await supabase.functions.invoke("bitrix-openlines-manager", {
    body: {
      action: "add_to_contact_center",
      ...params,
    },
  });
  if (error) throw new Error(error.message || "Falha ao adicionar ao Contact Center");
  return data;
}

export async function createLine(name: string) {
  const { data, error } = await supabase.functions.invoke("bitrix-openlines-manager", {
    body: {
      action: "create_line",
      name,
    },
  });
  if (error) throw new Error(error.message || "Falha ao criar linha");
  return data;
}

export async function activateConnector(params: {
  connector: string;
  line: string;
  active: boolean;
}) {
  const { data, error } = await supabase.functions.invoke("bitrix-openlines-manager", {
    body: {
      action: "activate_connector",
      ...params,
    },
  });
  if (error) throw new Error(error.message || "Falha ao ativar conector");
  return data;
}
