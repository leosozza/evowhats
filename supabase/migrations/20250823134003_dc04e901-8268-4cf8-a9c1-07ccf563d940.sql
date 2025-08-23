
-- Criar tabelas para multi-tenancy e vínculos explícitos
CREATE TABLE IF NOT EXISTS public.tenants (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    portal_url TEXT NOT NULL UNIQUE,
    client_id TEXT NOT NULL,
    client_secret TEXT NOT NULL,
    name TEXT,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- Tabela de tokens Bitrix por tenant
CREATE TABLE IF NOT EXISTS public.bitrix_tokens (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    access_token TEXT,
    refresh_token TEXT,
    expires_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(tenant_id)
);

-- Tabela de instâncias WhatsApp
CREATE TABLE IF NOT EXISTS public.wa_instances (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    provider TEXT NOT NULL DEFAULT 'evolution',
    label TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'inactive',
    config_json JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(tenant_id, label)
);

-- Tabela de vínculos Instância ↔ Canal Aberto (nova)
CREATE TABLE IF NOT EXISTS public.open_channel_bindings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    instance_id UUID NOT NULL REFERENCES wa_instances(id) ON DELETE CASCADE,
    line_id TEXT NOT NULL,
    created_by UUID NOT NULL REFERENCES auth.users(id),
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Tabela de contatos
CREATE TABLE IF NOT EXISTS public.contacts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    phone_e164 TEXT NOT NULL,
    wa_jid TEXT,
    name TEXT,
    avatar_url TEXT,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(tenant_id, phone_e164)
);

-- Tabela de conversas
CREATE TABLE IF NOT EXISTS public.conversations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    instance_id UUID NOT NULL REFERENCES wa_instances(id) ON DELETE CASCADE,
    contact_id UUID NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
    status TEXT NOT NULL DEFAULT 'open',
    openlines_chat_id TEXT,
    assigned_to UUID REFERENCES auth.users(id),
    last_message_at TIMESTAMPTZ DEFAULT now(),
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- Tabela de mensagens
CREATE TABLE IF NOT EXISTS public.messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    direction TEXT NOT NULL CHECK (direction IN ('in', 'out')),
    type TEXT NOT NULL DEFAULT 'text',
    text TEXT,
    file_url TEXT,
    mime_type TEXT,
    evolution_message_id TEXT,
    bitrix_message_id TEXT,
    delivery_status TEXT DEFAULT 'sent',
    retry_count INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- Tabela de sessões WhatsApp
CREATE TABLE IF NOT EXISTS public.wa_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    instance_id UUID NOT NULL REFERENCES wa_instances(id) ON DELETE CASCADE,
    status TEXT NOT NULL DEFAULT 'inactive',
    qr_payload TEXT,
    last_heartbeat TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(tenant_id, instance_id)
);

-- Tabela de assignments
CREATE TABLE IF NOT EXISTS public.assignments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES auth.users(id),
    assigned_at TIMESTAMPTZ DEFAULT now(),
    assigned_by UUID REFERENCES auth.users(id),
    UNIQUE(conversation_id)
);

-- Tabela de logs de webhook
CREATE TABLE IF NOT EXISTS public.webhook_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    provider TEXT NOT NULL,
    payload_json JSONB NOT NULL,
    valid_signature BOOLEAN DEFAULT true,
    processed_at TIMESTAMPTZ,
    error_message TEXT,
    received_at TIMESTAMPTZ DEFAULT now()
);

-- Índices para performance
CREATE UNIQUE INDEX IF NOT EXISTS uq_binding_tenant_instance ON open_channel_bindings(tenant_id, instance_id);
CREATE INDEX IF NOT EXISTS idx_messages_evolution_id ON messages(tenant_id, evolution_message_id) WHERE evolution_message_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_messages_bitrix_id ON messages(tenant_id, bitrix_message_id) WHERE bitrix_message_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_conversations_openlines_chat ON conversations(tenant_id, openlines_chat_id) WHERE openlines_chat_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_wa_sessions_status ON wa_sessions(tenant_id, status);

-- Habilitar RLS em todas as tabelas
ALTER TABLE public.tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bitrix_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wa_instances ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.open_channel_bindings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wa_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.webhook_logs ENABLE ROW LEVEL SECURITY;

-- Policies para tenants (usuários podem ver/gerenciar seus próprios tenants)
CREATE POLICY "Users can manage their tenants" ON public.tenants
FOR ALL USING (
  EXISTS (
    SELECT 1 FROM auth.users 
    WHERE auth.uid() = auth.users.id
  )
);

-- Policies baseadas em tenant_id
CREATE POLICY "Tenant isolation - bitrix_tokens" ON public.bitrix_tokens
FOR ALL USING (
  tenant_id IN (
    SELECT id FROM tenants 
    WHERE EXISTS (SELECT 1 FROM auth.users WHERE auth.uid() = auth.users.id)
  )
);

CREATE POLICY "Tenant isolation - wa_instances" ON public.wa_instances
FOR ALL USING (
  tenant_id IN (
    SELECT id FROM tenants 
    WHERE EXISTS (SELECT 1 FROM auth.users WHERE auth.uid() = auth.users.id)
  )
);

CREATE POLICY "Tenant isolation - open_channel_bindings" ON public.open_channel_bindings
FOR ALL USING (
  tenant_id IN (
    SELECT id FROM tenants 
    WHERE EXISTS (SELECT 1 FROM auth.users WHERE auth.uid() = auth.users.id)
  )
);

CREATE POLICY "Tenant isolation - contacts" ON public.contacts
FOR ALL USING (
  tenant_id IN (
    SELECT id FROM tenants 
    WHERE EXISTS (SELECT 1 FROM auth.users WHERE auth.uid() = auth.users.id)
  )
);

CREATE POLICY "Tenant isolation - conversations" ON public.conversations
FOR ALL USING (
  tenant_id IN (
    SELECT id FROM tenants 
    WHERE EXISTS (SELECT 1 FROM auth.users WHERE auth.uid() = auth.users.id)
  )
);

CREATE POLICY "Tenant isolation - messages" ON public.messages
FOR ALL USING (
  tenant_id IN (
    SELECT id FROM tenants 
    WHERE EXISTS (SELECT 1 FROM auth.users WHERE auth.uid() = auth.users.id)
  )
);

CREATE POLICY "Tenant isolation - wa_sessions" ON public.wa_sessions
FOR ALL USING (
  tenant_id IN (
    SELECT id FROM tenants 
    WHERE EXISTS (SELECT 1 FROM auth.users WHERE auth.uid() = auth.users.id)
  )
);

CREATE POLICY "Tenant isolation - assignments" ON public.assignments
FOR ALL USING (
  tenant_id IN (
    SELECT id FROM tenants 
    WHERE EXISTS (SELECT 1 FROM auth.users WHERE auth.uid() = auth.users.id)
  )
);

-- Policy mais permissiva para webhook_logs (service functions precisam escrever)
CREATE POLICY "Service can write webhook_logs" ON public.webhook_logs
FOR INSERT WITH CHECK (true);

CREATE POLICY "Users can read webhook_logs" ON public.webhook_logs
FOR SELECT USING (
  EXISTS (SELECT 1 FROM auth.users WHERE auth.uid() = auth.users.id)
);

-- Triggers para updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_tenants_updated_at BEFORE UPDATE ON tenants
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_bitrix_tokens_updated_at BEFORE UPDATE ON bitrix_tokens
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_wa_instances_updated_at BEFORE UPDATE ON wa_instances
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_contacts_updated_at BEFORE UPDATE ON contacts
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_conversations_updated_at BEFORE UPDATE ON conversations
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_messages_updated_at BEFORE UPDATE ON messages
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_wa_sessions_updated_at BEFORE UPDATE ON wa_sessions
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
