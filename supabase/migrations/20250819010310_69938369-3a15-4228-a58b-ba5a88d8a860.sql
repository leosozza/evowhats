
-- Update bitrix_credentials table to match OAuth requirements
ALTER TABLE bitrix_credentials 
ADD COLUMN IF NOT EXISTS scope TEXT,
ADD COLUMN IF NOT EXISTS installation_id TEXT;

-- Create oauth_states table for CSRF protection
CREATE TABLE IF NOT EXISTS oauth_states (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  portal_url TEXT NOT NULL,
  state TEXT NOT NULL UNIQUE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT (now() + INTERVAL '10 minutes')
);

-- Enable RLS on oauth_states
ALTER TABLE oauth_states ENABLE ROW LEVEL SECURITY;

-- Create policy for oauth_states
CREATE POLICY "Users can manage their own OAuth states"
ON oauth_states
FOR ALL
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- Update bitrix_event_logs to be more restrictive (security fix)
DROP POLICY IF EXISTS "System can create event logs" ON bitrix_event_logs;

-- Create more restrictive policy for event logs
CREATE POLICY "Authenticated services can create event logs"
ON bitrix_event_logs
FOR INSERT
WITH CHECK (
  -- Only allow inserts from edge functions or when user_id matches authenticated user
  (auth.uid() IS NULL AND current_setting('role') = 'service_role') OR
  (auth.uid() = user_id)
);

-- Create evolution_instances table for instance management
CREATE TABLE IF NOT EXISTS evolution_instances (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  instance_name TEXT NOT NULL,
  instance_status TEXT DEFAULT 'disconnected',
  qr_code TEXT,
  webhook_url TEXT,
  last_seen_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(user_id, instance_name)
);

-- Enable RLS and create policies for evolution_instances
ALTER TABLE evolution_instances ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their own Evolution instances"
ON evolution_instances
FOR ALL
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- Enable realtime for event monitoring
ALTER TABLE bitrix_event_logs REPLICA IDENTITY FULL;
ALTER TABLE evolution_instances REPLICA IDENTITY FULL;

-- Add tables to realtime publication
ALTER PUBLICATION supabase_realtime ADD TABLE bitrix_event_logs;
ALTER PUBLICATION supabase_realtime ADD TABLE evolution_instances;

-- Update database function security (security fix)
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $function$
BEGIN
  INSERT INTO public.profiles (id, email, full_name)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', '')
  );
  RETURN NEW;
END;
$function$;

-- Create cleanup function for expired OAuth states
CREATE OR REPLACE FUNCTION cleanup_expired_oauth_states()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  DELETE FROM oauth_states WHERE expires_at < now();
END;
$$;
