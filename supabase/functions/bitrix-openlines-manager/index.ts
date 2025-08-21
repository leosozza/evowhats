import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// Substitui png 1x1 por SVG data URI conforme documentação Bitrix24
const MINIMAL_ICON_SVG_DATA =
  "data:image/svg+xml;charset=US-ASCII,%3Csvg%20version%3D%221.1%22%20id%3D%22Layer_1%22%20xmlns%3D%22http%3A//www.w3.org/2000/svg%22%20x%3D%220px%22%20y%3D%220px%22%0A%09%20viewBox%3D%220%200%2070%2071%22%20style%3D%22enable-background%3Anew%200%200%2070%2071%3B%22%20xml%3Aspace%3D%22preserve%22%3E%0A%3Cpath%20fill%3D%22%230C99BA%22%20class%3D%22st0%22%20d%3D%22M34.7%2C64c-11.6%2C0-22-7.1-26.3-17.8C4%2C35.4%2C6.4%2C23%2C14.5%2C14.7c8.1-8.2%2C20.4-10.7%2C31-6.2%0A%09c12.5%2C5.4%2C19.6%2C18.8%2C17%2C32.2C60%2C54%2C48.3%2C63.8%2C34.7%2C64L34.7%2C64z%20M27.8%2C29c0.8-0.9%2C0.8-2.3%2C0-3.2l-1-1.2h19.3c1-0.1%2C1.7-0.9%2C1.7-1.8%0A%09v-0.9c0-1-0.7-1.8-1.7-1.8H26.8l1.1-1.2c0.8-0.9%2C0.8-2.3%2C0-3.2c-0.4-0.4-0.9-0.7-1.5-0.7s-1.1%2C0.2-1.5%2C0.7l-4.6%2C5.1%0A%09c-0.8%2C0.9-0.8%2C2.3%2C0%2C3.2l4.6%2C5.1c0.4%2C0.4%2C0.9%2C0.7%2C1.5%2C0.7C26.9%2C29.6%2C27.4%2C29.4%2C27.8%2C29L27.8%2C29z%20M44%2C41c-0.5-0.6-1.3-0.8-2-0.6%0A%09c-0.7%2C0.2-1.3%2C0.9-1.5%2C1.6c-0.2%2C0.8%2C0%2C1.6%2C0.5%2C2.2l1%2C1.2H22.8c-1%2C0.1-1.7%2C0.9-1.7%2C1.8v0.9c0%2C1%2C0.7%2C1.8%2C1.7%2C1.8h19.3l-1%2C1.2%0A%09c-0.5%2C0.6-0.7%2C1.4-0.5%2C2.2c0.2%2C0.8%2C0.7%2C1.4%2C1.5%2C1.6c0.7%2C0.2%2C1.5%2C0%2C2-0.6l4.6-5.1c0.8-0.9%2C0.8-2.3%2C0-3.2L44%2C41z%20M23.5%2C32.8%0A%09c-1%2C0.1-1.7%2C0.9-1.7%2C1.8v0.9c0%2C1%2C0.7%2C1.8%2C1.7%2C1.8h23.4c1-0.1%2C1.7-0.9%2C1.7-1.8v-0.9c0-1-0.7-1.8-1.7-1.9L23.5%2C32.8L23.5%2C32.8z%22/%3E%0A%3C/svg%3E%0A";

// Handler padrão para registrar no conector (pode ser a mesma URL usada para o tile)
const DEFAULT_PLACEMENT_HANDLER = "https://evowhats-61.lovable.app";

// Helper: achatar objetos/arrays em FormData usando colchetes (ex.: ICON[DATA_IMAGE])
function appendForm(form: FormData, key: string, value: any) {
  if (value === null || value === undefined) return;
  if (Array.isArray(value)) {
    value.forEach((v, i) => appendForm(form, `${key}[${i}]`, v));
  } else if (typeof value === "object") {
    Object.entries(value).forEach(([k, v]) => appendForm(form, `${key}[${k}]`, v as any));
  } else {
    form.append(key, String(value));
  }
}

async function callBitrixAPI(
  portalUrl: string,
  accessToken: string,
  method: string,
  params: Record<string, any> = {}
) {
  const url = `${portalUrl.replace(/\/$/, "")}/rest/${method}.json`;
  
  console.log(`[bitrix-openlines-manager] Calling: ${method} with params:`, Object.keys(params));

  const formData = new FormData();
  formData.append("auth", accessToken);

  // Usar appendForm para preservar estrutura ICON[...], FIELDS[...], etc.
  for (const [key, value] of Object.entries(params)) {
    appendForm(formData, key, value);
  }

  const response = await fetch(url, {
    method: "POST",
    body: formData,
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error(`[bitrix-openlines-manager] HTTP error ${response.status}:`, errorText);
    throw new Error(`HTTP ${response.status}: ${errorText}`);
  }

  const data = await response.json();
  
  if (data.error) {
    console.error(`[bitrix-openlines-manager] Bitrix API error:`, data.error, data.error_description);
    throw new Error(`Erro Bitrix24: ${data.error_description || data.error}`);
  }

  return data;
}

async function handleGetStatus(portalUrl: string, accessToken: string) {
  console.log("[bitrix-openlines-manager] Getting connector status");
  
  const connectorId = "evolution_whatsapp";
  
  try {
    // 1. Verificar se o conector está registrado
    let registered = false;
    let published = false;
    
    try {
      const connectorData = await callBitrixAPI(portalUrl, accessToken, "imconnector.connector.data.get", {
        CONNECTOR: connectorId,
      });
      registered = !!connectorData.result;
      published = registered && !!connectorData.result.name;
    } catch (error) {
      console.log("[bitrix-openlines-manager] Connector not registered yet:", error.message);
      registered = false;
      published = false;
    }

    // 2. Listar linhas disponíveis
    const linesResponse = await callBitrixAPI(portalUrl, accessToken, "imopenlines.config.list.get");
    const lines = linesResponse.result || [];

    // 3. Verificar conexões ativas do conector em cada linha
    const activeConnections: string[] = [];
    
    for (const line of lines) {
      try {
        const statusResponse = await callBitrixAPI(portalUrl, accessToken, "imconnector.connector.status", {
          CONNECTOR: connectorId,
          LINE: line.ID,
        });
        
        if (statusResponse.result && statusResponse.result.active === "Y") {
          activeConnections.push(line.ID);
        }
      } catch (error) {
        console.error(`[bitrix-openlines-manager] Error checking connector status for line ${line.ID}`);
      }
    }

    // 4. Verificar se o tile foi colocado no Contact Center
    let tilePlaced = false;
    try {
      const placementsResponse = await callBitrixAPI(portalUrl, accessToken, "placement.list");
      const placements = placementsResponse.result || [];
      tilePlaced = placements.some((p: any) => p.PLACEMENT === "CONTACT_CENTER");
    } catch (error) {
      console.error("[bitrix-openlines-manager] Error checking placements:", error.message);
    }

    return {
      registered,
      published,
      tilePlaced,
      lines,
      activeConnections,
    };
  } catch (error) {
    console.error("[bitrix-openlines-manager] Error in handleGetStatus:", error);
    throw error;
  }
}

async function handleRegisterConnector(
  portalUrl: string,
  accessToken: string,
  connector: string,
  name: string,
  _icon: string,
  chatGroup: string = "N"
) {
  console.log("[bitrix-openlines-manager] Registering connector:", connector);

  // Conforme doc: ICON deve ser objeto com DATA_IMAGE (data URI). Incluímos PLACEMENT_HANDLER.
  const params: Record<string, any> = {
    ID: connector,
    NAME: name,
    ICON: {
      DATA_IMAGE: MINIMAL_ICON_SVG_DATA,
      COLOR: "#19A800",
      SIZE: "100%",
      POSITION: "center",
    },
    ICON_DISABLED: {
      DATA_IMAGE: MINIMAL_ICON_SVG_DATA,
      COLOR: "#A0A0A0",
      SIZE: "100%",
      POSITION: "center",
    },
    PLACEMENT_HANDLER: DEFAULT_PLACEMENT_HANDLER,
    CHAT_GROUP: chatGroup,
  };

  const result = await callBitrixAPI(portalUrl, accessToken, "imconnector.register", params);
  return result;
}

async function handlePublishConnectorData(
  portalUrl: string,
  accessToken: string,
  connector: string,
  data: any
) {
  console.log("[bitrix-openlines-manager] Publishing connector data:", connector);
  
  const result = await callBitrixAPI(portalUrl, accessToken, "imconnector.connector.data.set", {
    CONNECTOR: connector,
    DATA: data,
  });
  
  return result;
}

async function handleAddToContactCenter(
  portalUrl: string,
  accessToken: string,
  placement: string,
  handlerUrl: string
) {
  console.log("[bitrix-openlines-manager] Adding to contact center:", placement);
  
  const result = await callBitrixAPI(portalUrl, accessToken, "placement.bind", {
    PLACEMENT: placement,
    HANDLER: handlerUrl,
    TITLE: "EvoWhats",
    DESCRIPTION: "Integração WhatsApp via Evolution API",
  });
  
  return result;
}

async function handleCreateLine(
  portalUrl: string,
  accessToken: string,
  name: string
) {
  console.log("[bitrix-openlines-manager] Creating line:", name);
  
  const result = await callBitrixAPI(portalUrl, accessToken, "imopenlines.config.add", {
    FIELDS: {
      LINE_NAME: name,
      CRM: "Y",
      CRM_CREATE: "lead",
      QUEUE_TYPE: "strictly_order",
    },
  });
  
  return result;
}

async function handleActivateConnector(
  portalUrl: string,
  accessToken: string,
  connector: string,
  line: string,
  active: boolean
) {
  console.log("[bitrix-openlines-manager] Activating connector:", connector, "on line:", line, "active:", active);
  
  const method = active ? "imconnector.activate" : "imconnector.deactivate";
  
  const result = await callBitrixAPI(portalUrl, accessToken, method, {
    CONNECTOR: connector,
    LINE: line,
  });
  
  return result;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response(
      JSON.stringify({ error: "Method not allowed" }),
      { status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  const supabase = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: req.headers.get("Authorization") || "" } },
  });

  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData?.user) {
    return new Response(
      JSON.stringify({ error: "Unauthorized" }),
      { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  const body = await req.json();
  const { action } = body;

  console.log(`[bitrix-openlines-manager] Processing action: ${action} for user: ${userData.user.id}`);

  try {
    // Buscar credenciais do Bitrix24 do usuário
    const { data: credentials, error: credError } = await supabase
      .from("bitrix_credentials")
      .select("*")
      .eq("user_id", userData.user.id)
      .eq("is_active", true)
      .maybeSingle();

    if (credError || !credentials?.access_token || !credentials?.portal_url) {
      return new Response(
        JSON.stringify({ error: "Credenciais Bitrix24 não encontradas ou inválidas" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { portal_url, access_token } = credentials;
    let result;

    switch (action) {
      case "get_status":
        result = await handleGetStatus(portal_url, access_token);
        break;

      case "register_connector":
        result = await handleRegisterConnector(
          portal_url,
          access_token,
          body.connector,
          body.name,
          body.icon,
          body.chatGroup
        );
        break;

      case "publish_connector_data":
        result = await handlePublishConnectorData(
          portal_url,
          access_token,
          body.connector,
          body.data
        );
        break;

      case "add_to_contact_center":
        result = await handleAddToContactCenter(
          portal_url,
          access_token,
          body.placement,
          body.handlerUrl
        );
        break;

      case "create_line":
        result = await handleCreateLine(
          portal_url,
          access_token,
          body.name
        );
        break;

      case "activate_connector":
        result = await handleActivateConnector(
          portal_url,
          access_token,
          body.connector,
          body.line,
          body.active
        );
        break;

      default:
        return new Response(
          JSON.stringify({ error: "Invalid action" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
    }

    return new Response(
      JSON.stringify({ result }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error: any) {
    console.error("[bitrix-openlines-manager] Error:", error);
    return new Response(
      JSON.stringify({ 
        error: error.message || "Internal server error",
        details: error.stack 
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
