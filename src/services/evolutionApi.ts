
import { supabase } from "@/integrations/supabase/client";

export interface InstanceInfo {
  instanceName: string;
  status: string;
  qrCode?: string;
  owner?: string;
}

export interface ConnectionTest {
  success: boolean;
  message: string;
  instanceInfo?: InstanceInfo;
}

export async function testEvolutionConnection(
  baseUrl: string,
  apiKey: string,
  instanceName: string
): Promise<ConnectionTest> {
  try {
    // Test connection via our edge function
    const response = await supabase.functions.invoke('evolution-connector', {
      body: {
        action: 'get_status'
      }
    });

    if (response.error) {
      return {
        success: false,
        message: `Erro na conexão: ${response.error.message}`
      };
    }

    if (response.data?.ok) {
      const statusData = response.data.data;
      
      return {
        success: true,
        message: `Conectado com sucesso à instância "${instanceName}"`,
        instanceInfo: {
          instanceName,
          status: statusData?.state || 'unknown',
          owner: statusData?.owner || 'N/A'
        }
      };
    } else {
      return {
        success: false,
        message: response.data?.data?.message || 'Erro ao verificar status da instância'
      };
    }
  } catch (error: any) {
    console.error('[evolutionApi] Connection test error:', error);
    
    let errorMessage = 'Erro inesperado na conexão';
    if (error.message?.includes('Evolution API não configurada')) {
      errorMessage = 'Configure a Evolution API nas configurações primeiro';
    } else if (error.message) {
      errorMessage = error.message;
    }
    
    return {
      success: false,
      message: errorMessage
    };
  }
}

export async function getInstanceQRCode(): Promise<{ success: boolean; qrCode?: string; message: string }> {
  try {
    const response = await supabase.functions.invoke('evolution-connector', {
      body: {
        action: 'get_qr'
      }
    });

    if (response.error) {
      return {
        success: false,
        message: `Erro ao obter QR Code: ${response.error.message}`
      };
    }

    if (response.data?.ok) {
      return {
        success: true,
        qrCode: response.data.data?.base64 || response.data.data?.qrcode,
        message: 'QR Code obtido com sucesso'
      };
    } else {
      return {
        success: false,
        message: response.data?.data?.message || 'Erro ao gerar QR Code'
      };
    }
  } catch (error: any) {
    console.error('[evolutionApi] QR Code error:', error);
    return {
      success: false,
      message: error.message || 'Erro inesperado ao obter QR Code'
    };
  }
}

export async function startEvolutionSession(): Promise<{ success: boolean; message: string }> {
  try {
    const response = await supabase.functions.invoke('evolution-connector', {
      body: {
        action: 'start_session'
      }
    });

    if (response.error) {
      return {
        success: false,
        message: `Erro ao iniciar sessão: ${response.error.message}`
      };
    }

    if (response.data?.ok) {
      return {
        success: true,
        message: 'Sessão iniciada com sucesso'
      };
    } else {
      return {
        success: false,
        message: response.data?.data?.message || 'Erro ao iniciar sessão'
      };
    }
  } catch (error: any) {
    console.error('[evolutionApi] Start session error:', error);
    return {
      success: false,
      message: error.message || 'Erro inesperado ao iniciar sessão'
    };
  }
}
