
import { supabase } from "@/integrations/supabase/client";

export type WaSession = {
  id: string;
  user_id: string;
  bitrix_line_id: string;
  evo_instance_id: string;
  status: string | null;
  qr_code: string | null;
  last_sync_at: string | null;
  created_at: string;
  updated_at: string;
};

export async function listSessionsForLines(lineIds: string[]): Promise<Record<string, WaSession>> {
  if (!lineIds || lineIds.length === 0) return {};
  const { data: auth } = await supabase.auth.getUser();
  const uid = auth.user?.id;
  if (!uid) throw new Error("Usuário não autenticado");

  const { data, error } = await supabase
    .from("wa_sessions")
    .select("*")
    .eq("user_id", uid)
    .in("bitrix_line_id", lineIds);

  if (error) throw error;

  const map: Record<string, WaSession> = {};
  (data || []).forEach((row: any) => {
    map[row.bitrix_line_id] = row as WaSession;
  });
  return map;
}

export async function upsertSessionBinding(lineId: string, instanceName: string) {
  const { data: auth } = await supabase.auth.getUser();
  const uid = auth.user?.id;
  if (!uid) throw new Error("Usuário não autenticado");

  const payload = {
    user_id: uid,
    bitrix_line_id: lineId,
    evo_instance_id: instanceName,
    status: "PENDING_QR",
    updated_at: new Date().toISOString(),
  };

  // Try update existing
  const { data: existing } = await supabase
    .from("wa_sessions")
    .select("id")
    .eq("user_id", uid)
    .eq("bitrix_line_id", lineId)
    .maybeSingle();

  if (existing?.id) {
    const { error } = await supabase.from("wa_sessions").update(payload).eq("id", existing.id);
    if (error) throw error;
  } else {
    const { error } = await supabase.from("wa_sessions").insert({ ...payload, created_at: new Date().toISOString() });
    if (error) throw error;
  }

  return true;
}
