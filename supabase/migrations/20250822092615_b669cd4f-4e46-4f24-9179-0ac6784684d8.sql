
-- Primeiro, vamos garantir que a tabela wa_sessions existe com a estrutura correta
CREATE TABLE IF NOT EXISTS wa_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  bitrix_line_id text NOT NULL,
  bitrix_line_name text,
  evo_instance_id text NOT NULL,
  status text NOT NULL DEFAULT 'PENDING_QR',
  qr_code text,
  connected_at timestamptz,
  last_sync_at timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE (user_id, bitrix_line_id)
);

-- Índices para performance
CREATE INDEX IF NOT EXISTS idx_wa_sessions_user ON wa_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_wa_sessions_instance ON wa_sessions(evo_instance_id);

-- Adicionar colunas necessárias nas tabelas existentes
ALTER TABLE conversations 
ADD COLUMN IF NOT EXISTS evolution_instance text,
ADD COLUMN IF NOT EXISTS bitrix_chat_id text;

ALTER TABLE messages 
ADD COLUMN IF NOT EXISTS evolution_message_id text,
ADD COLUMN IF NOT EXISTS bitrix_message_id text;

-- Índices para performance
CREATE INDEX IF NOT EXISTS idx_conversations_evolution ON conversations(evolution_instance);
CREATE INDEX IF NOT EXISTS idx_messages_evolution ON messages(evolution_message_id);

-- RLS policies para wa_sessions
ALTER TABLE wa_sessions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can manage their own WhatsApp sessions" ON wa_sessions;
CREATE POLICY "Users can manage their own WhatsApp sessions" 
ON wa_sessions 
FOR ALL 
USING (auth.uid() = user_id) 
WITH CHECK (auth.uid() = user_id);

-- Trigger para atualizar updated_at
CREATE OR REPLACE FUNCTION update_wa_sessions_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ language 'plpgsql';

DROP TRIGGER IF EXISTS update_wa_sessions_updated_at ON wa_sessions;
CREATE TRIGGER update_wa_sessions_updated_at
    BEFORE UPDATE ON wa_sessions
    FOR EACH ROW
    EXECUTE FUNCTION update_wa_sessions_updated_at();
