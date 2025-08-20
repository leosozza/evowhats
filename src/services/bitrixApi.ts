
import { supabase } from "@/integrations/supabase/client";

export interface BitrixConnectionTest {
  success: boolean;
  message: string;
  userInfo?: {
    ID: string;
    NAME: string;
    LAST_NAME: string;
    EMAIL: string;
  };
}

export async function testBitrixConnection(
  portalUrl: string,
  webhookUrl: string,
  userId: string
): Promise<BitrixConnectionTest> {
  console.log("[bitrixApi] Testing connection to:", portalUrl);

  try {
    // Validate inputs
    if (!portalUrl || !webhookUrl || !userId) {
      return {
        success: false,
        message: "Todos os campos são obrigatórios para testar a conexão."
      };
    }

    // Validate portal URL format
    if (!portalUrl.includes('bitrix24.')) {
      return {
        success: false,
        message: "URL do portal deve conter 'bitrix24.'"
      };
    }

    // Normalize webhook URL to avoid double slashes
    const sanitizedWebhook = webhookUrl.replace(/\/+$/, '');
    const method = 'user.get';
    const testUrl = `${sanitizedWebhook}/${method}?ID=${encodeURIComponent(userId)}`;

    console.log("[bitrixApi] Making test request to:", testUrl);
    
    const response = await fetch(testUrl, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      return {
        success: false,
        message: `Erro HTTP: ${response.status} - ${response.statusText}`
      };
    }

    const data = await response.json();
    console.log("[bitrixApi] Response data:", data);

    // Check if Bitrix returned an error
    if (data?.error) {
      return {
        success: false,
        message: `Erro do Bitrix24: ${data.error_description || data.error}`
      };
    }

    // Handle both object and array responses
    let userData: any | null = null;

    if (Array.isArray(data?.result)) {
      if (data.result.length === 0) {
        return {
          success: false,
          message: "Usuário não encontrado no Bitrix24."
        };
      }
      userData = data.result[0];
    } else if (data?.result && typeof data.result === 'object') {
      userData = data.result;
    }

    if (userData && userData.ID) {
      return {
        success: true,
        message: "Conexão com Bitrix24 realizada com sucesso!",
        userInfo: {
          ID: userData.ID,
          NAME: userData.NAME,
          LAST_NAME: userData.LAST_NAME,
          EMAIL: userData.EMAIL
        }
      };
    }

    return {
      success: false,
      message: "Resposta inesperada da API do Bitrix24."
    };

  } catch (error) {
    console.error("[bitrixApi] Connection test error:", error);
    
    if (error instanceof TypeError && error.message.includes('fetch')) {
      return {
        success: false,
        message: "Erro de conectividade. Verifique a URL do webhook."
      };
    }

    return {
      success: false,
      message: `Erro ao testar conexão: ${error instanceof Error ? error.message : 'Erro desconhecido'}`
    };
  }
}
