
-- Garantir que as tabelas têm as colunas necessárias para observabilidade
ALTER TABLE public.conversations 
ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'open',
ADD COLUMN IF NOT EXISTS assigned_user_id TEXT;

ALTER TABLE public.messages 
ADD COLUMN IF NOT EXISTS delivery_status TEXT DEFAULT 'queued',
ADD COLUMN IF NOT EXISTS retry_count INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS last_retry_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS error_details TEXT;

-- Índices para performance
CREATE INDEX IF NOT EXISTS idx_conversations_status ON conversations(status);
CREATE INDEX IF NOT EXISTS idx_messages_delivery_status ON messages(delivery_status);

-- Confirmar políticas RLS para webhook_logs
ALTER TABLE public.webhook_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY IF NOT EXISTS "Service can manage webhook_logs" 
ON public.webhook_logs
FOR ALL
USING (current_setting('role') = 'service_role');

-- Política para contacts
ALTER TABLE public.contacts ENABLE ROW LEVEL SECURITY;

CREATE POLICY IF NOT EXISTS "Users can manage contacts for their tenant" 
ON public.contacts
FOR ALL
USING (
  tenant_id IN (
    SELECT id FROM tenants WHERE tenants.id = contacts.tenant_id
  )
);

CREATE POLICY IF NOT EXISTS "Service can manage contacts" 
ON public.contacts
FOR ALL
USING (current_setting('role') = 'service_role');

-- Função para log estruturado
CREATE OR REPLACE FUNCTION log_structured_event(
  category TEXT,
  tenant_uuid UUID DEFAULT NULL,
  instance_uuid UUID DEFAULT NULL,
  conversation_uuid UUID DEFAULT NULL,
  chat_id TEXT DEFAULT NULL,
  direction TEXT DEFAULT NULL,
  provider TEXT DEFAULT NULL,
  msg_key TEXT DEFAULT NULL,
  event_data JSONB DEFAULT '{}'::jsonb
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  log_id UUID;
BEGIN
  INSERT INTO webhook_logs (
    provider,
    payload_json,
    valid_signature,
    received_at
  ) VALUES (
    COALESCE(provider, 'system'),
    jsonb_build_object(
      'category', category,
      'tenantId', tenant_uuid,
      'instanceId', instance_uuid,
      'conversationId', conversation_uuid,
      'chatId', chat_id,
      'direction', direction,
      'provider', provider,
      'msgKey', msg_key,
      'data', event_data
    ),
    true,
    now()
  ) RETURNING id INTO log_id;
  
  RETURN log_id;
END;
$$;
