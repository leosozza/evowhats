
-- Adicionar UNIQUE constraint em bitrix_credentials para evitar duplicatas
ALTER TABLE public.bitrix_credentials 
ADD CONSTRAINT bitrix_credentials_user_portal_unique 
UNIQUE (user_id, portal_url);

-- Criar trigger para atualizar updated_at automaticamente
CREATE TRIGGER update_bitrix_credentials_updated_at
    BEFORE UPDATE ON public.bitrix_credentials
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();
