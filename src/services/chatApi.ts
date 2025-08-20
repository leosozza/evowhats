
import { supabase } from "@/integrations/supabase/client";

export type DBConversation = {
  id: string;
  user_id: string;
  contact_phone: string;
  contact_name: string | null;
  bitrix_chat_id: string | null;
  evolution_instance: string | null;
  last_message_at: string | null;
  created_at: string;
  updated_at: string;
};

export type DBMessage = {
  id: string;
  conversation_id: string;
  message_id: string | null;
  content: string;
  message_type: string | null;
  direction: "in" | "out";
  status: "sent" | "delivered" | "read" | "failed" | null;
  sender_name: string | null;
  bitrix_message_id: string | null;
  evolution_message_id: string | null;
  media_url: string | null;
  created_at: string;
  updated_at: string;
};

export async function fetchConversations() {
  console.log("[chatApi] fetchConversations()");
  const { data, error } = await supabase
    .from("conversations")
    .select("*")
    .order("last_message_at", { ascending: false })
    .returns<DBConversation[]>();
  if (error) throw error;
  return data ?? [];
}

export async function createConversation(params: {
  userId: string;
  contact_phone: string;
  contact_name?: string;
}) {
  console.log("[chatApi] createConversation()", params);
  const { data, error } = await supabase
    .from("conversations")
    .insert([
      {
        user_id: params.userId,
        contact_phone: params.contact_phone,
        contact_name: params.contact_name ?? null,
        last_message_at: new Date().toISOString(),
      },
    ])
    .select("*")
    .single()
    .returns<DBConversation>();
  if (error) throw error;
  return data;
}

export async function fetchMessages(conversationId: string) {
  console.log("[chatApi] fetchMessages()", conversationId);
  const { data, error } = await supabase
    .from("messages")
    .select("*")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: true })
    .returns<DBMessage[]>();
  if (error) throw error;
  return data ?? [];
}

export async function sendMessage(params: {
  conversationId: string;
  content: string;
  senderName?: string | null;
}) {
  console.log("[chatApi] sendMessage()", params);
  const { data, error } = await supabase
    .from("messages")
    .insert([
      {
        conversation_id: params.conversationId,
        content: params.content,
        direction: "out",
        status: "sent",
        message_type: "text",
        sender_name: params.senderName ?? null,
      },
    ])
    .select("*")
    .single()
    .returns<DBMessage>();
  if (error) throw error;

  // Atualiza last_message_at da conversa
  await supabase
    .from("conversations")
    .update({ last_message_at: new Date().toISOString() })
    .eq("id", params.conversationId);

  return data;
}
