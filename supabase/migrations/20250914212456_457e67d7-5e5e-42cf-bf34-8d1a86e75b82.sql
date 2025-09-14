-- Corrigir schema do banco para compatibilidade com o código atual

-- Garantir que tabela wa_sessions tem todas as colunas necessárias
DO $$ 
BEGIN
    -- Adicionar coluna instance_id se não existir
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'wa_sessions' AND column_name = 'instance_id') THEN
        ALTER TABLE wa_sessions ADD COLUMN instance_id TEXT;
    END IF;
    
    -- Adicionar índice para melhor performance
    IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE tablename = 'wa_sessions' AND indexname = 'idx_wa_sessions_instance_id') THEN
        CREATE INDEX idx_wa_sessions_instance_id ON wa_sessions(instance_id);
    END IF;
END $$;

-- Garantir que tabela open_channel_bindings existe e tem colunas necessárias
CREATE TABLE IF NOT EXISTS open_channel_bindings (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    tenant_id UUID NOT NULL,
    line_id TEXT NOT NULL,
    wa_instance_id TEXT,
    instance_id TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Garantir que tabela contacts existe
CREATE TABLE IF NOT EXISTS contacts (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    tenant_id UUID NOT NULL,
    phone_e164 TEXT NOT NULL,
    display_name TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    UNIQUE(tenant_id, phone_e164)
);

-- Garantir que tabela wa_instances existe
CREATE TABLE IF NOT EXISTS wa_instances (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    tenant_id UUID NOT NULL,
    label TEXT NOT NULL,
    webhook_secret TEXT,
    secret TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    UNIQUE(tenant_id, label)
);

-- Garantir que tabela webhook_logs existe  
CREATE TABLE IF NOT EXISTS webhook_logs (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    provider TEXT DEFAULT 'evolution',
    payload_json JSONB NOT NULL,
    valid_signature BOOLEAN DEFAULT true,
    received_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Adicionar colunas necessárias na tabela conversations se não existirem
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'conversations' AND column_name = 'tenant_id') THEN
        ALTER TABLE conversations ADD COLUMN tenant_id UUID;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'conversations' AND column_name = 'instance_id') THEN
        ALTER TABLE conversations ADD COLUMN instance_id UUID;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'conversations' AND column_name = 'contact_id') THEN
        ALTER TABLE conversations ADD COLUMN contact_id UUID;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'conversations' AND column_name = 'status') THEN
        ALTER TABLE conversations ADD COLUMN status TEXT DEFAULT 'open';
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'conversations' AND column_name = 'openlines_chat_id') THEN
        ALTER TABLE conversations ADD COLUMN openlines_chat_id TEXT;
    END IF;
END $$;

-- Adicionar colunas necessárias na tabela messages se não existirem
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'messages' AND column_name = 'delivery_status') THEN
        ALTER TABLE messages ADD COLUMN delivery_status TEXT DEFAULT 'sent';
    END IF;
END $$;