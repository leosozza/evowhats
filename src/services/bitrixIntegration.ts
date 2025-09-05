
import { supabase } from "@/integrations/supabase/client";

// All Bitrix calls go through Supabase Edge Functions via supabase.functions.invoke

export async function startBitrixOAuth(portalUrl: string) {
  const session = await supabase.auth.getSession();
  const accessToken = session.data.session?.access_token;
  if (!accessToken) throw new Error("Você precisa estar autenticado.");

  const { data, error } = await supabase.functions.invoke("bitrix-oauth-start", {
    body: { portal_url: portalUrl },
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (error) throw new Error(error.message || "Falha ao iniciar OAuth");
  return data as { auth_url: string };
}

export async function bindBitrixEvents() {
  const session = await supabase.auth.getSession();
  const accessToken = session.data.session?.access_token;
  if (!accessToken) throw new Error("Você precisa estar autenticado.");

  const { data, error } = await supabase.functions.invoke("bitrix-events-bind-v2", {
    body: { tenantId: session.data.session?.user?.id },
  });
  if (error) throw new Error(error.message || "Falha ao vincular eventos");
  return data as { success: boolean; message: string };
}

export async function syncBitrixLeads() {
  const session = await supabase.auth.getSession();
  const accessToken = session.data.session?.access_token;
  if (!accessToken) throw new Error("Você precisa estar autenticado.");

  const { data, error } = await supabase.functions.invoke("bitrix-sync", {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (error) throw new Error(error.message || "Falha ao sincronizar leads");
  return data as { success: boolean; imported?: number };
}
