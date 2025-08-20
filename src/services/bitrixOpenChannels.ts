
import { supabase } from "@/integrations/supabase/client";

const FUNCTIONS_BASE = "https://twqcybbjyhcokcrdfgkk.functions.supabase.co";

/**
 * Retorna a URL do webhook público para configurar no Open Channels no Bitrix24.
 * É a mesma para todos os usuários; o app detecta o usuário via portal_url no payload.
 */
export function getOpenLinesWebhookUrl() {
  return `${FUNCTIONS_BASE}/bitrix-openlines-webhook`;
}

export type BitrixChannel = {
  id: string;
  user_id: string;
  channel_id: string;
  channel_name: string;
  channel_type: string;
  is_active: boolean | null;
  webhook_url: string | null;
  created_at: string;
  updated_at: string;
};

/**
 * Lista canais do usuário autenticado
 */
export async function listBitrixChannels() {
  const { data: auth } = await supabase.auth.getUser();
  const uid = auth.user?.id;
  if (!uid) throw new Error("Usuário não autenticado");

  const { data, error } = await supabase
    .from("bitrix_channels")
    .select("*")
    .eq("user_id", uid)
    .order("created_at", { ascending: false })
    .returns<BitrixChannel[]>();

  if (error) throw error;
  return data ?? [];
}

/**
 * Cria/atualiza um canal para o usuário atual
 */
export async function upsertBitrixChannel(params: { channel_id: string; channel_name: string }) {
  const { data: auth } = await supabase.auth.getUser();
  const uid = auth.user?.id;
  if (!uid) throw new Error("Usuário não autenticado");

  const webhook_url = getOpenLinesWebhookUrl();

  const payload = {
    user_id: uid,
    channel_id: params.channel_id,
    channel_name: params.channel_name,
    channel_type: "whatsapp",
    is_active: true,
    webhook_url,
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await supabase
    .from("bitrix_channels")
    .upsert(payload, { onConflict: "user_id,channel_id" })
    .select("*")
    .single<BitrixChannel>();

  if (error) throw error;
  return data;
}
