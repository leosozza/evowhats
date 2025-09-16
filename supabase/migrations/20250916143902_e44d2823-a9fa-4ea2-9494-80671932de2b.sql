-- Enhanced security for bitrix_credentials table (final version)
-- This migration adds essential security measures with proper cleanup

-- 1. Drop all existing policies to start fresh
DROP POLICY IF EXISTS "Users can manage their own Bitrix credentials" ON public.bitrix_credentials;
DROP POLICY IF EXISTS "Users can view their own credentials" ON public.bitrix_credentials;
DROP POLICY IF EXISTS "Users can insert their own credentials" ON public.bitrix_credentials;
DROP POLICY IF EXISTS "Users can update their own credentials" ON public.bitrix_credentials;
DROP POLICY IF EXISTS "Users can delete their own credentials" ON public.bitrix_credentials;

-- Create granular RLS policies with enhanced security
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

-- 2. Create audit log table if it doesn't exist
CREATE TABLE IF NOT EXISTS public.bitrix_credentials_audit (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  credential_id UUID NOT NULL,
  action TEXT NOT NULL,
  ip_address INET,
  user_agent TEXT,
  timestamp TIMESTAMP WITH TIME ZONE DEFAULT now(),
  details JSONB
);

-- Enable RLS on audit table
ALTER TABLE public.bitrix_credentials_audit ENABLE ROW LEVEL SECURITY;

-- Drop existing audit policies to avoid conflicts
DROP POLICY IF EXISTS "Users can view their own credential audit logs" ON public.bitrix_credentials_audit;
DROP POLICY IF EXISTS "Service role can insert audit logs" ON public.bitrix_credentials_audit;

-- Create audit table RLS policies
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

-- 3. Create security helper functions (replace if exists)
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

-- 4. Create function to safely get credentials without exposing sensitive data
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

-- 5. Add documentation comments
COMMENT ON TABLE public.bitrix_credentials IS 'Stores Bitrix24 OAuth credentials with enhanced security measures';
COMMENT ON TABLE public.bitrix_credentials_audit IS 'Audit log for tracking access to sensitive Bitrix credentials';
COMMENT ON FUNCTION public.get_active_bitrix_credentials() IS 'Securely retrieves only active, non-expired credentials for the current user';
COMMENT ON FUNCTION public.revoke_bitrix_credentials(UUID) IS 'Safely revokes credentials by marking inactive and clearing tokens';
COMMENT ON FUNCTION public.get_bitrix_credentials_safe() IS 'Returns credential info without exposing sensitive tokens';