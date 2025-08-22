
import { supabase } from "@/integrations/supabase/client";

export interface DBConversation {
  id: string;
  user_id: string;
  contact_phone: string;
  contact_name?: string;
  evolution_instance?: string;
  bitrix_chat_id?: string;
  last_message_at?: string;
  created_at: string;
  updated_at: string;
}

export interface DBMessage {
  id: string;
  conversation_id: string;
  content: string;
  direction: 'in' | 'out';
  message_type?: string;
  sender_name?: string;
  status: 'sent' | 'delivered' | 'read' | 'failed';
  evolution_message_id?: string;
  bitrix_message_id?: string;
  media_url?: string;
  created_at: string;
  updated_at: string;
}

export interface CreateConversationParams {
  userId: string;
  contact_phone: string;
  contact_name?: string;
  evolution_instance?: string;
}

export interface SendMessageParams {
  conversationId: string;
  content: string;
  senderName?: string;
}

export async function fetchConversations(): Promise<DBConversation[]> {
  const { data, error } = await supabase
    .from('conversations')
    .select('*')
    .order('last_message_at', { ascending: false });

  if (error) {
    throw new Error(`Erro ao buscar conversas: ${error.message}`);
  }

  return data || [];
}

export async function fetchMessages(conversationId: string): Promise<DBMessage[]> {
  const { data, error } = await supabase
    .from('messages')
    .select('*')
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: true });

  if (error) {
    throw new Error(`Erro ao buscar mensagens: ${error.message}`);
  }

  return data || [];
}

export async function createConversation(params: CreateConversationParams): Promise<DBConversation> {
  const { data, error } = await supabase
    .from('conversations')
    .insert({
      user_id: params.userId,
      contact_phone: params.contact_phone,
      contact_name: params.contact_name,
      evolution_instance: params.evolution_instance,
      last_message_at: new Date().toISOString()
    })
    .select()
    .single();

  if (error) {
    throw new Error(`Erro ao criar conversa: ${error.message}`);
  }

  return data;
}

export async function sendMessage(params: SendMessageParams): Promise<DBMessage> {
  // Get conversation details to find the evolution instance
  const { data: conversation, error: convError } = await supabase
    .from('conversations')
    .select('contact_phone, evolution_instance')
    .eq('id', params.conversationId)
    .single();

  if (convError) {
    throw new Error(`Conversa não encontrada: ${convError.message}`);
  }

  // Send message via Evolution API if instance is configured
  if (conversation.evolution_instance) {
    try {
      const response = await supabase.functions.invoke('evolution-connector', {
        body: {
          action: 'proxy',
          path: `/message/sendText/${conversation.evolution_instance}`,
          method: 'POST',
          payload: {
            number: conversation.contact_phone,
            text: params.content
          }
        }
      });

      if (!response.data?.ok) {
        console.error('Evolution API error:', response.data);
        throw new Error('Falha ao enviar mensagem via Evolution API');
      }
    } catch (error) {
      console.error('Error sending message via Evolution:', error);
      throw new Error('Erro de conexão com Evolution API');
    }
  }

  // Save message to database
  const { data, error } = await supabase
    .from('messages')
    .insert({
      conversation_id: params.conversationId,
      content: params.content,
      direction: 'out',
      sender_name: params.senderName,
      status: 'sent'
    })
    .select()
    .single();

  if (error) {
    throw new Error(`Erro ao salvar mensagem: ${error.message}`);
  }

  // Update conversation last message time
  await supabase
    .from('conversations')
    .update({ last_message_at: new Date().toISOString() })
    .eq('id', params.conversationId);

  return data;
}
