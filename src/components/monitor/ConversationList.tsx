
import React from "react";
import { Avatar, AvatarFallback, AvatarInitials } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { DBConversation } from "@/services/chatApi";

interface ConversationListProps {
  conversations: DBConversation[];
  selectedId?: string;
  onSelect: (id: string) => void;
}

export default function ConversationList({ conversations, selectedId, onSelect }: ConversationListProps) {
  const formatTime = (timestamp: string | null) => {
    if (!timestamp) return "";
    const date = new Date(timestamp);
    const now = new Date();
    const isToday = date.toDateString() === now.toDateString();
    
    if (isToday) {
      return date.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
    }
    return date.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
  };

  const getContactInitials = (contact: DBConversation) => {
    if (contact.contact_name) {
      const names = contact.contact_name.split(" ");
      return names.length > 1 
        ? `${names[0][0]}${names[names.length - 1][0]}`.toUpperCase()
        : names[0].substring(0, 2).toUpperCase();
    }
    return contact.contact_phone.substring(-2);
  };

  if (conversations.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-6 text-center">
        <div className="text-muted-foreground text-sm">
          Nenhuma conversa encontrada
        </div>
      </div>
    );
  }

  return (
    <ScrollArea className="h-full">
      <div className="space-y-1 p-2">
        {conversations.map((conversation) => (
          <div
            key={conversation.id}
            onClick={() => onSelect(conversation.id)}
            className={`flex items-center gap-3 p-3 rounded-lg cursor-pointer transition-colors hover:bg-accent ${
              selectedId === conversation.id ? "bg-accent" : ""
            }`}
          >
            <Avatar className="h-12 w-12">
              <AvatarInitials>
                {getContactInitials(conversation)}
              </AvatarInitials>
              <AvatarFallback>
                {getContactInitials(conversation)}
              </AvatarFallback>
            </Avatar>
            
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between mb-1">
                <h3 className="font-medium text-sm truncate">
                  {conversation.contact_name || conversation.contact_phone}
                </h3>
                <span className="text-xs text-muted-foreground">
                  {formatTime(conversation.last_message_at)}
                </span>
              </div>
              
              <div className="flex items-center justify-between">
                <p className="text-sm text-muted-foreground truncate">
                  {conversation.contact_phone}
                </p>
                {conversation.evolution_instance && (
                  <Badge variant="secondary" className="text-xs">
                    Conectado
                  </Badge>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    </ScrollArea>
  );
}
