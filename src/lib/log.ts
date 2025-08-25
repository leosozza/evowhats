
import { supabase } from "@/integrations/supabase/client";

export interface StructuredLog {
  tenantId?: string;
  instanceId?: string;
  conversationId?: string;
  chatId?: string;
  direction?: 'in' | 'out';
  provider?: 'evolution' | 'bitrix' | 'system';
  msgKey?: string;
  category: 'INBOUND' | 'OUTBOUND' | 'OL' | 'EVO' | 'BIND' | 'SECURITY';
  valid_signature?: boolean;
  data?: any;
}

export async function logStructured(log: StructuredLog) {
  try {
    await supabase.functions.invoke('log-structured-event', {
      body: log
    });
  } catch (error) {
    console.error('[log] Failed to log structured event:', error);
  }
}

export function createLogger(defaultContext: Partial<StructuredLog>) {
  return (log: Partial<StructuredLog> & { category: StructuredLog['category'] }) => {
    return logStructured({ ...defaultContext, ...log });
  };
}
