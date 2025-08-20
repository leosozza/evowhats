
import { useRef, useEffect, useState, FormEvent } from "react";
import { useMessages } from "@/hooks/useMessages";
import { sendMessage } from "@/services/chatApi";
import MessageBubble from "./MessageBubble";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/use-toast";

type Props = {
  conversationId: string | undefined;
  senderName?: string | null;
};

export default function ChatWindow({ conversationId, senderName }: Props) {
  const { data: messages, isLoading } = useMessages(conversationId);
  const [text, setText] = useState("");
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const { toast } = useToast();

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const onSend = async (e: FormEvent) => {
    e.preventDefault();
    if (!conversationId) {
      toast({ title: "Selecione um chat", description: "Escolha uma conversa para enviar mensagens." });
      return;
    }
    const content = text.trim();
    if (!content) return;

    await sendMessage({
      conversationId,
      content,
      senderName: senderName ?? null,
    });

    setText("");
  };

  if (!conversationId) {
    return (
      <div className="h-full flex items-center justify-center text-muted-foreground">
        Selecione uma conversa para começar.
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex-1 border rounded-lg bg-card">
        <ScrollArea className="h-[60vh] p-3">
          <div className="space-y-2">
            {isLoading && (
              <div className="text-sm text-muted-foreground">Carregando...</div>
            )}
            {messages?.map((m) => (
              <MessageBubble key={m.id} message={m} />
            ))}
            <div ref={bottomRef} />
          </div>
        </ScrollArea>
      </div>

      <form onSubmit={onSend} className="mt-3 flex items-center gap-2">
        <Input
          placeholder="Digite uma mensagem"
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
        <Button type="submit">Enviar</Button>
      </form>
    </div>
  );
}
