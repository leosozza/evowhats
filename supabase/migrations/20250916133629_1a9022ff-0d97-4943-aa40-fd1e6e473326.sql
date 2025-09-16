-- Create table for binding OpenLine ↔ Evolution instances
CREATE TABLE IF NOT EXISTS public.evo_line_bindings (
  id BIGSERIAL PRIMARY KEY,
  line_id TEXT NOT NULL UNIQUE,
  instance_name TEXT NOT NULL UNIQUE,
  status TEXT DEFAULT 'pending',
  last_qr TEXT,
  last_error TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.evo_line_bindings ENABLE ROW LEVEL SECURITY;

-- Create RLS policies
CREATE POLICY "Users can manage their own bindings" 
ON public.evo_line_bindings 
FOR ALL 
USING (EXISTS (
  SELECT 1 FROM open_channel_bindings ocb 
  WHERE ocb.line_id = evo_line_bindings.line_id 
  AND ocb.tenant_id = auth.uid()
))
WITH CHECK (EXISTS (
  SELECT 1 FROM open_channel_bindings ocb 
  WHERE ocb.line_id = evo_line_bindings.line_id 
  AND ocb.tenant_id = auth.uid()
));

-- Create trigger for automatic timestamp updates
CREATE OR REPLACE FUNCTION update_evo_line_bindings_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER update_evo_line_bindings_updated_at
BEFORE UPDATE ON public.evo_line_bindings
FOR EACH ROW
EXECUTE FUNCTION update_evo_line_bindings_updated_at();