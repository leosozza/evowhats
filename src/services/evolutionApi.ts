
import { supabase } from "@/integrations/supabase/client";

export interface InstanceInfo {
  instanceName: string;
  status: string;
  qrCode?: string;
  owner?: string;
  lineId?: string;
}

export interface ConnectionTest {
  success: boolean;
  message: string;
  instanceInfo?: InstanceInfo;
}

export interface MultiInstanceStatus {
  instances: InstanceInfo[];
  totalConnected: number;
  totalDisconnected: number;
}

export async function testEvolutionConnection(
  baseUrl: string,
  apiKey: string,
  instanceName: string
): Promise<ConnectionTest> {
  try {
    // Test connection via our edge function
    const response = await supabase.functions.invoke('evolution-connector-v2', {
      body: {
        action: 'get_status',
        instanceName
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

export async function getMultiInstanceStatus(): Promise<MultiInstanceStatus> {
  try {
    const response = await supabase.functions.invoke('evolution-connector-v2', {
      body: {
        action: 'get_all_instances'
      }
    });

    if (response.error) {
      throw new Error(response.error.message);
    }

    if (response.data?.ok) {
      const instances = response.data.data?.instances || [];
      const connected = instances.filter((i: any) => i.status === 'open').length;
      const disconnected = instances.length - connected;
      
      return {
        instances: instances.map((instance: any) => ({
          instanceName: instance.name,
          status: instance.status || 'unknown',
          owner: instance.owner || 'N/A',
          lineId: instance.lineId || null
        })),
        totalConnected: connected,
        totalDisconnected: disconnected
      };
    } else {
      throw new Error(response.data?.message || 'Erro ao obter status das instâncias');
    }
  } catch (error: any) {
    console.error('[evolutionApi] Multi instance status error:', error);
    throw error;
  }
}

export async function createInstanceForLine(lineId: string, lineName: string): Promise<{ success: boolean; message: string; instanceName?: string }> {
  try {
    // Generate instance name based on line
    const instanceName = `bitrix_line_${lineId}`;
    
    const response = await supabase.functions.invoke('evolution-connector-v2', {
      body: {
        action: 'create_instance',
        instanceName,
        lineId,
        lineName
      }
    });

    if (response.error) {
      return {
        success: false,
        message: `Erro ao criar instância: ${response.error.message}`
      };
    }

    if (response.data?.ok) {
      return {
        success: true,
        message: `Instância "${instanceName}" criada com sucesso para a linha "${lineName}"`,
        instanceName
      };
    } else {
      return {
        success: false,
        message: response.data?.message || 'Erro ao criar instância'
      };
    }
  } catch (error: any) {
    console.error('[evolutionApi] Create instance error:', error);
    return {
      success: false,
      message: error.message || 'Erro inesperado ao criar instância'
    };
  }
}

export async function getInstanceQRCode(instanceName?: string): Promise<{ success: boolean; qrCode?: string; message: string }> {
  try {
    const response = await supabase.functions.invoke('evolution-connector-v2', {
      body: {
        action: 'get_qr',
        instanceName
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

export async function startEvolutionSession(instanceName?: string): Promise<{ success: boolean; message: string }> {
  try {
    const response = await supabase.functions.invoke('evolution-connector-v2', {
      body: {
        action: 'start_session',
        instanceName
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

export async function deleteInstance(instanceName: string): Promise<{ success: boolean; message: string }> {
  try {
    const response = await supabase.functions.invoke('evolution-connector-v2', {
      body: {
        action: 'delete_instance',
        instanceName
      }
    });

    if (response.error) {
      return {
        success: false,
        message: `Erro ao deletar instância: ${response.error.message}`
      };
    }

    if (response.data?.ok) {
      return {
        success: true,
        message: `Instância "${instanceName}" deletada com sucesso`
      };
    } else {
      return {
        success: false,
        message: response.data?.message || 'Erro ao deletar instância'
      };
    }
  } catch (error: any) {
    console.error('[evolutionApi] Delete instance error:', error);
    return {
      success: false,
      message: error.message || 'Erro inesperado ao deletar instância'
    };
  }
}
