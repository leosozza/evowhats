-- Enhanced security for bitrix_credentials table (simplified version)
-- This migration adds essential security measures without breaking existing data

-- 1. Drop existing broad RLS policy and create more granular ones
DROP POLICY IF EXISTS "Users can manage their own Bitrix credentials" ON public.bitrix_credentials;

-- Create more granular RLS policies with enhanced security
CREATE POLICY "Users can view their own credentials"
ON public.bitrix_credentials
FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own credentials"
ON public.bitrix_credentials
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id AND user_id IS NOT NULL);

CREATE POLICY "Users can update their own credentials"
ON public.bitrix_credentials
FOR UPDATE
TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id AND user_id IS NOT NULL);

CREATE POLICY "Users can delete their own credentials"
ON public.bitrix_credentials
FOR DELETE
TO authenticated
USING (auth.uid() = user_id);

-- 2. Create audit log table for tracking credential access
CREATE TABLE IF NOT EXISTS public.bitrix_credentials_audit (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  credential_id UUID NOT NULL,
  action TEXT NOT NULL, -- 'SELECT', 'INSERT', 'UPDATE', 'DELETE'
  ip_address INET,
  user_agent TEXT,
  timestamp TIMESTAMP WITH TIME ZONE DEFAULT now(),
  details JSONB
);

-- Enable RLS on audit table
ALTER TABLE public.bitrix_credentials_audit ENABLE ROW LEVEL SECURITY;

-- 3. Create audit table RLS policies
CREATE POLICY "Users can view their own credential audit logs"
ON public.bitrix_credentials_audit
FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

CREATE POLICY "Service role can insert audit logs"
ON public.bitrix_credentials_audit
FOR INSERT
TO service_role
WITH CHECK (true);

-- 4. Create audit logging function
CREATE OR REPLACE FUNCTION public.audit_bitrix_credentials()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.bitrix_credentials_audit (
      user_id, credential_id, action, details
    ) VALUES (
      NEW.user_id,
      NEW.id,
      'INSERT',
      jsonb_build_object('portal_url', NEW.portal_url)
    );
    RETURN NEW;
  END IF;
  
  IF TG_OP = 'UPDATE' THEN
    INSERT INTO public.bitrix_credentials_audit (
      user_id, credential_id, action, details
    ) VALUES (
      NEW.user_id,
      NEW.id,
      'UPDATE',
      jsonb_build_object(
        'portal_url', NEW.portal_url,
        'token_updated', CASE WHEN OLD.access_token != NEW.access_token THEN true ELSE false END
      )
    );
    RETURN NEW;
  END IF;
  
  IF TG_OP = 'DELETE' THEN
    INSERT INTO public.bitrix_credentials_audit (
      user_id, credential_id, action, details
    ) VALUES (
      auth.uid(),
      OLD.id,
      'DELETE',
      jsonb_build_object('portal_url', OLD.portal_url)
    );
    RETURN OLD;
  END IF;
  
  RETURN NULL;
END;
$$;

-- 5. Add audit triggers
CREATE TRIGGER audit_bitrix_credentials_insert
  AFTER INSERT ON public.bitrix_credentials
  FOR EACH ROW EXECUTE FUNCTION public.audit_bitrix_credentials();

CREATE TRIGGER audit_bitrix_credentials_update
  AFTER UPDATE ON public.bitrix_credentials
  FOR EACH ROW EXECUTE FUNCTION public.audit_bitrix_credentials();

CREATE TRIGGER audit_bitrix_credentials_delete
  AFTER DELETE ON public.bitrix_credentials
  FOR EACH ROW EXECUTE FUNCTION public.audit_bitrix_credentials();

-- 6. Add essential validation constraints
ALTER TABLE public.bitrix_credentials 
ADD CONSTRAINT check_user_id_not_null CHECK (user_id IS NOT NULL);

-- 7. Add indexes for better performance and security monitoring
CREATE INDEX IF NOT EXISTS idx_bitrix_credentials_user_id_active 
ON public.bitrix_credentials (user_id, is_active) 
WHERE is_active = true;

CREATE INDEX IF NOT EXISTS idx_bitrix_credentials_expires_at 
ON public.bitrix_credentials (expires_at) 
WHERE expires_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_bitrix_credentials_audit_user_timestamp 
ON public.bitrix_credentials_audit (user_id, timestamp);

CREATE INDEX IF NOT EXISTS idx_bitrix_credentials_audit_action_timestamp 
ON public.bitrix_credentials_audit (action, timestamp);

-- 8. Create security helper functions
CREATE OR REPLACE FUNCTION public.get_active_bitrix_credentials()
RETURNS SETOF public.bitrix_credentials
LANGUAGE SQL
SECURITY DEFINER
STABLE
AS $$
  SELECT * FROM public.bitrix_credentials 
  WHERE user_id = auth.uid() 
    AND is_active = true 
    AND (expires_at IS NULL OR expires_at > now());
$$;

CREATE OR REPLACE FUNCTION public.revoke_bitrix_credentials(credential_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE public.bitrix_credentials 
  SET is_active = false, 
      updated_at = now(),
      access_token = NULL,
      refresh_token = NULL
  WHERE id = credential_id 
    AND user_id = auth.uid();
  
  RETURN FOUND;
END;
$$;

-- 9. Create function to safely get credentials without exposing sensitive data
CREATE OR REPLACE FUNCTION public.get_bitrix_credentials_safe()
RETURNS TABLE(
  id UUID,
  portal_url TEXT,
  client_id TEXT,
  is_active BOOLEAN,
  expires_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE,
  updated_at TIMESTAMP WITH TIME ZONE
)
LANGUAGE SQL
SECURITY DEFINER
STABLE
AS $$
  SELECT 
    c.id,
    c.portal_url,
    c.client_id,
    c.is_active,
    c.expires_at,
    c.created_at,
    c.updated_at
  FROM public.bitrix_credentials c
  WHERE c.user_id = auth.uid() 
    AND c.is_active = true;
$$;

-- 10. Add comments for documentation
COMMENT ON TABLE public.bitrix_credentials IS 'Stores Bitrix24 OAuth credentials with enhanced security measures and audit logging';
COMMENT ON TABLE public.bitrix_credentials_audit IS 'Audit log for tracking access to sensitive Bitrix credentials';
COMMENT ON FUNCTION public.get_active_bitrix_credentials() IS 'Securely retrieves only active, non-expired credentials for the current user';
COMMENT ON FUNCTION public.revoke_bitrix_credentials(UUID) IS 'Safely revokes credentials by marking inactive and clearing tokens';
COMMENT ON FUNCTION public.get_bitrix_credentials_safe() IS 'Returns credential info without exposing sensitive tokens';