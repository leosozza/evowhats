import { supabase } from "@/integrations/supabase/client";
import { FunctionsHttpError, FunctionsFetchError, FunctionsRelayError } from '@supabase/supabase-js';

export class EvolutionApiError extends Error {
  statusCode: number;
  details: any;
  url?: string;

  constructor(message: string, statusCode: number = 500, details: any = null, url?: string) {
    super(message);
    this.name = 'EvolutionApiError';
    this.statusCode = statusCode;
    this.details = details;
    this.url = url;
  }
}

/**
 * Unified Evolution API caller with detailed error handling
 */
export async function callEvolution(action: string, payload: any = {}) {
  try {
    console.log(JSON.stringify({
      category: 'UI',
      view: 'callEvolution',
      action,
      payload: Object.keys(payload)
    }));

    const { data, error } = await supabase.functions.invoke('evolution-connector-v2', {
      body: { action, ...payload },
    });
    
    if (error) throw error;
    return data;
  } catch (e: any) {
    console.error(`[Evolution ${action}]`, e);
    
    let details: any = null;
    let statusCode = 500;
    let message = String(e);

    if (e instanceof FunctionsHttpError) {
      try {
        details = await e.context.json();
      } catch {
        try {
          details = await e.context.text();
        } catch {
          details = null;
        }
      }
      
      statusCode = details?.statusCode || 500;
      message = details?.error || e.message;
      
      console.error('[Evolution HTTP Error]', {
        action,
        statusCode,
        message,
        details,
        url: details?.url
      });
      
      throw new EvolutionApiError(message, statusCode, details, details?.url);
    }
    
    if (e instanceof FunctionsFetchError) {
      throw new EvolutionApiError(`Network error: ${e.message}`, 500);
    }
    
    if (e instanceof FunctionsRelayError) {
      throw new EvolutionApiError(`Relay error: ${e.message}`, 500);
    }
    
    // Generic error
    throw new EvolutionApiError(message, statusCode);
  }
}

// Convenience methods for common operations
export const evolutionApi = {
  diagnostic: () => callEvolution('diag'),
  
  listInstances: () => callEvolution('list_instances'),
  
  ensureSession: (lineId: string) => 
    callEvolution('ensure_line_session', { lineId }),
  
  startSession: (lineId: string, number?: string) => 
    callEvolution('start_session_for_line', { lineId, number }),
  
  getStatus: (lineId: string) => 
    callEvolution('get_status_for_line', { lineId }),
  
  getQr: (lineId: string) => 
    callEvolution('get_qr_for_line', { lineId }),
  
  testSend: (lineId: string, to: string, text?: string) => 
    callEvolution('test_send', { lineId, to, text }),
  
  bindLine: (instanceId: string, lineId: string) => 
    callEvolution('bind_line', { instanceId, lineId })
};