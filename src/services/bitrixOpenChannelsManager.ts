
import { supabase } from "@/integrations/supabase/client";

const FUNCTIONS_BASE = "https://twqcybbjyhcokcrdfgkk.functions.supabase.co";

export interface ConnectorStatus {
  registered: boolean;
  published: boolean;
  tilePlaced: boolean;
  lines: any[];
  activeConnections: string[];
}

export async function getOpenChannelsStatus(): Promise<ConnectorStatus> {
  const session = await supabase.auth.getSession();
  const accessToken = session.data.session?.access_token;
  if (!accessToken) throw new Error("Você precisa estar autenticado.");

  const resp = await fetch(`${FUNCTIONS_BASE}/bitrix-openlines-manager`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${accessToken}`,
    },
    body: JSON.stringify({ action: "get_status" }),
  });

  if (!resp.ok) {
    const err = await resp.json().catch(() => ({}));
    throw new Error(err?.error || "Falha ao verificar status");
  }

  const data = await resp.json();
  return data.result;
}

export async function registerConnector(params: {
  connector: string;
  name: string;
  icon: string;
  chatGroup?: string;
}) {
  const session = await supabase.auth.getSession();
  const accessToken = session.data.session?.access_token;
  if (!accessToken) throw new Error("Você precisa estar autenticado.");

  const resp = await fetch(`${FUNCTIONS_BASE}/bitrix-openlines-manager`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${accessToken}`,
    },
    body: JSON.stringify({
      action: "register_connector",
      ...params,
    }),
  });

  if (!resp.ok) {
    const err = await resp.json().catch(() => ({}));
    throw new Error(err?.error || "Falha ao registrar conector");
  }
  return resp.json();
}

export async function publishConnectorData(params: {
  connector: string;
  data: any;
}) {
  const session = await supabase.auth.getSession();
  const accessToken = session.data.session?.access_token;
  if (!accessToken) throw new Error("Você precisa estar autenticado.");

  const resp = await fetch(`${FUNCTIONS_BASE}/bitrix-openlines-manager`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${accessToken}`,
    },
    body: JSON.stringify({
      action: "publish_connector_data",
      ...params,
    }),
  });

  if (!resp.ok) {
    const err = await resp.json().catch(() => ({}));
    throw new Error(err?.error || "Falha ao publicar dados do conector");
  }
  return resp.json();
}

export async function addToContactCenter(params: {
  placement: string;
  handlerUrl: string;
}) {
  const session = await supabase.auth.getSession();
  const accessToken = session.data.session?.access_token;
  if (!accessToken) throw new Error("Você precisa estar autenticado.");

  const resp = await fetch(`${FUNCTIONS_BASE}/bitrix-openlines-manager`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${accessToken}`,
    },
    body: JSON.stringify({
      action: "add_to_contact_center",
      ...params,
    }),
  });

  if (!resp.ok) {
    const err = await resp.json().catch(() => ({}));
    throw new Error(err?.error || "Falha ao adicionar ao Contact Center");
  }
  return resp.json();
}

export async function createLine(name: string) {
  const session = await supabase.auth.getSession();
  const accessToken = session.data.session?.access_token;
  if (!accessToken) throw new Error("Você precisa estar autenticado.");

  const resp = await fetch(`${FUNCTIONS_BASE}/bitrix-openlines-manager`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${accessToken}`,
    },
    body: JSON.stringify({
      action: "create_line",
      name,
    }),
  });

  if (!resp.ok) {
    const err = await resp.json().catch(() => ({}));
    throw new Error(err?.error || "Falha ao criar linha");
  }
  return resp.json();
}

export async function activateConnector(params: {
  connector: string;
  line: string;
  active: boolean;
}) {
  const session = await supabase.auth.getSession();
  const accessToken = session.data.session?.access_token;
  if (!accessToken) throw new Error("Você precisa estar autenticado.");

  const resp = await fetch(`${FUNCTIONS_BASE}/bitrix-openlines-manager`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${accessToken}`,
    },
    body: JSON.stringify({
      action: "activate_connector",
      ...params,
    }),
  });

  if (!resp.ok) {
    const err = await resp.json().catch(() => ({}));
    throw new Error(err?.error || "Falha ao ativar conector");
  }
  return resp.json();
}
