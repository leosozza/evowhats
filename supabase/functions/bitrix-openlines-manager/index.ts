
/* Supabase Edge Function: bitrix-openlines-manager
   - Gerencia o fluxo oficial de Open Channels do Bitrix24
   - Registra conectores REST, publica dados, adiciona tiles ao Contact Center
   - Cria e ativa linhas usando imconnector.* e imopenlines.*
*/
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

// CORS com domínios atualizados para o novo projeto
const ALLOW_ORIGINS = new Set<string>([
  "https://ca2ff569-eda4-4a88-8252-9cf6f165b5f7.lovableproject.com",
  "https://ca2ff569-eda4-4a88-8252-9cf6f165b5f7.sandbox.lovable.dev",
  "https://evowhats-61.lovable.app",
  "https://bitrix-evolution-chat.lovable.app",
  "https://cc36407e-faf0-456e-8337-8cf59bc73db3.lovableproject.com",
  "https://cc36407e-faf0-456e-8337-8cf59bc73db3.sandbox.lovable.dev",
]);

function cors(origin?: string) {
  const allowed = origin && ALLOW_ORIGINS.has(origin) ? origin : Array.from(ALLOW_ORIGINS)[0];
  return {
    "Access-Control-Allow-Origin": allowed,
    "Access-Control-Allow-Headers": "authorization, content-type, x-client-info, apikey",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
    "Content-Type": "application/json",
  } as const;
}

function jsonResponse(body: unknown, status = 200, origin?: string) {
  return new Response(JSON.stringify(body), { status, headers: cors(origin) });
}

function optionsResponse(origin?: string) {
  return new Response(null, { status: 204, headers: cors(origin) });
}

async function getBitrixCredentials(supabase: any, userId: string) {
  const { data: creds, error } = await supabase
    .from("bitrix_credentials")
    .select("*")
    .eq("user_id", userId)
    .eq("is_active", true)
    .order("updated_at", { ascending: false })
    .limit(1);

  if (error || !creds || creds.length === 0) {
    throw new Error("Credenciais Bitrix24 não encontradas ou inativas");
  }

  const cred = creds[0];
  if (!cred.access_token) {
    throw new Error("Token de acesso não encontrado. Faça login novamente no Bitrix24");
  }

  // Check if token is about to expire (less than 5 minutes)
  if (cred.expires_at) {
    const expiresAt = new Date(cred.expires_at);
    const now = new Date();
    const minutesLeft = (expiresAt.getTime() - now.getTime()) / (1000 * 60);
    
    if (minutesLeft < 5) {
      console.warn("[bitrix-openlines-manager] Token expires in", minutesLeft, "minutes");
    }
  }

  return cred;
}

async function callBitrixAPI(portalUrl: string, method: string, accessToken: string, params: Record<string, any> = {}) {
  const url = `${portalUrl}/rest/${method}.json`;
  console.log("[bitrix-openlines-manager] Calling:", method, "with params:", Object.keys(params));
  
  const formData = new FormData();
  formData.append('auth', accessToken);
  
  // Add all parameters to form data
  for (const [key, value] of Object.entries(params)) {
    if (value !== null && value !== undefined) {
      if (typeof value === 'object') {
        formData.append(key, JSON.stringify(value));
      } else {
        formData.append(key, String(value));
      }
    }
  }

  const response = await fetch(url, {
    method: "POST",
    body: formData,
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    if (response.status === 404) {
      throw new Error(`Método Bitrix24 não encontrado: ${method}. Verifique se o app possui os escopos necessários: imopenlines, imconnector, im`);
    }
    throw new Error(`Erro na API Bitrix24: ${response.status} ${response.statusText}${text ? " - " + text : ""}`);
  }

  const data = await response.json();
  
  if (data.error) {
    throw new Error(`Erro Bitrix24: ${data.error_description || data.error}`);
  }

  return data;
}

async function handleGetStatus(portalUrl: string, accessToken: string) {
  console.log("[bitrix-openlines-manager] Getting connector status");
  
  try {
    // Check if connector is registered using a safer method
    let registered = false;
    let published = false;
    let connectorData = null;

    try {
      const connectorResult = await callBitrixAPI(portalUrl, "imconnector.connector.data.get", accessToken, {
        CONNECTOR: "evolution_whatsapp"
      });
      
      if (connectorResult.result && !connectorResult.error) {
        registered = true;
        connectorData = connectorResult.result;
        published = !!(connectorData && connectorData.name);
      }
    } catch (e) {
      console.log("[bitrix-openlines-manager] Connector not registered yet:", e);
    }

    // Get open lines list
    let lines = [];
    try {
      const linesResult = await callBitrixAPI(portalUrl, "imopenlines.config.list.get", accessToken);
      lines = linesResult.result || [];
    } catch (e) {
      console.warn("[bitrix-openlines-manager] Could not get lines:", e);
    }

    // Check active connections
    const activeConnections: string[] = [];
    for (const line of lines) {
      try {
        const connectorResult = await callBitrixAPI(portalUrl, "imconnector.connector.status", accessToken, {
          CONNECTOR: "evolution_whatsapp",
          LINE: line.ID
        });
        
        if (connectorResult.result && connectorResult.result.ACTIVE === "Y") {
          activeConnections.push(line.ID);
        }
      } catch (e) {
        console.warn("[bitrix-openlines-manager] Error checking connector status for line", line.ID);
      }
    }

    // Check if tile is placed
    let tilePlaced = false;
    try {
      const placementResult = await callBitrixAPI(portalUrl, "placement.list", accessToken);
      if (placementResult.result) {
        tilePlaced = placementResult.result.some((p: any) => 
          p.placement === "CONTACT_CENTER" && p.handler && p.handler.includes("evolution")
        );
      }
    } catch (e) {
      console.warn("[bitrix-openlines-manager] Error checking placement:", e);
    }

    return {
      registered,
      published,
      tilePlaced,
      lines,
      activeConnections
    };
  } catch (error) {
    console.error("[bitrix-openlines-manager] Error getting status:", error);
    throw error;
  }
}

async function handleRegisterConnector(portalUrl: string, accessToken: string, params: any) {
  console.log("[bitrix-openlines-manager] Registering connector:", params.connector);
  
  // Process icon: extract base64 data if it's a data URL
  let iconBase64 = "";
  if (params.icon) {
    if (typeof params.icon === "string") {
      if (params.icon.startsWith("data:image/")) {
        // Extract base64 part after comma
        const base64Match = params.icon.match(/^data:image\/[^;]+;base64,(.+)$/);
        if (base64Match) {
          iconBase64 = base64Match[1];
        }
      } else {
        // Assume it's already base64
        iconBase64 = params.icon;
      }
    }
  }

  if (!iconBase64) {
    throw new Error("Ícone é obrigatório para registrar o conector");
  }

  const result = await callBitrixAPI(portalUrl, "imconnector.register", accessToken, {
    ID: params.connector,
    NAME: params.name,
    ICON: iconBase64,
    CHAT_GROUP: params.chatGroup || "N"
  });

  return result;
}

async function handlePublishConnectorData(portalUrl: string, accessToken: string, params: any) {
  console.log("[bitrix-openlines-manager] Publishing connector data:", params.connector);
  
  // Process icon for publishing
  let iconBase64 = "";
  if (params.data && params.data.icon) {
    if (typeof params.data.icon === "string") {
      if (params.data.icon.startsWith("data:image/")) {
        const base64Match = params.data.icon.match(/^data:image\/[^;]+;base64,(.+)$/);
        if (base64Match) {
          iconBase64 = base64Match[1];
        }
      } else {
        iconBase64 = params.data.icon;
      }
    }
  }

  const publishData = {
    ...params.data,
    icon: iconBase64
  };
  
  const result = await callBitrixAPI(portalUrl, "imconnector.connector.data.set", accessToken, {
    CONNECTOR: params.connector,
    DATA: publishData
  });

  return result;
}

async function handleAddToContactCenter(portalUrl: string, accessToken: string, params: any) {
  console.log("[bitrix-openlines-manager] Adding to contact center:", params.placement);
  
  const result = await callBitrixAPI(portalUrl, "placement.bind", accessToken, {
    PLACEMENT: params.placement,
    HANDLER: params.handlerUrl,
    TITLE: "EvoWhats",
    DESCRIPTION: "Integração WhatsApp via Evolution API"
  });

  return result;
}

async function handleCreateLine(portalUrl: string, accessToken: string, name: string) {
  console.log("[bitrix-openlines-manager] Creating line:", name);
  
  const result = await callBitrixAPI(portalUrl, "imopenlines.config.add", accessToken, {
    PARAMS: {
      LINE_NAME: name,
      CRM: "Y",
      CRM_CREATE: "lead",
      QUEUE_TIME: 60,
      MAX_QUEUE_LENGTH: 5,
      WAIT_ANSWER: 300
    }
  });

  return result;
}

async function handleActivateConnector(portalUrl: string, accessToken: string, params: any) {
  console.log("[bitrix-openlines-manager] Activating connector:", params.connector, "on line:", params.line);
  
  if (params.active) {
    // Activate connector
    const result = await callBitrixAPI(portalUrl, "imconnector.activate", accessToken, {
      CONNECTOR: params.connector,
      LINE: params.line
    });
    return result;
  } else {
    // Deactivate connector
    const result = await callBitrixAPI(portalUrl, "imconnector.deactivate", accessToken, {
      CONNECTOR: params.connector,
      LINE: params.line
    });
    return result;
  }
}

serve(async (req: Request) => {
  const origin = req.headers.get("origin");
  
  if (req.method === "OPTIONS") {
    return optionsResponse(origin);
  }

  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405, origin);
  }

  try {
    const authHeader = req.headers.get("authorization");
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return jsonResponse({ error: "Missing or invalid authorization header" }, 401, origin);
    }

    const token = authHeader.replace("Bearer ", "");
    const supabase = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: `Bearer ${token}` } }
    });

    // Verificar usuário autenticado
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return jsonResponse({ error: "Unauthorized" }, 401, origin);
    }

    // Parse request body
    const body = await req.json() as { 
      action?: string; 
      method?: string; 
      params?: Record<string, any>;
      [key: string]: any;
    };
    
    const action = body.action || body.method;
    if (!action) {
      return jsonResponse({ error: "Action or method is required" }, 400, origin);
    }

    console.log("[bitrix-openlines-manager] Processing action:", action, "for user:", user.id);

    // Get Bitrix credentials
    const creds = await getBitrixCredentials(supabase, user.id);
    
    let result;
    
    switch (action) {
      case "get_status":
        result = await handleGetStatus(creds.portal_url, creds.access_token);
        break;
        
      case "register_connector":
        result = await handleRegisterConnector(creds.portal_url, creds.access_token, body);
        break;
        
      case "publish_connector_data":
        result = await handlePublishConnectorData(creds.portal_url, creds.access_token, body);
        break;
        
      case "add_to_contact_center":
        result = await handleAddToContactCenter(creds.portal_url, creds.access_token, body);
        break;
        
      case "create_line":
        result = await handleCreateLine(creds.portal_url, creds.access_token, body.name);
        break;
        
      case "activate_connector":
        result = await handleActivateConnector(creds.portal_url, creds.access_token, body);
        break;
        
      default:
        // Handle generic Bitrix API calls
        if (body.params) {
          result = await callBitrixAPI(creds.portal_url, action, creds.access_token, body.params);
        } else {
          result = await callBitrixAPI(creds.portal_url, action, creds.access_token);
        }
    }
    
    // Log successful operation
    await supabase
      .from("bitrix_event_logs")
      .insert({
        user_id: user.id,
        portal_url: creds.portal_url,
        event_type: "api_call",
        event_data: {
          action,
          params: body.params,
          result: result.result || result,
          success: true
        },
        processed_at: new Date().toISOString()
      });

    return jsonResponse({ 
      result: result.result || result,
      success: true 
    }, 200, origin);

  } catch (error) {
    console.error("[bitrix-openlines-manager] Error:", error);
    
    // Try to log error if we have user context
    try {
      const authHeader = req.headers.get("authorization");
      if (authHeader) {
        const token = authHeader.replace("Bearer ", "");
        const supabase = createClient(SUPABASE_URL, ANON_KEY, {
          global: { headers: { Authorization: `Bearer ${token}` } }
        });
        
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          await supabase
            .from("bitrix_event_logs")
            .insert({
              user_id: user.id,
              portal_url: "unknown",
              event_type: "api_error",
              event_data: {
                error: error.message,
                success: false
              },
              processed_at: new Date().toISOString()
            });
        }
      }
    } catch (logError) {
      console.error("[bitrix-openlines-manager] Failed to log error:", logError);
    }

    return jsonResponse({
      error: error.message || "Internal server error",
      success: false
    }, 500, origin);
  }
});
