import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

type Action =
  | "start_session"
  | "get_status"
  | "get_qr"
  | "proxy"
  | "ensure_line_session"
  | "start_session_for_line"
  | "get_status_for_line"
  | "get_qr_for_line";

type RequestBody = {
  action: Action;
  path?: string;
  method?: string;
  payload?: unknown;

  bitrix_line_id?: string;
  bitrix_line_name?: string;
};

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function jsonResponse(body: unknown, init?: ResponseInit) {
  return new Response(JSON.stringify(body), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
    ...init,
  });
}

function joinUrl(base: string, path: string) {
  const baseTrimmed = base.replace(/\/+$/, "");
  const pathTrimmed = path.replace(/^\/+/, "");
  return `${baseTrimmed}/${pathTrimmed}`;
}

async function tryParseResponse(res: Response) {
  const contentType = res.headers.get("content-type") || "";
  if (contentType.includes("application/json")) {
    return await res.json();
  }
  const text = await res.text();
  return { raw: text };
}

// Sanitiza string para nome de instância
function sanitizeInstanceName(name: string) {
  return name.replace(/[^a-zA-Z0-9_\-\.]/g, "_").slice(0, 128);
}

// Deriva o nome da instância para uma LINE específica
function deriveLineInstanceName(base: string | undefined, userId: string, lineId: string) {
  const root = base && base.trim().length > 0 ? base : "evo";
  return sanitizeInstanceName(`${root}__u${userId.slice(0, 8)}__l${lineId}`);
}

serve(async (req) => {
  // CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, { status: 405 });
  }

  // Supabase client com JWT do usuário
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY");
  if (!supabaseUrl || !supabaseAnonKey) {
    console.error("[evolution-connector] Missing SUPABASE_URL or SUPABASE_ANON_KEY envs");
    return jsonResponse({ error: "Server misconfiguration" }, { status: 500 });
  }

  const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: req.headers.get("Authorization") || "" } },
  });

  let body: RequestBody;
  try {
    body = await req.json();
  } catch (_) {
    return jsonResponse({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { data: auth } = await supabase.auth.getUser();
  if (!auth?.user) {
    console.warn("[evolution-connector] Unauthorized call");
    return jsonResponse({ error: "Unauthorized" }, { status: 401 });
  }

  console.log("[evolution-connector] user:", auth.user.id, "action:", body.action);

  // Carregar config do usuário
  const { data: config, error: cfgErr } = await supabase
    .from("user_configurations")
    .select("*")
    .eq("user_id", auth.user.id)
    .maybeSingle();

  if (cfgErr) {
    console.error("[evolution-connector] Error loading user_configurations:", cfgErr);
    return jsonResponse({ error: "Failed to load configuration" }, { status: 500 });
  }

  const baseUrl = config?.evolution_base_url as string | undefined;
  const apiKey = config?.evolution_api_key as string | undefined;
  const globalInstanceName = config?.evolution_instance_name as string | undefined;

  if (!baseUrl || !apiKey) {
    return jsonResponse(
      { error: "Evolution API não configurada. Defina URL Base e API Key em Configurações." },
      { status: 400 }
    );
  }

  // Helper para chamar Evolution API
  async function evoFetch(path: string, init?: RequestInit) {
    const url = joinUrl(baseUrl, path);
    const headers = new Headers(init?.headers || {});
    if (!headers.has("Authorization")) headers.set("Authorization", `Bearer ${apiKey}`);
    if (!headers.has("apikey")) headers.set("apikey", apiKey);
    if (!headers.has("Content-Type")) headers.set("Content-Type", "application/json");
    headers.set("Accept", "application/json");

    console.log("[evolution-connector] ->", init?.method || "GET", url);
    const res = await fetch(url, { ...init, headers });
    const parsed = await tryParseResponse(res);

    if (!res.ok) {
      console.error("[evolution-connector] Evolution error:", res.status, parsed);
      return { ok: false as const, status: res.status, data: parsed, path: url };
    }
    return { ok: true as const, status: res.status, data: parsed, path: url };
  }

  // Helper: tenta múltiplos caminhos e retorna o primeiro OK
  type Candidate = { method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE"; path: string; body?: unknown };
  async function tryCandidates(candidates: Candidate[]) {
    let lastResult: Awaited<ReturnType<typeof evoFetch>> | null = null;
    const tried: string[] = [];
    for (const c of candidates) {
      tried.push(`${c.method} ${c.path}`);
      const init: RequestInit = {
        method: c.method,
        body: c.method === "GET" || c.method === "DELETE" ? undefined : JSON.stringify(c.body ?? {}),
      };
      const r = await evoFetch(c.path, init);
      lastResult = r;
      if (r.ok) {
        console.log("[evolution-connector] Success on:", c.method, c.path);
        return { result: r, tried };
      }
    }
    console.warn("[evolution-connector] All candidates failed:", tried);
    return { result: lastResult!, tried };
  }

  // Normalizações
  function normalizeStatus(data: any) {
    const state =
      data?.state ??
      data?.status ??
      data?.connectionStatus ??
      data?.instance?.state ??
      data?.instance?.status ??
      data?.response?.state ??
      data?.data?.state ??
      data?.data?.status ??
      "unknown";

    const owner =
      data?.owner ??
      data?.instance?.owner ??
      data?.user ??
      data?.me ??
      data?.response?.owner ??
      "N/A";

    return { state, owner };
  }

  function normalizeQr(data: any) {
    const qr =
      data?.base64 ??
      data?.qrcode ??
      data?.qrCode ??
      data?.qr ??
      data?.image ??
      data?.data?.base64 ??
      data?.data?.qrcode ??
      null;

    return qr;
  }

  // Helper: garantir/recuperar sessão por linha
  async function ensureLineSession(lineId: string, lineName?: string) {
    const { data: existing, error: selErr } = await supabase
      .from("wa_sessions")
      .select("*")
      .eq("user_id", auth.user.id)
      .eq("bitrix_line_id", lineId)
      .maybeSingle();

    if (selErr) {
      console.error("[evolution-connector] wa_sessions select error:", selErr);
      throw new Error("Falha ao consultar sessão.");
    }

    const evo_instance_id = deriveLineInstanceName(globalInstanceName, auth.user.id, lineId);

    if (!existing) {
      const insertPayload = {
        user_id: auth.user.id,
        bitrix_line_id: lineId,
        bitrix_line_name: lineName ?? null,
        evo_instance_id,
        status: "PENDING_QR",
      };
      const { data: inserted, error: insErr } = await supabase
        .from("wa_sessions")
        .insert(insertPayload)
        .select("*")
        .maybeSingle();

      if (insErr) {
        console.error("[evolution-connector] wa_sessions insert error:", insErr);
        throw new Error("Falha ao criar sessão para a linha.");
      }
      return inserted!;
    }

    // Atualiza nome da linha, se mudou
    if (lineName && existing.bitrix_line_name !== lineName) {
      await supabase
        .from("wa_sessions")
        .update({ bitrix_line_name: lineName })
        .eq("id", existing.id);
    }

    // Garante que o evo_instance_id está no formato atual
    if (existing.evo_instance_id !== evo_instance_id) {
      const { data: updated } = await supabase
        .from("wa_sessions")
        .update({ evo_instance_id })
        .eq("id", existing.id)
        .select("*")
        .maybeSingle();
      return updated ?? existing;
    }

    return existing;
  }

  // Helpers Evolution por instância (linha)
  async function evoStartInstance(instanceName: string) {
    const enc = encodeURIComponent(instanceName);
    const { result, tried } = await tryCandidates([
      { method: "POST", path: "/instances", body: { instanceName } },
      { method: "POST", path: "/instances/create", body: { instanceName } },
      { method: "POST", path: "/instance/create", body: { instanceName } },
      { method: "POST", path: "/v1/instance/create", body: { instanceName } },
      { method: "GET", path: `/instance/create/${enc}` },
      { method: "POST", path: `/session/${enc}/start`, body: { instanceName } },
    ]);
    return { result, tried };
  }

  async function evoGetStatus(instanceName: string) {
    const enc = encodeURIComponent(instanceName);
    const { result, tried } = await tryCandidates([
      { method: "GET", path: `/instances/${enc}/status` },
      { method: "GET", path: `/instances/${enc}/state` },
      { method: "GET", path: `/instance/connectionState/${enc}` },
      { method: "GET", path: `/v1/instance/connectionState/${enc}` },
      { method: "GET", path: `/session/${enc}/status` },
      { method: "GET", path: `/whatsapp/${enc}/status` },
      { method: "GET", path: `/instance/${enc}` },
    ]);
    const normalized = normalizeStatus(result.data);
    return { result: { ...result, data: { ...result.data, ...normalized } }, tried };
  }

  async function evoGetQr(instanceName: string) {
    const enc = encodeURIComponent(instanceName);
    const { result, tried } = await tryCandidates([
      { method: "GET", path: `/instances/${enc}/qrcode` },
      { method: "GET", path: `/instances/${enc}/qr` },
      { method: "GET", path: `/instance/qrbase64/${enc}` },
      { method: "GET", path: `/qrcode/${enc}` },
      { method: "GET", path: `/v1/instance/qr/${enc}` },
    ]);
    const qr = normalizeQr(result.data);
    return { result: { ...result, data: { ...result.data, base64: qr, qrcode: qr } }, tried };
  }

  try {
    switch (body.action) {
      case "ensure_line_session": {
        if (!body.bitrix_line_id) {
          return jsonResponse({ error: "bitrix_line_id é obrigatório" }, { status: 400 });
        }
        const session = await ensureLineSession(body.bitrix_line_id, body.bitrix_line_name);
        return jsonResponse({ ok: true, session });
      }

      case "start_session_for_line": {
        if (!body.bitrix_line_id) {
          return jsonResponse({ error: "bitrix_line_id é obrigatório" }, { status: 400 });
        }
        const session = await ensureLineSession(body.bitrix_line_id, body.bitrix_line_name);
        const { result, tried } = await evoStartInstance(session.evo_instance_id);

        // Se sucesso, apenas retorna; status ainda pode ser pending_*
        if (result.ok) {
          return jsonResponse({ ok: true, tried, result, session });
        }
        return jsonResponse({ ok: false, tried, result, session }, { status: 502 });
      }

      case "get_status_for_line": {
        if (!body.bitrix_line_id) {
          return jsonResponse({ error: "bitrix_line_id é obrigatório" }, { status: 400 });
        }
        const session = await ensureLineSession(body.bitrix_line_id, body.bitrix_line_name);
        const { result, tried } = await evoGetStatus(session.evo_instance_id);

        // Atualiza status na tabela
        const state = (result.data?.state || "unknown").toString().toUpperCase();
        let newStatus: "PENDING_QR" | "CONNECTED" | "DISCONNECTED" | "ERROR" | null = null;
        if (state.includes("CONNECTED") || state === "OPEN" || state === "CONNECTED") newStatus = "CONNECTED";
        else if (state.includes("QR") || state.includes("PAIR") || state === "UNKNOWN") newStatus = "PENDING_QR";
        else if (state.includes("DISCONNECTED") || state.includes("CLOSED")) newStatus = "DISCONNECTED";
        else if (!result.ok) newStatus = "ERROR";

        if (newStatus) {
          await supabase
            .from("wa_sessions")
            .update({ status: newStatus, last_sync_at: new Date().toISOString() })
            .eq("id", session.id);
        }

        return jsonResponse({ ...result, tried, sessionId: session.id });
      }

      case "get_qr_for_line": {
        if (!body.bitrix_line_id) {
          return jsonResponse({ error: "bitrix_line_id é obrigatório" }, { status: 400 });
        }
        const session = await ensureLineSession(body.bitrix_line_id, body.bitrix_line_name);
        const { result, tried } = await evoGetQr(session.evo_instance_id);

        const qr = (result as any)?.data?.base64 ?? null;
        if (qr) {
          await supabase
            .from("wa_sessions")
            .update({ qr_code: qr, last_sync_at: new Date().toISOString() })
            .eq("id", session.id);
        }

        return jsonResponse({ ...result, tried, sessionId: session.id });
      }

      default:
        // Delega para os casos antigos
        switch (body.action) {
          case "start_session": {
            if (!globalInstanceName) {
              return jsonResponse({ error: "Nome da instância não configurado." }, { status: 400 });
            }
            const { result, tried } = await evoStartInstance(globalInstanceName);
            if (result.ok) return jsonResponse({ ...result });
            return jsonResponse({ ...result, tried, message: "Falhou ao iniciar a sessão nas rotas testadas." }, { status: 502 });
          }
          case "get_status": {
            if (!globalInstanceName) {
              return jsonResponse({ error: "Nome da instância não configurado." }, { status: 400 });
            }
            const { result, tried } = await evoGetStatus(globalInstanceName);
            return jsonResponse({ ...result, tried });
          }
          case "get_qr": {
            if (!globalInstanceName) {
              return jsonResponse({ error: "Nome da instância não configurado." }, { status: 400 });
            }
            const { result, tried } = await evoGetQr(globalInstanceName);
            return jsonResponse({ ...result, tried });
          }
          case "proxy": {
            if (!body.path) {
              return jsonResponse({ error: "Parâmetro 'path' é obrigatório para proxy." }, { status: 400 });
            }
            const method = (body.method || "GET").toUpperCase();
            if (!["GET", "POST", "PUT", "PATCH", "DELETE"].includes(method)) {
              return jsonResponse({ error: "Método não permitido." }, { status: 400 });
            }

            const r = await evoFetch(body.path, {
              method,
              body: method === "GET" || method === "DELETE" ? undefined : JSON.stringify(body.payload ?? {}),
            });
            return jsonResponse(r);
          }
          default:
            return jsonResponse({ error: "Ação inválida." }, { status: 400 });
        }
    }
  } catch (err) {
    console.error("[evolution-connector] Unexpected error:", err);
    return jsonResponse({ error: "Internal error" }, { status: 500 });
  }
});
