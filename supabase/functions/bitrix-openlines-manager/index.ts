import "https://deno.land/x/xhr@0.4.0/mod.ts";
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { callBitrixAPI, setCorrelationId } from "../_shared/bitrix/callBitrixAPI.ts";

// Env
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ALLOWED_ORIGINS = (Deno.env.get("ALLOWED_ORIGINS") || "*")
  .split(/[\s,]+/)
  .filter(Boolean);

// Defaults
const CONNECTOR_ID = "evolution_whatsapp";

function cors(origin?: string | null) {
  const allowed = origin && (ALLOWED_ORIGINS.includes("*") || ALLOWED_ORIGINS.includes(origin)) ? origin : "";
  return {
    "Access-Control-Allow-Origin": allowed || (ALLOWED_ORIGINS[0] || "*"),
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-corr-id",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    Vary: "Origin",
  } as Record<string, string>;
}

function ok(data: any, status = 200, origin?: string | null) {
  return new Response(JSON.stringify({ success: true, ok: true, ...data }), {
    status,
    headers: { ...cors(origin), "Content-Type": "application/json" },
  });
}

function ko(status: number, error: any, origin?: string | null) {
  return new Response(JSON.stringify({ success: false, ok: false, error }), {
    status,
    headers: { ...cors(origin), "Content-Type": "application/json" },
  });
}

async function getUserId(req: Request) {
  const supabase = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: req.headers.get("Authorization") || "" } },
  });
  const { data, error } = await supabase.auth.getUser();
  if (error || !data?.user) return null;
  return data.user.id as string;
}

async function upsertBinding(service: ReturnType<typeof createClient>, tenantId: string, lineId: string, waInstanceId: string, createdBy: string) {
  // Try schema with wa_instance_id, fallback to instance_id
  try {
    return await service.from("open_channel_bindings").upsert({
      tenant_id: tenantId,
      line_id: lineId,
      wa_instance_id: waInstanceId,
      created_by: createdBy,
      created_at: new Date().toISOString(),
    }, { onConflict: "tenant_id,line_id" });
  } catch (e: any) {
    // Fallback if column doesn't exist
    return await service.from("open_channel_bindings").upsert({
      tenant_id: tenantId,
      line_id: lineId,
      instance_id: waInstanceId,
      created_by: createdBy,
      created_at: new Date().toISOString(),
    }, { onConflict: "tenant_id,line_id" });
  }
}

serve(async (req) => {
  const origin = req.headers.get("origin");
  const url = new URL(req.url);
  const path = url.pathname.replace(/\/+$/, "");
  const corrId = req.headers.get("x-corr-id") || crypto.randomUUID();
  setCorrelationId(corrId);

  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors(origin) });

  try {
    const userId = await getUserId(req);
    if (!userId) return ko(401, "Unauthorized", origin);

    const service = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

    // Helper to parse JSON body safely
    const readBody = async () => (await req.json().catch(() => ({}))) as any;

    // Routing
    // New REST-style endpoints
    if (req.method === "POST" && path.endsWith("/bitrix-openlines-manager/register")) {
      const body = await readBody();
      const connector = body.connector || CONNECTOR_ID;
      const name = body.name || "EvoWhats";
      const chatGroup = body.chatGroup ?? "N";
      const params: Record<string, any> = {
        ID: connector,
        NAME: name,
        CHAT_GROUP: chatGroup,
      };
      // Support optional ICON/DESCRIPTION if provided
      if (body.icon) params.ICON = body.icon;
      if (body.icon_disabled) params.ICON_DISABLED = body.icon_disabled;
      if (body.placement_handler) params.PLACEMENT_HANDLER = body.placement_handler;

      const result = await callBitrixAPI(userId, "imconnector.register", params);
      return ok({ result }, 200, origin);
    }

    if (req.method === "POST" && path.endsWith("/bitrix-openlines-manager/data-set")) {
      const body = await readBody();
      const connector = body.connector || CONNECTOR_ID;
      const line = body.line || body.LINE;
      if (!line) return ko(400, "LINE parameter is required for data-set", origin);
      
      const data = body.data || body.DATA || {};
      const result = await callBitrixAPI(userId, "imconnector.connector.data.set", {
        CONNECTOR: connector,
        LINE: line,
        DATA: data,
      });
      return ok({ result }, 200, origin);
    }

    if (req.method === "POST" && path.endsWith("/bitrix-openlines-manager/activate")) {
      const body = await readBody();
      const connector = body.connector || CONNECTOR_ID;
      const line = body.line || body.LINE;
      if (!line) return ko(400, "LINE parameter is required for activate", origin);
      
      const active = body.active ?? true;
      const method = active ? "imconnector.activate" : "imconnector.deactivate";
      const result = await callBitrixAPI(userId, method, { CONNECTOR: connector, LINE: line });
      return ok({ result }, 200, origin);
    }

    if (req.method === "GET" && path.endsWith("/bitrix-openlines-manager/status")) {
      const connector = url.searchParams.get("connector") || CONNECTOR_ID;
      
      // Get connector status and lines to build aggregated response
      const [statusResult, linesResult] = await Promise.all([
        callBitrixAPI(userId, "imconnector.status", { CONNECTOR: connector }),
        callBitrixAPI(userId, "imopenlines.config.list.get", {}).catch(() => ({ result: [] }))
      ]);
      
      const status = {
        registered: !!statusResult?.result?.registered,
        published: !!statusResult?.result?.data_set,
        tilePlaced: false, // Would need placement.list to check this
        lines: linesResult?.result || [],
        activeConnections: statusResult?.result?.active_lines || []
      };
      
      return ok({ result: status, status, raw: statusResult }, 200, origin);
    }

    if (req.method === "GET" && path.endsWith("/bitrix-openlines-manager/lines")) {
      const result = await callBitrixAPI(userId, "imopenlines.config.list.get", {});
      return ok({ result }, 200, origin);
    }

    if (req.method === "POST" && path.endsWith("/bitrix-openlines-manager/lines/create")) {
      const body = await readBody();
      const name = body.name || body.LINE_NAME || "WhatsApp";
      const fields = {
        LINE_NAME: name,
        CRM: "Y",
        CRM_CREATE: "lead",
        QUEUE_TYPE: "strictly_order",
      };
      const result = await callBitrixAPI(userId, "imopenlines.config.add", { FIELDS: fields });
      return ok({ result }, 200, origin);
    }

    if (req.method === "POST" && path.endsWith("/bitrix-openlines-manager/bind-line")) {
      const body = await readBody();
      const lineId = String(body.line_id || body.lineId || body.LINE || "").trim();
      const waInstanceId = String(body.wa_instance_id || body.instance_id || body.waInstanceId || "").trim();
      if (!lineId) return ko(400, "line_id parameter is required", origin);
      if (!waInstanceId) return ko(400, "wa_instance_id parameter is required", origin);

      const { error } = await upsertBinding(service, userId, lineId, waInstanceId, userId);
      if (error) return ko(500, error.message, origin);
      return ok({}, 200, origin);
    }

    // Backward compatibility (action-based)
    if (req.method === "POST" && path.endsWith("/bitrix-openlines-manager")) {
      const body = await readBody();
      const action = String(body.action || "");
      switch (action) {
        case "get_status": {
          // Get connector status and lines to build aggregated response
          const connector = body.connector || CONNECTOR_ID;
          const [statusResult, linesResult] = await Promise.all([
            callBitrixAPI(userId, "imconnector.status", { CONNECTOR: connector }),
            callBitrixAPI(userId, "imopenlines.config.list.get", {}).catch(() => ({ result: [] }))
          ]);
          
          const status = {
            registered: !!statusResult?.result?.registered,
            published: !!statusResult?.result?.data_set,
            tilePlaced: false, // Would need placement.list to check this
            lines: linesResult?.result || [],
            activeConnections: statusResult?.result?.active_lines || []
          };
          
          return ok({ result: status, status, raw: statusResult }, 200, origin);
        }
        case "register_connector": {
          const result = await callBitrixAPI(userId, "imconnector.register", {
            ID: body.connector || CONNECTOR_ID,
            NAME: body.name || "EvoWhats",
            ICON: body.icon || "data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjQiIGhlaWdodD0iMjQiIHZpZXdCb3g9IjAgMCAyNCAyNCIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KPHBhdGggZD0iTTEyIDJDNi40NzcgMiAyIDYuNDc3IDIgMTJDMiAxNy41MjMgNi40NzcgMjIgMTIgMjJDMTcuNTIzIDIyIDIyIDE3LjUyMyAyMiAxMkMyMiA2LjQ3NyAxNy41MjMgMiAxMiAyWiIgZmlsbD0iIzI1RDM2NiIvPgo8cGF0aCBkPSJNMTYuNSA5LjVMMTEgMTVMNy41IDExLjUiIHN0cm9rZT0id2hpdGUiIHN0cm9rZS13aWR0aD0iMiIgc3Ryb2tlLWxpbmVjYXA9InJvdW5kIiBzdHJva2UtbGluZWpvaW49InJvdW5kIi8+Cjwvc3ZnPgo=",
            CHAT_GROUP: body.chatGroup ?? "N",
          });
          return ok({ result }, 200, origin);
        }
        case "publish_connector_data":
        case "data_set": {
          if (!body.line && !body.LINE) {
            return ko(400, "LINE parameter is required for publish_connector_data", origin);
          }
          const result = await callBitrixAPI(userId, "imconnector.connector.data.set", {
            CONNECTOR: body.connector || CONNECTOR_ID,
            LINE: body.line || body.LINE,
            DATA: body.data || body.DATA || {},
          });
          return ok({ result }, 200, origin);
        }
        case "add_to_contact_center":
        case "placement_add": {
          if (!body.placement) return ko(400, "placement parameter is required", origin);
          if (!body.handlerUrl) return ko(400, "handlerUrl parameter is required", origin);
          
          const result = await callBitrixAPI(userId, "placement.bind", {
            PLACEMENT: body.placement,
            HANDLER: body.handlerUrl,
            TITLE: body.title || "EvoWhats",
            DESCRIPTION: body.description || "WhatsApp Integration",
          });
          return ok({ result }, 200, origin);
        }
        case "list_lines":
        case "get_lines": {
          const result = await callBitrixAPI(userId, "imopenlines.config.list.get", {});
          return ok({ result }, 200, origin);
        }
        case "create_line": {
          const result = await callBitrixAPI(userId, "imopenlines.config.add", {
            FIELDS: {
              LINE_NAME: body.name || "WhatsApp",
              CRM: "Y",
              CRM_CREATE: "lead",
              QUEUE_TYPE: "strictly_order",
            },
          });
          return ok({ result }, 200, origin);
        }
        case "activate_connector": {
          if (!body.line && !body.LINE) {
            return ko(400, "LINE parameter is required for activate_connector", origin);
          }
          const method = (body.active !== false) ? "imconnector.activate" : "imconnector.deactivate";
          const result = await callBitrixAPI(userId, method, {
            CONNECTOR: body.connector || CONNECTOR_ID,
            LINE: body.line || body.LINE,
          });
          return ok({ result }, 200, origin);
        }
        default:
          return ko(400, `Invalid action: ${action}`, origin);
      }
    }

    return ko(404, "Not Found", origin);
  } catch (e) {
    console.error("[bitrix-openlines-manager] Error:", e);
    return ko(500, String(e), origin);
  }
});