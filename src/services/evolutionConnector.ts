
import { supabase } from "@/integrations/supabase/client";

type LineParams = { lineId: string; lineName?: string };

export async function ensureLineSession(params: LineParams) {
  const { data, error } = await supabase.functions.invoke("evolution-connector-v2", {
    body: { action: "ensure_line_session", lineId: params.lineId },
  });
  if (error) throw error;
  if (data?.error) throw new Error(data.error);
  return data;
}

export async function startSessionForLine(params: LineParams) {
  const { data, error } = await supabase.functions.invoke("evolution-connector-v2", {
    body: { action: "start_session_for_line", lineId: params.lineId },
  });
  if (error) throw error;
  if (data?.error) throw new Error(data.error);
  return data;
}

export async function getStatusForLine(params: LineParams) {
  const { data, error } = await supabase.functions.invoke("evolution-connector-v2", {
    body: { action: "get_status_for_line", lineId: params.lineId },
  });
  if (error) throw error;
  if (data?.error) throw new Error(data.error);
  return data;
}

export async function getQrForLine(params: LineParams) {
  const { data, error } = await supabase.functions.invoke("evolution-connector-v2", {
    body: { action: "get_qr_for_line", lineId: params.lineId },
  });
  if (error) throw error;
  if (data?.error) throw new Error(data.error);
  return data;
}

export async function testSendMessage(lineId: string, to: string, text?: string) {
  const { data, error } = await supabase.functions.invoke("evolution-connector-v2", {
    body: { action: "test_send", lineId, to, text },
  });
  if (error) throw error;
  if (data?.error) throw new Error(data.error);
  return data;
}

export async function bindLineToChannel(instanceId: string, lineId: string) {
  const { data, error } = await supabase.functions.invoke("evolution-connector-v2", {
    body: { action: "bind_line", instanceId, lineId },
  });
  if (error) throw error;
  if (data?.error && !data?.warn) throw new Error(data.error);
  return data;
}
