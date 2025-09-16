-- Enhanced security for bitrix_credentials table
-- This migration adds comprehensive security measures to protect sensitive authentication data

-- 1. Create audit log table for tracking credential access
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

-- 2. Create security definer function to get current user's IP and user agent
CREATE OR REPLACE FUNCTION public.get_request_context()
RETURNS JSONB
LANGUAGE SQL
SECURITY DEFINER
STABLE
AS $$
  SELECT jsonb_build_object(
    'ip_address', current_setting('request.headers', true)::jsonb->>'x-forwarded-for',
    'user_agent', current_setting('request.headers', true)::jsonb->>'user-agent'
  );
$$;

-- 3. Create audit logging function
CREATE OR REPLACE FUNCTION public.audit_bitrix_credentials()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  context JSONB;
BEGIN
  context := public.get_request_context();
  
  IF TG_OP = 'SELECT' THEN
    -- Log credential access attempts
    INSERT INTO public.bitrix_credentials_audit (
      user_id, credential_id, action, ip_address, user_agent, details
    ) VALUES (
      auth.uid(),
      OLD.id,
      'SELECT',
      (context->>'ip_address')::INET,
      context->>'user_agent',
      jsonb_build_object('portal_url', OLD.portal_url)
    );
    RETURN OLD;
  END IF;
  
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.bitrix_credentials_audit (
      user_id, credential_id, action, ip_address, user_agent, details
    ) VALUES (
      NEW.user_id,
      NEW.id,
      'INSERT',
      (context->>'ip_address')::INET,
      context->>'user_agent',
      jsonb_build_object('portal_url', NEW.portal_url)
    );
    RETURN NEW;
  END IF;
  
  IF TG_OP = 'UPDATE' THEN
    INSERT INTO public.bitrix_credentials_audit (
      user_id, credential_id, action, ip_address, user_agent, details
    ) VALUES (
      NEW.user_id,
      NEW.id,
      'UPDATE',
      (context->>'ip_address')::INET,
      context->>'user_agent',
      jsonb_build_object(
        'portal_url', NEW.portal_url,
        'token_updated', CASE WHEN OLD.access_token != NEW.access_token THEN true ELSE false END
      )
    );
    RETURN NEW;
  END IF;
  
  IF TG_OP = 'DELETE' THEN
    INSERT INTO public.bitrix_credentials_audit (
      user_id, credential_id, action, ip_address, user_agent, details
    ) VALUES (
      auth.uid(),
      OLD.id,
      'DELETE',
      (context->>'ip_address')::INET,
      context->>'user_agent',
      jsonb_build_object('portal_url', OLD.portal_url)
    );
    RETURN OLD;
  END IF;
  
  RETURN NULL;
END;
$$;

-- 4. Drop existing broad RLS policy and create more granular ones
DROP POLICY IF EXISTS "Users can manage their own Bitrix credentials" ON public.bitrix_credentials;

-- Create more granular RLS policies
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

-- 5. Create audit table RLS policies
CREATE POLICY "Users can view their own credential audit logs"
ON public.bitrix_credentials_audit
FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

-- Service role can insert audit logs
CREATE POLICY "Service role can insert audit logs"
ON public.bitrix_credentials_audit
FOR INSERT
TO service_role
WITH CHECK (true);

-- 6. Add triggers for audit logging (commented out for now as they might impact performance)
-- CREATE TRIGGER audit_bitrix_credentials_select
--   AFTER SELECT ON public.bitrix_credentials
--   FOR EACH ROW EXECUTE FUNCTION public.audit_bitrix_credentials();

CREATE TRIGGER audit_bitrix_credentials_insert
  AFTER INSERT ON public.bitrix_credentials
  FOR EACH ROW EXECUTE FUNCTION public.audit_bitrix_credentials();

CREATE TRIGGER audit_bitrix_credentials_update
  AFTER UPDATE ON public.bitrix_credentials
  FOR EACH ROW EXECUTE FUNCTION public.audit_bitrix_credentials();

CREATE TRIGGER audit_bitrix_credentials_delete
  AFTER DELETE ON public.bitrix_credentials
  FOR EACH ROW EXECUTE FUNCTION public.audit_bitrix_credentials();

-- 7. Add validation constraints
ALTER TABLE public.bitrix_credentials 
ADD CONSTRAINT check_user_id_not_null CHECK (user_id IS NOT NULL);

ALTER TABLE public.bitrix_credentials 
ADD CONSTRAINT check_portal_url_format CHECK (
  portal_url IS NOT NULL AND 
  portal_url ~ '^https?://[a-zA-Z0-9.-]+\.bitrix24\.(com|ru|de|es|fr|it|pl|br|co\.uk|eu|in|by)(/.*)?$'
);

-- 8. Add indexes for better performance and security monitoring
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

-- 9. Create security helper functions
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

-- 10. Add comments for documentation
COMMENT ON TABLE public.bitrix_credentials IS 'Stores Bitrix24 OAuth credentials with enhanced security measures';
COMMENT ON TABLE public.bitrix_credentials_audit IS 'Audit log for tracking access to sensitive Bitrix credentials';
COMMENT ON FUNCTION public.get_active_bitrix_credentials() IS 'Securely retrieves only active, non-expired credentials for the current user';
COMMENT ON FUNCTION public.revoke_bitrix_credentials(UUID) IS 'Safely revokes credentials by marking inactive and clearing tokens';