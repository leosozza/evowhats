
// supabase/functions/bitrix-openlines/index.ts
// Deno Edge Function — Bitrix Open Channels wrapper (sessions + send message)

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

type Json = Record<string, unknown>;

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST,OPTIONS",
};

function ok(data: any, status = 200) {
  return new Response(JSON.stringify({ success: true, data }), { status, headers: { ...cors, "Content-Type": "application/json" } });
}
function ko(message: string, status = 400, details?: any) {
  return new Response(JSON.stringify({ success: false, error: message, details }), { status, headers: { ...cors, "Content-Type": "application/json" } });
}

type StartSessionInput = {
  tenantId: string;
  portalUrl?: string;
  lineId?: string;
  contact: { userId?: number; phone?: string; name?: string };
};
type EnsureChatInput = {
  tenantId: string;
  bitrixChatId?: string | null;
  lineId?: string;
  contact: { phone?: string; name?: string };
};
type SendMessageInput = {
  tenantId: string;
  bitrixChatId?: string | null;
  text?: string;
  fileUrl?: string;
  replyToMid?: number;
  ensure?: EnsureChatInput;
};
type CloseSessionInput = {
  tenantId: string;
  bitrixChatId: string;
};

type TokenRow = {
  id: string;
  tenant_id: string;
  portal_url: string;
  access_token: string;
  refresh_token: string | null;
  expires_at: string | null;
  client_id: string;
  client_secret: string;
};

async function getServiceClient() {
  return createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
}

async function getTenantTokens(client: ReturnType<typeof createClient>, tenantId: string): Promise<TokenRow> {
  const { data: tokens, error: tokensError } = await client
    .from("bitrix_tokens")
    .select("*")
    .eq("tenant_id", tenantId)
    .limit(1)
    .maybeSingle();

  if (tokensError || !tokens) {
    throw new Error("bitrix_tokens not found for tenant");
  }

  const { data: tenant, error: tenantError } = await client
    .from("tenants")
    .select("portal_url, client_id, client_secret")
    .eq("id", tenantId)
    .maybeSingle();

  if (tenantError || !tenant) {
    throw new Error("tenant not found");
  }

  return {
    ...tokens,
    portal_url: tenant.portal_url,
    client_id: tenant.client_id,
    client_secret: tenant.client_secret,
  } as TokenRow;
}

function isExpired(expires_at?: string | null) {
  if (!expires_at) return false;
  const exp = new Date(expires_at).getTime();
  return Date.now() > (exp - 60_000);
}

async function refreshTokenIfNeeded(client: ReturnType<typeof createClient>, t: TokenRow) {
  if (!isExpired(t.expires_at)) return t;

  const url = `${t.portal_url.replace(/\/$/, "")}/oauth/token/`;
  const body = new URLSearchParams({
    grant_type: "refresh_token",
    client_id: t.client_id,
    client_secret: t.client_secret,
    refresh_token: t.refresh_token ?? "",
  });

  const resp = await fetch(url, { method: "POST", body });
  if (!resp.ok) throw new Error("Failed to refresh Bitrix token");
  const tok = await resp.json();
  const next = {
    access_token: String(tok.access_token),
    refresh_token: String(tok.refresh_token ?? t.refresh_token ?? ""),
    expires_at: new Date(Date.now() + (tok.expires_in * 1000 || 3600_000)).toISOString(),
  };

  const { error } = await client
    .from("bitrix_tokens")
    .update(next)
    .eq("id", t.id);
  if (error) throw new Error("Failed to persist refreshed token");

  return { ...t, ...next };
}

async function callBitrix(method: string, params: Json, portalUrl: string, accessToken: string) {
  const url = `${portalUrl.replace(/\/$/, "")}/rest/${method}.json`;
  const body = new URLSearchParams();
  body.set("auth", accessToken);
  for (const [k, v] of Object.entries(params || {})) {
    body.set(k, typeof v === "string" ? v : JSON.stringify(v));
  }
  const res = await fetch(url, { method: "POST", body });
  const json = await res.json();
  if (!res.ok || json.error) {
    throw new Error(`Bitrix error: ${json.error_description || json.error || res.status}`);
  }
  return json.result ?? json;
}

async function olEnsureSession(client: ReturnType<typeof createClient>, tenantId: string, lineId?: string): Promise<{ chatId: string }> {
  const t0 = await getTenantTokens(client, tenantId);
  const t1 = await refreshTokenIfNeeded(client, t0);

  const r = await callBitrix("imopenlines.session.start", { MODE: "text", LINE_ID: lineId ?? "" }, t1.portal_url, t1.access_token);
  const chatId = String(r.CHAT_ID ?? r.chat_id ?? r.chatId);
  if (!chatId) throw new Error("CHAT_ID not returned by imopenlines.session.start");
  return { chatId };
}

async function olAnswerSession(client: ReturnType<typeof createClient>, tenantId: string, chatId: string) {
  const t0 = await getTenantTokens(client, tenantId);
  const t1 = await refreshTokenIfNeeded(client, t0);
  try {
    await callBitrix("imopenlines.session.answer", { CHAT_ID: chatId }, t1.portal_url, t1.access_token);
  } catch (_e) {
    // tolerante: se não existir, ignorar
  }
  return { chatId };
}

async function olCloseSession(client: ReturnType<typeof createClient>, tenantId: string, chatId: string) {
  const t0 = await getTenantTokens(client, tenantId);
  const t1 = await refreshTokenIfNeeded(client, t0);
  await callBitrix("imopenlines.session.close", { CHAT_ID: chatId }, t1.portal_url, t1.access_token);
  return { chatId, closed: true };
}

async function olSendMessage(client: ReturnType<typeof createClient>, tenantId: string, chatId: string, text?: string, fileUrl?: string, replyToMid?: number) {
  const t0 = await getTenantTokens(client, tenantId);
  const t1 = await refreshTokenIfNeeded(client, t0);

  if (text && text.trim()) {
    const res = await callBitrix("im.message.add", {
      CHAT_ID: Number(chatId),
      MESSAGE: text,
      ATTACH: null,
      REPLY_TO: replyToMid ? Number(replyToMid) : undefined,
    }, t1.portal_url, t1.access_token);
    return { chatId, mid: res, type: "text" };
  }

  if (fileUrl) {
    const res = await callBitrix("im.message.add", {
      CHAT_ID: Number(chatId),
      MESSAGE: fileUrl,
    }, t1.portal_url, t1.access_token);
    return { chatId, mid: res, type: "file-link" };
  }

  throw new Error("Nothing to send");
}

async function ensureChatForConversation(
  client: ReturnType<typeof createClient>,
  input: EnsureChatInput
): Promise<{ chatId: string }> {
  if (input.bitrixChatId) return { chatId: String(input.bitrixChatId) };

  const { data: conv, error } = await client
    .from("conversations")
    .select("id, openlines_chat_id")
    .eq("tenant_id", input.tenantId)
    .limit(1)
    .maybeSingle();

  if (error) throw new Error(`DB error: ${error.message}`);

  if (conv?.openlines_chat_id) {
    return { chatId: String(conv.openlines_chat_id) };
  }

  const r = await olEnsureSession(client, input.tenantId, input.lineId);
  if (conv?.id) {
    await client.from("conversations").update({ openlines_chat_id: r.chatId }).eq("id", conv.id);
  }
  return { chatId: r.chatId };
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: cors });
  }

  try {
    const service = await getServiceClient();
    const { action, payload } = await req.json().catch(() => ({ action: "", payload: {} as any }));

    console.log(`[bitrix-openlines] action: ${action}`, payload);

    switch (action) {
      case "openlines.ensureSession": {
        const p = payload as StartSessionInput;
        if (!p?.tenantId) return ko("tenantId is required");
        const r = await olEnsureSession(service, p.tenantId, p.lineId);
        return ok(r);
      }
      case "openlines.answer": {
        const { tenantId, bitrixChatId } = payload as { tenantId: string; bitrixChatId: string };
        if (!tenantId || !bitrixChatId) return ko("tenantId and bitrixChatId are required");
        const r = await olAnswerSession(service, tenantId, bitrixChatId);
        return ok(r);
      }
      case "openlines.close": {
        const p = payload as CloseSessionInput;
        if (!p?.tenantId || !p?.bitrixChatId) return ko("tenantId and bitrixChatId required");
        const r = await olCloseSession(service, p.tenantId, p.bitrixChatId);
        return ok(r);
      }
      case "openlines.sendMessage": {
        const p = payload as SendMessageInput;
        if (!p?.tenantId) return ko("tenantId required");
        let chatId = p.bitrixChatId || null;

        if (!chatId) {
          if (!p.ensure) return ko("Missing bitrixChatId and ensure{}");
          const r = await ensureChatForConversation(service, p.ensure);
          chatId = r.chatId;
        }

        const r = await olSendMessage(service, p.tenantId, String(chatId), p.text, p.fileUrl, p.replyToMid);
        return ok(r);
      }
      default:
        return ko(`Unknown action: ${action}`, 404);
    }
  } catch (e: any) {
    console.error("[bitrix-openlines] error:", e?.message || e);
    return ko(e?.message || "Internal error", 500);
  }
});
