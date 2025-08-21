
import { supabase } from "@/integrations/supabase/client";

export interface EvolutionInstanceConfig {
  baseUrl: string;
  apiKey: string;
  instanceName: string;
}

export async function getOrCreateInstanceForLine(
  lineId: string, 
  lineName: string
): Promise<{ success: boolean; instanceName?: string; error?: string }> {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error("Usuário não autenticado");

    // Check if session already exists for this line
    const { data: existingSession } = await supabase
      .from('wa_sessions')
      .select('evo_instance_id')
      .eq('user_id', user.id)
      .eq('bitrix_line_id', lineId)
      .single();

    if (existingSession) {
      return { 
        success: true, 
        instanceName: existingSession.evo_instance_id 
      };
    }

    // Generate unique instance name for this line
    const instanceName = `bitrix_line_${lineId}_${Date.now()}`;

    // Create new session record
    const { error: insertError } = await supabase
      .from('wa_sessions')
      .insert({
        user_id: user.id,
        bitrix_line_id: lineId,
        bitrix_line_name: lineName,
        evo_instance_id: instanceName,
        status: 'PENDING_QR'
      });

    if (insertError) throw insertError;

    return { 
      success: true, 
      instanceName 
    };

  } catch (error: any) {
    console.error('[evolutionInstanceManager] Error:', error);
    return { 
      success: false, 
      error: error.message || 'Erro ao criar instância' 
    };
  }
}

export async function updateSessionStatus(
  lineId: string, 
  status: string, 
  qrCode?: string
): Promise<void> {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error("Usuário não autenticado");

    const updateData: any = {
      status,
      last_sync_at: new Date().toISOString()
    };

    if (qrCode) {
      updateData.qr_code = qrCode;
    }

    await supabase
      .from('wa_sessions')
      .update(updateData)
      .eq('user_id', user.id)
      .eq('bitrix_line_id', lineId);

  } catch (error) {
    console.error('[evolutionInstanceManager] Update error:', error);
  }
}

export async function getSessionByLineId(lineId: string) {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error("Usuário não autenticado");

    const { data, error } = await supabase
      .from('wa_sessions')
      .select('*')
      .eq('user_id', user.id)
      .eq('bitrix_line_id', lineId)
      .single();

    if (error) throw error;
    return data;

  } catch (error) {
    console.error('[evolutionInstanceManager] Get session error:', error);
    return null;
  }
}
