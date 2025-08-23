
import { supabase } from "@/integrations/supabase/client";

export interface ConversationWithDetails {
  id: string;
  user_id: string;
  contact_phone: string;
  contact_name: string | null;
  bitrix_chat_id: string | null;
  evolution_instance: string | null;
  last_message_at: string | null;
  created_at: string;
  updated_at: string;
  messages?: MessageWithDetails[];
}

export interface MessageWithDetails {
  id: string;
  conversation_id: string;
  direction: string;
  message_type: string;
  content: string;
  media_url: string | null;
  evolution_message_id: string | null;
  bitrix_message_id: string | null;
  sender_name: string | null;
  status: string | null;
  created_at: string;
}

export interface InstanceStatus {
  instance_name: string;
  instance_status: 'disconnected' | 'qr_required' | 'connecting' | 'connected' | 'error';
  phone_hint?: string;
  qr_code?: string;
  last_seen_at?: string;
}

export interface BitrixIntegrationStatus {
  connected: boolean;
  portal_url?: string;
  events_bound: boolean;
  openlines_configured: boolean;
}

/**
 * Get all conversations with details
 */
export async function getConversations(): Promise<ConversationWithDetails[]> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('User not authenticated');

  const { data, error } = await supabase
    .from('conversations')
    .select('*')
    .eq('user_id', user.id)
    .order('last_message_at', { ascending: false });

  if (error) {
    console.error('[evowhatsApi] Error fetching conversations:', error);
    throw new Error(`Failed to fetch conversations: ${error.message}`);
  }

  return data || [];
}

/**
 * Get messages for a specific conversation
 */
export async function getMessages(conversationId: string): Promise<MessageWithDetails[]> {
  const { data, error } = await supabase
    .from('messages')
    .select('*')
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: true });

  if (error) {
    console.error('[evowhatsApi] Error fetching messages:', error);
    throw new Error(`Failed to fetch messages: ${error.message}`);
  }

  return data || [];
}

/**
 * Send a message via backend
 */
export async function sendMessage(conversationId: string, text: string): Promise<void> {
  // First get the conversation to get the phone and instance
  const { data: conversation, error: convError } = await supabase
    .from('conversations')
    .select('*')
    .eq('id', conversationId)
    .single();

  if (convError || !conversation) {
    throw new Error('Conversation not found');
  }

  // Send via Evolution API
  const { data, error } = await supabase.functions.invoke('evolution-connector', {
    body: {
      action: 'send_message',
      instance: conversation.evolution_instance || 'default',
      number: conversation.contact_phone,
      text
    }
  });

  if (error) {
    throw new Error(`Failed to send message: ${error.message}`);
  }

  if (!data?.success) {
    throw new Error(`Failed to send message: ${data?.error || 'Unknown error'}`);
  }

  // Add to our database
  await supabase.from('messages').insert({
    conversation_id: conversationId,
    direction: 'out',
    message_type: 'text',
    content: text,
    status: 'sent',
    created_at: new Date().toISOString(),
  });

  // Update conversation timestamp
  await supabase.from('conversations').update({
    last_message_at: new Date().toISOString()
  }).eq('id', conversationId);
}

/**
 * Get Evolution instances status
 */
export async function getInstancesStatus(): Promise<InstanceStatus[]> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('User not authenticated');

  const { data, error } = await supabase
    .from('evolution_instances')
    .select('*')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('[evowhatsApi] Error fetching instances:', error);
    throw new Error(`Failed to fetch instances: ${error.message}`);
  }

  return (data || []).map(instance => ({
    instance_name: instance.instance_name,
    instance_status: instance.instance_status as any,
    last_seen_at: instance.last_seen_at,
  }));
}

/**
 * Create or update an Evolution instance
 */
export async function createInstance(instanceName: string, config: any = {}): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('User not authenticated');

  const { error } = await supabase.from('evolution_instances').upsert({
    user_id: user.id,
    instance_name: instanceName,
    instance_status: 'disconnected',
    updated_at: new Date().toISOString(),
  }, {
    onConflict: 'user_id,instance_name'
  });

  if (error) {
    throw new Error(`Failed to create instance: ${error.message}`);
  }

  // Try to create/start the instance in Evolution API
  try {
    await supabase.functions.invoke('evolution-connector', {
      body: {
        action: 'create_instance',
        instance: instanceName,
        config
      }
    });
  } catch (e) {
    console.warn('[evowhatsApi] Warning: Could not create instance in Evolution API:', e);
  }
}

/**
 * Get Bitrix integration status
 */
export async function getBitrixStatus(): Promise<BitrixIntegrationStatus> {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return { connected: false, events_bound: false, openlines_configured: false };
    }

    // Check if we have valid credentials
    const { data: credentials } = await supabase
      .from('bitrix_credentials')
      .select('*')
      .eq('user_id', user.id)
      .eq('is_active', true)
      .limit(1)
      .maybeSingle();

    const connected = !!credentials?.access_token;
    
    return {
      connected,
      portal_url: credentials?.portal_url,
      events_bound: connected, // Assume events are bound if connected
      openlines_configured: connected, // Assume configured if connected
    };
  } catch (error) {
    console.error('[evowhatsApi] Error checking Bitrix status:', error);
    return { connected: false, events_bound: false, openlines_configured: false };
  }
}

/**
 * Bind Bitrix events (webhooks)
 */
export async function bindBitrixEvents(): Promise<void> {
  const { data, error } = await supabase.functions.invoke('bitrix-events-bind', {
    body: {}
  });

  if (error) {
    throw new Error(`Failed to bind events: ${error.message}`);
  }

  if (!data?.success) {
    throw new Error(`Failed to bind events: ${data?.error || 'Unknown error'}`);
  }
}

/**
 * Test Open Lines integration
 */
export async function testOpenLines(message: string = "Test message from Evowhats"): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('User not authenticated');

  const { data, error } = await supabase.functions.invoke('bitrix-openlines', {
    body: {
      action: 'openlines.sendMessage',
      payload: {
        tenantId: user.id,
        text: message,
        ensure: {
          tenantId: user.id,
          contact: { phone: '+5511999999999', name: 'Test Contact' }
        }
      }
    }
  });

  if (error) {
    throw new Error(`OpenLines test failed: ${error.message}`);
  }

  if (!data?.success) {
    throw new Error(`OpenLines test failed: ${data?.error || 'Unknown error'}`);
  }
}
