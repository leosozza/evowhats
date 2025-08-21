
import React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { MessageSquare, Users } from "lucide-react";
import { useConversationMonitor } from "@/hooks/useConversationMonitor";
import ConversationList from "@/components/monitor/ConversationList";
import MessagesList from "@/components/monitor/MessagesList";
import MessageInput from "@/components/monitor/MessageInput";
import NewConversationDialog from "@/components/monitor/NewConversationDialog";
import { useSupabaseAuth } from "@/hooks/useSupabaseAuth";
import { useQueryClient } from "@tanstack/react-query";

export default function WhatsAppWebMonitor() {
  const { session } = useSupabaseAuth();
  const queryClient = useQueryClient();
  const {
    conversations,
    selectedConversation,
    selectedConversationId,
    setSelectedConversationId,
    messages,
    sendMessage,
    isLoading,
  } = useConversationMonitor();

  const handleConversationCreated = () => {
    queryClient.invalidateQueries({ queryKey: ["conversations"] });
  };

  if (!session) {
    return (
      <Card>
        <CardContent className="p-6">
          <div className="text-center text-muted-foreground">
            Faça login para acessar o monitor de mensagens
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 h-[600px]">
      {/* Lista de Conversas */}
      <Card className="lg:col-span-1">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2 text-base">
              <Users className="h-4 w-4" />
              Conversas ({conversations.length})
            </CardTitle>
            <NewConversationDialog onConversationCreated={handleConversationCreated} />
          </div>
        </CardHeader>
        <CardContent className="p-0 h-[calc(100%-5rem)]">
          <ConversationList
            conversations={conversations}
            selectedId={selectedConversationId}
            onSelect={setSelectedConversationId}
          />
        </CardContent>
      </Card>

      {/* Área de Mensagens */}
      <Card className="lg:col-span-2 flex flex-col">
        <CardHeader className="pb-3 flex-shrink-0">
          <CardTitle className="flex items-center gap-2 text-base">
            <MessageSquare className="h-4 w-4" />
            {selectedConversation ? (
              <div>
                <span>{selectedConversation.contact_name || selectedConversation.contact_phone}</span>
                {selectedConversation.contact_name && (
                  <span className="text-sm text-muted-foreground ml-2">
                    ({selectedConversation.contact_phone})
                  </span>
                )}
              </div>
            ) : (
              "Selecione uma conversa"
            )}
          </CardTitle>
        </CardHeader>

        {selectedConversationId ? (
          <>
            <CardContent className="flex-1 p-0 min-h-0">
              <MessagesList messages={messages} isLoading={isLoading} />
            </CardContent>
            <div className="flex-shrink-0">
              <MessageInput onSendMessage={sendMessage} disabled={isLoading} />
            </div>
          </>
        ) : (
          <CardContent className="flex-1 flex items-center justify-center">
            <div className="text-center text-muted-foreground">
              <MessageSquare className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>Selecione uma conversa para começar</p>
              <p className="text-sm mt-2">ou clique em "Nova Conversa" para iniciar</p>
            </div>
          </CardContent>
        )}
      </Card>
    </div>
  );
}
