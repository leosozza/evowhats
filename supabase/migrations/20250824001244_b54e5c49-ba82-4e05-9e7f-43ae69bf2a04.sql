
-- Adicionar colunas faltantes e ajustes no schema
ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS wa_message_id TEXT;
ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS pending_ol BOOLEAN DEFAULT false;

-- Índices únicos para idempotência
CREATE UNIQUE INDEX IF NOT EXISTS idx_messages_tenant_evolution_id 
ON messages(tenant_id, evolution_message_id) 
WHERE evolution_message_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_messages_tenant_bitrix_id 
ON messages(tenant_id, bitrix_message_id) 
WHERE bitrix_message_id IS NOT NULL;

-- Função para resolver tenant por portal_url (para webhooks)
CREATE OR REPLACE FUNCTION get_tenant_by_portal(portal_url TEXT)
RETURNS UUID
LANGUAGE SQL
SECURITY DEFINER
STABLE
AS $$
SELECT id FROM tenants WHERE tenants.portal_url = $1 LIMIT 1;
$$;

-- Função para resolver binding por instance_id
CREATE OR REPLACE FUNCTION get_line_id_by_instance(tenant_uuid UUID, instance_uuid UUID)
RETURNS TEXT
LANGUAGE SQL
SECURITY DEFINER
STABLE
AS $$
SELECT line_id FROM open_channel_bindings 
WHERE tenant_id = tenant_uuid AND instance_id = instance_uuid 
LIMIT 1;
$$;

-- Função para resolver instance_id por conversation
CREATE OR REPLACE FUNCTION get_instance_by_conversation(conv_id UUID)
RETURNS UUID
LANGUAGE SQL
SECURITY DEFINER
STABLE
AS $$
SELECT instance_id FROM conversations WHERE id = conv_id LIMIT 1;
$$;

-- Adicionar policy para service functions acessarem tenants
CREATE POLICY IF NOT EXISTS "Service functions can read tenants" ON public.tenants
FOR SELECT USING (
  current_setting('role') = 'service_role' OR
  EXISTS (SELECT 1 FROM auth.users WHERE auth.uid() = auth.users.id)
);

-- Policy para webhook_logs permitir updates pelo service
CREATE POLICY IF NOT EXISTS "Service can update webhook_logs" ON public.webhook_logs
FOR UPDATE USING (current_setting('role') = 'service_role');

-- Migrar dados existentes user_id para tenant_id (se necessário)
DO $$
BEGIN
  -- Criar tenant padrão se não existir baseado em user_configurations
  IF NOT EXISTS (SELECT 1 FROM tenants LIMIT 1) THEN
    INSERT INTO tenants (portal_url, client_id, client_secret, name)
    SELECT 
      COALESCE(bitrix_portal_url, 'https://default.bitrix24.com'),
      'default_client_id',
      'default_client_secret', 
      'Default Tenant'
    FROM user_configurations 
    LIMIT 1
    ON CONFLICT (portal_url) DO NOTHING;
  END IF;
END
$$;
