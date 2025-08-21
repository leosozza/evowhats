import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// Ícone base64 mínimo (1x1 pixel transparente) para satisfazer a API
const MINIMAL_ICON_BASE64 = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==";

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
  
  for (const [key, value] of Object.entries(params)) {
    if (typeof value === "object") {
      formData.append(key, JSON.stringify(value));
    } else {
      formData.append(key, String(value));
    }
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
  icon: string,
  chatGroup: string = "N"
) {
  console.log("[bitrix-openlines-manager] Registering connector:", connector);
  
  // A API imconnector.register sempre exige o campo ICON
  // Usamos um ícone base64 mínimo válido para satisfazer a API
  // O Bitrix24 depois aplicará suas próprias classes CSS ui-icon
  const iconToUse = MINIMAL_ICON_BASE64;
  
  console.log("[bitrix-openlines-manager] Using minimal base64 icon for API compliance");

  const params: Record<string, any> = {
    ID: connector,
    NAME: name,
    ICON: iconToUse,
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
