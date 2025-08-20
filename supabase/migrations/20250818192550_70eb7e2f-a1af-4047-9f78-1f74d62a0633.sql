
-- Create table for storing Bitrix24 OAuth credentials
CREATE TABLE public.bitrix_credentials (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users NOT NULL,
  portal_url TEXT NOT NULL,
  client_id TEXT NOT NULL,
  client_secret TEXT NOT NULL,
  access_token TEXT,
  refresh_token TEXT,
  expires_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  is_active BOOLEAN DEFAULT true
);

-- Create table for logging Bitrix24 events
CREATE TABLE public.bitrix_event_logs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users NOT NULL,
  event_type TEXT NOT NULL,
  event_data JSONB NOT NULL,
  processed_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'processed', 'error')),
  error_message TEXT
);

-- Create table for CRM leads sync
CREATE TABLE public.bitrix_leads (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users NOT NULL,
  bitrix_lead_id TEXT NOT NULL,
  title TEXT,
  name TEXT,
  last_name TEXT,
  email TEXT,
  phone TEXT,
  status_id TEXT,
  source_id TEXT,
  created_by_id TEXT,
  assigned_by_id TEXT,
  date_create TIMESTAMP WITH TIME ZONE,
  date_modify TIMESTAMP WITH TIME ZONE,
  lead_data JSONB,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(user_id, bitrix_lead_id)
);

-- Add RLS policies for bitrix_credentials
ALTER TABLE public.bitrix_credentials ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their own Bitrix credentials" 
  ON public.bitrix_credentials 
  FOR ALL 
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Add RLS policies for bitrix_event_logs
ALTER TABLE public.bitrix_event_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own Bitrix event logs" 
  ON public.bitrix_event_logs 
  FOR SELECT 
  USING (auth.uid() = user_id);

CREATE POLICY "System can create event logs" 
  ON public.bitrix_event_logs 
  FOR INSERT 
  WITH CHECK (true);

CREATE POLICY "Users can update their own event logs" 
  ON public.bitrix_event_logs 
  FOR UPDATE 
  USING (auth.uid() = user_id);

-- Add RLS policies for bitrix_leads
ALTER TABLE public.bitrix_leads ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their own Bitrix leads" 
  ON public.bitrix_leads 
  FOR ALL 
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Add indexes for better performance
CREATE INDEX idx_bitrix_credentials_user_id ON public.bitrix_credentials(user_id);
CREATE INDEX idx_bitrix_event_logs_user_id ON public.bitrix_event_logs(user_id);
CREATE INDEX idx_bitrix_event_logs_status ON public.bitrix_event_logs(status);
CREATE INDEX idx_bitrix_leads_user_id ON public.bitrix_leads(user_id);
CREATE INDEX idx_bitrix_leads_bitrix_id ON public.bitrix_leads(bitrix_lead_id);

-- Add trigger to update updated_at column
CREATE TRIGGER update_bitrix_credentials_updated_at
  BEFORE UPDATE ON public.bitrix_credentials
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_bitrix_leads_updated_at
  BEFORE UPDATE ON public.bitrix_leads
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
