
import { supabase } from "@/integrations/supabase/client";

type LineParams = { bitrix_line_id: string; bitrix_line_name?: string };

export async function ensureLineSession(params: LineParams) {
  const { data, error } = await supabase.functions.invoke("evolution-connector", {
    body: { action: "ensure_line_session", ...params },
  });
  if (error) throw error;
  if (data?.error) throw new Error(data.error);
  return data;
}

export async function startSessionForLine(params: LineParams) {
  const { data, error } = await supabase.functions.invoke("evolution-connector", {
    body: { action: "start_session_for_line", ...params },
  });
  if (error) throw error;
  if (data?.error) throw new Error(data.error);
  return data;
}

export async function getStatusForLine(params: LineParams) {
  const { data, error } = await supabase.functions.invoke("evolution-connector", {
    body: { action: "get_status_for_line", ...params },
  });
  if (error) throw error;
  if (data?.error) throw new Error(data.error);
  return data;
}

export async function getQrForLine(params: LineParams) {
  const { data, error } = await supabase.functions.invoke("evolution-connector", {
    body: { action: "get_qr_for_line", ...params },
  });
  if (error) throw error;
  if (data?.error) throw new Error(data.error);
  return data;
}
