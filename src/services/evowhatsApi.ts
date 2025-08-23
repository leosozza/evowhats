
import { supabase } from "@/integrations/supabase/client";

export interface ConversationWithDetails {
  id: string;
  tenant_id: string;
  instance_id: string;
  contact_id: string;
  openlines_chat_id: string | null;
  status: 'open' | 'pending' | 'closed';
  last_message_at: string;
  created_at: string;
  updated_at: string;
  contact: {
    id: string;
    phone_e164: string;
    wa_jid: string | null;
    name: string | null;
    bitrix_entity_type: string | null;
    bitrix_id: number | null;
  };
  wa_instance: {
    id: string;
    label: string;
    provider: string;
    status: string;
    phone_hint: string | null;
  };
  messages?: MessageWithDetails[];
}

export interface MessageWithDetails {
  id: string;
  tenant_id: string;
  conversation_id: string;
  direction: 'in' | 'out';
  type: string;
  text: string | null;
  file_url: string | null;
  mime_type: string | null;
  wa_message_id: string | null;
  bitrix_message_id: string | null;
  created_at: string;
}

export interface InstanceStatus {
  label: string;
  status: 'inactive' | 'qr_required' | 'connecting' | 'active' | 'error';
  phone_hint?: string;
  qr_code?: string;
  last_seen?: string;
}

export interface BitrixIntegrationStatus {
  connected: boolean;
  portal_url?: string;
  events_bound: boolean;
  openlines_configured: boolean;
}

/**
 * Get all conversations with contact and instance details
 */
export async function getConversations(): Promise<ConversationWithDetails[]> {
  const { data, error } = await supabase
    .from('conversations')
    .select(`
      *,
      contact:contacts(*),
      wa_instance:wa_instances(*)
    `)
    .order('last_message_at', { ascending: false });

  if (error) {
    console.error('[evowhatsApi] Error fetching conversations:', error);
    throw new Error(`Failed to fetch conversations: ${error.message}`);
  }

  return (data || []).map(conv => ({
    ...conv,
    contact: conv.contact,
    wa_instance: conv.wa_instance,
  }));
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
 * Send a message via backend (useful for testing outside Open Lines)
 */
export async function sendMessage(conversationId: string, text: string): Promise<void> {
  // Get conversation details first
  const { data: conversation, error: convError } = await supabase
    .from('conversations')
    .select(`
      *,
      contact:contacts(*),
      wa_instance:wa_instances(*)
    `)
    .eq('id', conversationId)
    .single();

  if (convError || !conversation) {
    throw new Error('Conversation not found');
  }

  // Send via Evolution API
  const { data, error } = await supabase.functions.invoke('evolution-connector', {
    body: {
      action: 'send_message',
      instance: conversation.wa_instance.label,
      number: conversation.contact.phone_e164,
      text,
      config: conversation.wa_instance.config_json || {}
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
    tenant_id: conversation.tenant_id,
    conversation_id: conversationId,
    direction: 'out',
    type: 'text',
    text,
    created_at: new Date().toISOString(),
  });

  // Update conversation timestamp
  await supabase.from('conversations').update({
    last_message_at: new Date().toISOString()
  }).eq('id', conversationId);
}

/**
 * Get WhatsApp instances status
 */
export async function getInstancesStatus(): Promise<InstanceStatus[]> {
  const { data, error } = await supabase
    .from('wa_instances')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) {
    console.error('[evowhatsApi] Error fetching instances:', error);
    throw new Error(`Failed to fetch instances: ${error.message}`);
  }

  return (data || []).map(instance => ({
    label: instance.label,
    status: instance.status as any,
    phone_hint: instance.phone_hint,
    last_seen: instance.updated_at,
  }));
}

/**
 * Create or update a WhatsApp instance
 */
export async function createInstance(label: string, config: any = {}): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('User not authenticated');

  // For now, use first tenant (should be improved with proper tenant selection)
  const { data: tenant } = await supabase.from('tenants').select('id').limit(1).single();
  if (!tenant) throw new Error('No tenant found');

  const { error } = await supabase.from('wa_instances').upsert({
    tenant_id: tenant.id,
    provider: 'evo',
    label,
    status: 'connecting',
    config_json: config,
    updated_at: new Date().toISOString(),
  }, {
    onConflict: 'tenant_id,label'
  });

  if (error) {
    throw new Error(`Failed to create instance: ${error.message}`);
  }

  // Try to create/start the instance in Evolution API
  try {
    await supabase.functions.invoke('evolution-connector', {
      body: {
        action: 'create_instance',
        instance: label,
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

    // Check if we have valid tokens
    const { data: tenant } = await supabase.from('tenants').select('*').limit(1).single();
    if (!tenant) {
      return { connected: false, events_bound: false, openlines_configured: false };
    }

    const { data: tokens } = await supabase
      .from('bitrix_tokens')
      .select('*')
      .eq('tenant_id', tenant.id)
      .limit(1)
      .single();

    const connected = !!tokens?.access_token;
    
    return {
      connected,
      portal_url: tenant.portal_url,
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
  const { data, error } = await supabase.functions.invoke('bitrix-events-bind', {});

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
export async function testOpenLines(tenantId: string, message: string = "Test message from Evowhats"): Promise<void> {
  const { data, error } = await supabase.functions.invoke('bitrix-openlines', {
    body: {
      action: 'openlines.sendMessage',
      payload: {
        tenantId,
        text: message,
        ensure: {
          tenantId,
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
