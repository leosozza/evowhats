-- Habilitar RLS e criar políticas de segurança para as novas tabelas

-- Habilitar RLS em todas as novas tabelas
ALTER TABLE open_channel_bindings ENABLE ROW LEVEL SECURITY;
ALTER TABLE contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE wa_instances ENABLE ROW LEVEL SECURITY;
ALTER TABLE webhook_logs ENABLE ROW LEVEL SECURITY;

-- Políticas para open_channel_bindings
CREATE POLICY "Users can manage their own channel bindings"
ON open_channel_bindings FOR ALL
USING (tenant_id = auth.uid())
WITH CHECK (tenant_id = auth.uid());

-- Políticas para contacts
CREATE POLICY "Users can manage their own contacts"
ON contacts FOR ALL
USING (tenant_id = auth.uid())
WITH CHECK (tenant_id = auth.uid());

-- Políticas para wa_instances
CREATE POLICY "Users can manage their own WA instances"
ON wa_instances FOR ALL
USING (tenant_id = auth.uid())
WITH CHECK (tenant_id = auth.uid());

-- Políticas para webhook_logs (somente leitura para usuários, inserção via service role)
CREATE POLICY "Users can view their own webhook logs"
ON webhook_logs FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM wa_instances wi 
    WHERE wi.id::text = (payload_json->>'instanceId')
    AND wi.tenant_id = auth.uid()
  )
);

CREATE POLICY "Service role can insert webhook logs"
ON webhook_logs FOR INSERT
WITH CHECK (current_setting('role') = 'service_role');

-- Corrigir funções existentes para usar search_path seguro
CREATE OR REPLACE FUNCTION public.update_wa_sessions_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER  
SET search_path = public
AS $function$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$function$;