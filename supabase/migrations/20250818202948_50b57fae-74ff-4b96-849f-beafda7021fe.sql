
-- Create table for Bitrix Open Channels configuration
CREATE TABLE public.bitrix_channels (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  channel_id TEXT NOT NULL,
  channel_name TEXT NOT NULL,
  channel_type TEXT NOT NULL DEFAULT 'whatsapp',
  is_active BOOLEAN DEFAULT true,
  webhook_url TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(user_id, channel_id)
);

-- Create table for mapping conversations to Bitrix chats
CREATE TABLE public.bitrix_conversation_mapping (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  bitrix_chat_id TEXT NOT NULL,
  bitrix_channel_id TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(conversation_id),
  UNIQUE(user_id, bitrix_chat_id)
);

-- Add RLS policies for bitrix_channels
ALTER TABLE public.bitrix_channels ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their own Bitrix channels" 
  ON public.bitrix_channels 
  FOR ALL 
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Add RLS policies for bitrix_conversation_mapping
ALTER TABLE public.bitrix_conversation_mapping ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their own conversation mappings" 
  ON public.bitrix_conversation_mapping 
  FOR ALL 
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Add trigger to update updated_at columns
CREATE TRIGGER update_bitrix_channels_updated_at
  BEFORE UPDATE ON public.bitrix_channels
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_bitrix_conversation_mapping_updated_at
  BEFORE UPDATE ON public.bitrix_conversation_mapping
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();
