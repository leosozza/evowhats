
-- Create the complete database schema for Evowhats backend

-- Tenants table (Bitrix portals)
CREATE TABLE tenants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  portal_url TEXT NOT NULL UNIQUE,
  client_id TEXT NOT NULL,
  client_secret TEXT NOT NULL,
  installed_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Bitrix tokens per tenant
CREATE TABLE bitrix_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  access_token TEXT NOT NULL,
  refresh_token TEXT,
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
  scope TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- WhatsApp instances (Evolution API instances)
CREATE TABLE wa_instances (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  provider TEXT NOT NULL DEFAULT 'evo' CHECK (provider IN ('evo', 'wpp', 'cloud')),
  label TEXT NOT NULL,
  phone_hint TEXT,
  status TEXT NOT NULL DEFAULT 'inactive' CHECK (status IN ('inactive', 'qr_required', 'connecting', 'active', 'error')),
  config_json JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Contacts (phone numbers with optional CRM linkage)
CREATE TABLE contacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  phone_e164 TEXT NOT NULL,
  wa_jid TEXT,
  name TEXT,
  bitrix_entity_type TEXT CHECK (bitrix_entity_type IN ('lead', 'contact', 'deal')),
  bitrix_id INTEGER,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  UNIQUE(tenant_id, phone_e164)
);

-- Conversations (chat sessions)
CREATE TABLE conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  instance_id UUID NOT NULL REFERENCES wa_instances(id) ON DELETE CASCADE,
  contact_id UUID NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  openlines_chat_id TEXT,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'pending', 'closed')),
  last_message_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Messages in conversations
CREATE TABLE messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  direction TEXT NOT NULL CHECK (direction IN ('in', 'out')),
  type TEXT NOT NULL DEFAULT 'text' CHECK (type IN ('text', 'image', 'audio', 'video', 'file', 'template')),
  text TEXT,
  file_url TEXT,
  mime_type TEXT,
  wa_message_id TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Conversation assignments to users/agents
CREATE TABLE assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL, -- Bitrix user ID or internal ID
  assigned_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Webhook logs for debugging
CREATE TABLE webhook_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider TEXT NOT NULL,
  payload_json JSONB NOT NULL,
  received_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  valid_signature BOOLEAN DEFAULT false
);

-- Indexes for performance
CREATE INDEX idx_bitrix_tokens_tenant_id ON bitrix_tokens(tenant_id);
CREATE INDEX idx_wa_instances_tenant_id ON wa_instances(tenant_id);
CREATE INDEX idx_contacts_tenant_phone ON contacts(tenant_id, phone_e164);
CREATE INDEX idx_conversations_tenant_instance ON conversations(tenant_id, instance_id);
CREATE INDEX idx_conversations_openlines_chat ON conversations(openlines_chat_id) WHERE openlines_chat_id IS NOT NULL;
CREATE INDEX idx_messages_conversation ON messages(conversation_id);
CREATE INDEX idx_messages_wa_message_id ON messages(wa_message_id) WHERE wa_message_id IS NOT NULL;
CREATE INDEX idx_messages_created_at ON messages(created_at);
CREATE INDEX idx_webhook_logs_provider_received ON webhook_logs(provider, received_at);

-- Triggers for updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_tenants_updated_at BEFORE UPDATE ON tenants FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_bitrix_tokens_updated_at BEFORE UPDATE ON bitrix_tokens FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_wa_instances_updated_at BEFORE UPDATE ON wa_instances FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_contacts_updated_at BEFORE UPDATE ON contacts FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_conversations_updated_at BEFORE UPDATE ON conversations FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
