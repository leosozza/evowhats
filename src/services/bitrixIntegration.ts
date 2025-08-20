
import { supabase } from "@/integrations/supabase/client";

const FUNCTIONS_BASE = "https://twqcybbjyhcokcrdfgkk.functions.supabase.co";

export async function startBitrixOAuth(portalUrl: string) {
  const session = await supabase.auth.getSession();
  const accessToken = session.data.session?.access_token;
  if (!accessToken) throw new Error("Você precisa estar autenticado.");

  const resp = await fetch(`${FUNCTIONS_BASE}/bitrix-oauth-start`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${accessToken}`,
    },
    body: JSON.stringify({ portal_url: portalUrl }),
  });

  if (!resp.ok) {
    const err = await resp.json().catch(() => ({}));
    throw new Error(err?.error || "Falha ao iniciar OAuth");
  }
  return resp.json() as Promise<{ auth_url: string }>;
}

export async function bindBitrixEvents() {
  const session = await supabase.auth.getSession();
  const accessToken = session.data.session?.access_token;
  if (!accessToken) throw new Error("Você precisa estar autenticado.");

  const resp = await fetch(`${FUNCTIONS_BASE}/bitrix-events-bind`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${accessToken}`,
    },
  });
  if (!resp.ok) {
    const err = await resp.json().catch(() => ({}));
    throw new Error(err?.error || "Falha ao vincular eventos");
  }
  return resp.json() as Promise<{ success: boolean; message: string }>;
}

export async function syncBitrixLeads() {
  const session = await supabase.auth.getSession();
  const accessToken = session.data.session?.access_token;
  if (!accessToken) throw new Error("Você precisa estar autenticado.");

  const resp = await fetch(`${FUNCTIONS_BASE}/bitrix-sync`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${accessToken}`,
    },
  });
  if (!resp.ok) {
    const err = await resp.json().catch(() => ({}));
    throw new Error(err?.error || "Falha ao sincronizar leads");
  }
  return resp.json() as Promise<{ success: boolean; imported?: number }>;
}
