
-- Create table for WhatsApp sessions per Bitrix line
CREATE TABLE public.wa_sessions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users NOT NULL,
  bitrix_line_id TEXT NOT NULL,
  bitrix_line_name TEXT,
  evo_instance_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'PENDING_QR',
  qr_code TEXT,
  last_sync_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  
  CONSTRAINT wa_sessions_status_check CHECK (status IN ('PENDING_QR', 'CONNECTED', 'DISCONNECTED', 'ERROR')),
  CONSTRAINT wa_sessions_unique_line UNIQUE (user_id, bitrix_line_id)
);

-- Enable RLS
ALTER TABLE public.wa_sessions ENABLE ROW LEVEL SECURITY;

-- Create RLS policies
CREATE POLICY "Users can manage their own WhatsApp sessions" 
  ON public.wa_sessions 
  FOR ALL 
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Create updated_at trigger
CREATE TRIGGER update_wa_sessions_updated_at 
  BEFORE UPDATE ON public.wa_sessions 
  FOR EACH ROW 
  EXECUTE FUNCTION public.update_updated_at_column();

-- Add index for better performance
CREATE INDEX idx_wa_sessions_user_line ON public.wa_sessions(user_id, bitrix_line_id);
CREATE INDEX idx_wa_sessions_evo_instance ON public.wa_sessions(evo_instance_id);
