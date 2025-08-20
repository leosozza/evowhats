
-- Add unique constraint to bitrix_credentials table to support upsert operations
ALTER TABLE public.bitrix_credentials 
ADD CONSTRAINT bitrix_credentials_user_portal_unique 
UNIQUE (user_id, portal_url);
