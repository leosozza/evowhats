
import { useState, useEffect } from "react";
import { useConversations } from "@/hooks/useConversations";
import { useMessages } from "@/hooks/useMessages";
import { sendMessage } from "@/services/chatApi";
import { useSupabaseAuth } from "@/hooks/useSupabaseAuth";
import { useToast } from "@/hooks/use-toast";

export function useConversationMonitor() {
  const { session } = useSupabaseAuth();
  const { data: conversations = [], isLoading: loadingConversations } = useConversations();
  const [selectedConversationId, setSelectedConversationId] = useState<string | undefined>();
  const { data: messages = [], isLoading: loadingMessages } = useMessages(selectedConversationId);
  const { toast } = useToast();

  // Auto-select first conversation when conversations load
  useEffect(() => {
    if (!selectedConversationId && conversations && conversations.length > 0) {
      setSelectedConversationId(conversations[0].id);
    }
  }, [conversations, selectedConversationId]);

  const sendMessageToConversation = async (content: string) => {
    if (!selectedConversationId || !session?.user) {
      toast({
        title: "Erro",
        description: "Selecione uma conversa para enviar mensagens",
        variant: "destructive"
      });
      return;
    }

    try {
      await sendMessage({
        conversationId: selectedConversationId,
        content: content.trim(),
        senderName: session.user.email || "Usuário"
      });

      toast({
        title: "Mensagem enviada",
        description: "Sua mensagem foi enviada com sucesso",
      });
    } catch (error: any) {
      console.error("Erro ao enviar mensagem:", error);
      toast({
        title: "Erro ao enviar",
        description: error.message || "Falha ao enviar mensagem",
        variant: "destructive"
      });
    }
  };

  const selectedConversation = conversations?.find(c => c.id === selectedConversationId);

  return {
    conversations: conversations || [],
    selectedConversation,
    selectedConversationId,
    setSelectedConversationId,
    messages: messages || [],
    sendMessage: sendMessageToConversation,
    isLoading: loadingConversations || loadingMessages,
  };
}
