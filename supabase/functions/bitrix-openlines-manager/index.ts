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

function json(body: unknown, status = 200, origin?: string | null) {
  return new Response(JSON.stringify(body), {
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
  // Assumimos tabela open_channel_bindings existente via migração
  return service.from("open_channel_bindings").upsert({
    tenant_id: tenantId,
    line_id: lineId,
    wa_instance_id: waInstanceId,
    created_by: createdBy,
    created_at: new Date().toISOString(),
  }, { onConflict: "tenant_id,line_id" });
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
    if (!userId) return json({ error: "Unauthorized" }, 401, origin);

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
      return json({ ok: true, result }, 200, origin);
    }

    if (req.method === "POST" && path.endsWith("/bitrix-openlines-manager/data-set")) {
      const body = await readBody();
      const connector = body.connector || CONNECTOR_ID;
      const data = body.data || body.DATA || {};
      const result = await callBitrixAPI(userId, "imconnector.connector.data.set", {
        CONNECTOR: connector,
        DATA: data,
      });
      return json({ ok: true, result }, 200, origin);
    }

    if (req.method === "POST" && path.endsWith("/bitrix-openlines-manager/activate")) {
      const body = await readBody();
      const connector = body.connector || CONNECTOR_ID;
      const line = body.line || body.LINE;
      const active = body.active ?? true;
      const method = active ? "imconnector.activate" : "imconnector.deactivate";
      const result = await callBitrixAPI(userId, method, { CONNECTOR: connector, LINE: line });
      return json({ ok: true, result }, 200, origin);
    }

    if (req.method === "GET" && path.endsWith("/bitrix-openlines-manager/status")) {
      const connector = url.searchParams.get("connector") || CONNECTOR_ID;
      const result = await callBitrixAPI(userId, "imconnector.status", { CONNECTOR: connector });
      return json({ ok: true, result }, 200, origin);
    }

    if (req.method === "GET" && path.endsWith("/bitrix-openlines-manager/lines")) {
      const result = await callBitrixAPI(userId, "imopenlines.config.list.get", {});
      return json({ ok: true, result }, 200, origin);
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
      return json({ ok: true, result }, 200, origin);
    }

    if (req.method === "POST" && path.endsWith("/bitrix-openlines-manager/bind-line")) {
      const body = await readBody();
      const lineId = String(body.line_id || body.lineId || body.LINE || "").trim();
      const waInstanceId = String(body.wa_instance_id || body.instance_id || body.waInstanceId || "").trim();
      if (!lineId || !waInstanceId) return json({ error: "Missing line_id or wa_instance_id" }, 400, origin);

      const { error } = await upsertBinding(service, userId, lineId, waInstanceId, userId);
      if (error) return json({ error: error.message }, 500, origin);
      return json({ ok: true }, 200, origin);
    }

    // Backward compatibility (action-based)
    if (req.method === "POST" && path.endsWith("/bitrix-openlines-manager")) {
      const body = await readBody();
      const action = String(body.action || "");
      switch (action) {
        case "get_status": {
          const result = await callBitrixAPI(userId, "imconnector.status", { CONNECTOR: CONNECTOR_ID });
          return json({ result }, 200, origin);
        }
        case "register_connector": {
          const result = await callBitrixAPI(userId, "imconnector.register", {
            ID: body.connector || CONNECTOR_ID,
            NAME: body.name || "EvoWhats",
          });
          return json({ result }, 200, origin);
        }
        case "publish_connector_data": {
          const result = await callBitrixAPI(userId, "imconnector.connector.data.set", {
            CONNECTOR: body.connector || CONNECTOR_ID,
            DATA: body.data || {},
          });
          return json({ result }, 200, origin);
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
          return json({ result }, 200, origin);
        }
        case "activate_connector": {
          const method = body.active ? "imconnector.activate" : "imconnector.deactivate";
          const result = await callBitrixAPI(userId, method, {
            CONNECTOR: body.connector || CONNECTOR_ID,
            LINE: body.line,
          });
          return json({ result }, 200, origin);
        }
        default:
          return json({ error: "Invalid action" }, 400, origin);
      }
    }

    return json({ error: "Not Found" }, 404, origin);
  } catch (e) {
    console.error("[bitrix-openlines-manager] Error:", e);
    return json({ error: String(e) }, 500, origin);
  }
});