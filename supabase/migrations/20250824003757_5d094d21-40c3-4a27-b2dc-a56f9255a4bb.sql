
-- 1.1 Garantir compatibilidade entre openlines_chat_id e bitrix_chat_id
ALTER TABLE public.conversations 
ADD COLUMN IF NOT EXISTS openlines_chat_id TEXT;

-- Criar índice para openlines_chat_id
CREATE INDEX IF NOT EXISTS idx_conversations_openlines_chat_id 
ON conversations(openlines_chat_id) 
WHERE openlines_chat_id IS NOT NULL;

-- Trigger para espelhar valores entre openlines_chat_id e bitrix_chat_id
CREATE OR REPLACE FUNCTION sync_chat_ids()
RETURNS TRIGGER AS $$
BEGIN
  -- Se openlines_chat_id mudou e bitrix_chat_id está nulo/diferente
  IF NEW.openlines_chat_id IS DISTINCT FROM OLD.openlines_chat_id 
     AND NEW.openlines_chat_id IS NOT NULL 
     AND (NEW.bitrix_chat_id IS NULL OR NEW.bitrix_chat_id != NEW.openlines_chat_id) THEN
    NEW.bitrix_chat_id = NEW.openlines_chat_id;
  END IF;
  
  -- Se bitrix_chat_id mudou e openlines_chat_id está nulo/diferente
  IF NEW.bitrix_chat_id IS DISTINCT FROM OLD.bitrix_chat_id 
     AND NEW.bitrix_chat_id IS NOT NULL 
     AND (NEW.openlines_chat_id IS NULL OR NEW.openlines_chat_id != NEW.bitrix_chat_id) THEN
    NEW.openlines_chat_id = NEW.bitrix_chat_id;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER sync_chat_ids_trigger
  BEFORE INSERT OR UPDATE ON conversations
  FOR EACH ROW
  EXECUTE FUNCTION sync_chat_ids();

-- 1.2 Garantir colunas para idempotência em messages
ALTER TABLE public.messages 
ADD COLUMN IF NOT EXISTS evolution_message_id TEXT,
ADD COLUMN IF NOT EXISTS bitrix_message_id TEXT,
ADD COLUMN IF NOT EXISTS delivery_status TEXT DEFAULT 'queued';

-- Índices únicos filtrados por tenant para idempotência
CREATE UNIQUE INDEX IF NOT EXISTS uq_messages_tenant_evo_msg 
ON messages(tenant_id, evolution_message_id) 
WHERE evolution_message_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_messages_tenant_btx_msg 
ON messages(tenant_id, bitrix_message_id) 
WHERE bitrix_message_id IS NOT NULL;

-- 1.3 RLS e Policies para open_channel_bindings
ALTER TABLE public.open_channel_bindings ENABLE ROW LEVEL SECURITY;

CREATE POLICY IF NOT EXISTS "Users can manage bindings for their tenant" 
ON public.open_channel_bindings
FOR ALL
USING (
  tenant_id IN (
    SELECT id FROM tenants WHERE tenants.id = open_channel_bindings.tenant_id
  )
);

-- RLS para wa_sessions
ALTER TABLE public.wa_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY IF NOT EXISTS "Users can manage wa_sessions for their tenant" 
ON public.wa_sessions
FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM tenants 
    WHERE tenants.id = wa_sessions.user_id
  )
);

-- Policy para service role acessar open_channel_bindings
CREATE POLICY IF NOT EXISTS "Service can read bindings" 
ON public.open_channel_bindings
FOR SELECT
USING (current_setting('role') = 'service_role');

-- Policy para service role acessar wa_sessions  
CREATE POLICY IF NOT EXISTS "Service can manage wa_sessions" 
ON public.wa_sessions
FOR ALL
USING (current_setting('role') = 'service_role');

-- Função auxiliar para resolver line_id por binding
CREATE OR REPLACE FUNCTION resolve_line_id_by_binding(tenant_uuid UUID, instance_uuid UUID)
RETURNS TEXT
LANGUAGE SQL
SECURITY DEFINER
STABLE
AS $$
SELECT line_id FROM open_channel_bindings 
WHERE tenant_id = tenant_uuid AND instance_id = instance_uuid 
LIMIT 1;
$$;

-- Função auxiliar para verificar duplicata por evolution_message_id
CREATE OR REPLACE FUNCTION check_evolution_message_duplicate(tenant_uuid UUID, evo_msg_id TEXT)
RETURNS BOOLEAN
LANGUAGE SQL
SECURITY DEFINER
STABLE
AS $$
SELECT EXISTS(
  SELECT 1 FROM messages 
  WHERE tenant_id = tenant_uuid AND evolution_message_id = evo_msg_id
);
$$;

-- Função auxiliar para verificar duplicata por bitrix_message_id
CREATE OR REPLACE FUNCTION check_bitrix_message_duplicate(tenant_uuid UUID, btx_msg_id TEXT)
RETURNS BOOLEAN
LANGUAGE SQL
SECURITY DEFINER
STABLE
AS $$
SELECT EXISTS(
  SELECT 1 FROM messages 
  WHERE tenant_id = tenant_uuid AND bitrix_message_id = btx_msg_id
);
$$;
