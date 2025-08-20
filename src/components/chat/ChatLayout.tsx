
import { useEffect, useMemo, useState } from "react";
import { useConversations } from "@/hooks/useConversations";
import ConversationList from "./ConversationList";
import ChatWindow from "./ChatWindow";
import { Card } from "@/components/ui/card";
import { createConversation } from "@/services/chatApi";
import { useSupabaseAuth } from "@/hooks/useSupabaseAuth";
import { useToast } from "@/components/ui/use-toast";

export default function ChatLayout() {
  const { session, user, loading } = useSupabaseAuth();
  const { data: conversations, isLoading } = useConversations();
  const [selectedId, setSelectedId] = useState<string | undefined>(undefined);
  const { toast } = useToast();

  useEffect(() => {
    if (!selectedId && conversations && conversations.length > 0) {
      setSelectedId(conversations[0].id);
    }
  }, [conversations, selectedId]);

  const senderName = useMemo(() => user?.email ?? user?.id ?? null, [user]);

  const onCreateNew = async () => {
    if (!user) {
      toast({ title: "Faça login", description: "Você precisa estar logado para criar conversas." });
      return;
    }
    const phone = window.prompt("Telefone do contato (com DDI/DD):");
    if (!phone) return;
    const name = window.prompt("Nome do contato (opcional):") ?? undefined;

    const conv = await createConversation({
      userId: user.id,
      contact_phone: phone.trim(),
      contact_name: name?.trim() || undefined,
    });
    setSelectedId(conv.id);
    toast({ title: "Conversa criada", description: `${conv.contact_name || conv.contact_phone}` });
  };

  if (loading) {
    return <div className="p-6 text-muted-foreground">Carregando sessão...</div>;
  }

  if (!session || !user) {
    return (
      <Card className="p-6">
        <div className="text-sm text-muted-foreground">
          Você precisa estar autenticado para usar o chat.
        </div>
      </Card>
    );
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
      <Card className="p-4 lg:col-span-1">
        <ConversationList
          conversations={conversations}
          selectedId={selectedId}
          onSelect={setSelectedId}
          onCreateNew={onCreateNew}
        />
      </Card>

      <Card className="p-4 lg:col-span-2 min-h-[70vh]">
        <ChatWindow conversationId={selectedId} senderName={senderName} />
      </Card>
    </div>
  );
}
