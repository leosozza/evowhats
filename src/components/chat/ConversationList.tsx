
import { DBConversation } from "@/services/chatApi";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";

type Props = {
  conversations: DBConversation[] | undefined;
  selectedId: string | undefined;
  onSelect: (id: string) => void;
  onCreateNew: () => void;
};

function ConversationItem({
  c,
  active,
  onClick,
}: {
  c: DBConversation;
  active: boolean;
  onClick: () => void;
}) {
  const name = c.contact_name || c.contact_phone;
  const time = c.last_message_at
    ? new Date(c.last_message_at).toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
      })
    : "";

  return (
    <button
      onClick={onClick}
      className={`w-full text-left px-3 py-2 rounded-md border transition ${
        active ? "bg-accent" : "bg-background hover:bg-accent"
      }`}
    >
      <div className="flex items-center justify-between">
        <div className="font-medium text-sm">{name}</div>
        <div className="text-xs text-muted-foreground">{time}</div>
      </div>
      {c.contact_name && (
        <div className="text-xs text-muted-foreground">{c.contact_phone}</div>
      )}
    </button>
  );
}

export default function ConversationList({
  conversations,
  selectedId,
  onSelect,
  onCreateNew,
}: Props) {
  return (
    <div className="h-full flex flex-col">
      <div className="flex items-center justify-between mb-2">
        <div className="font-semibold">Conversas</div>
        <Button size="sm" variant="secondary" onClick={onCreateNew}>
          Nova
        </Button>
      </div>
      <div className="flex-1 border rounded-lg">
        <ScrollArea className="h-[70vh] p-2">
          <div className="space-y-1">
            {conversations?.map((c) => (
              <ConversationItem
                key={c.id}
                c={c}
                active={c.id === selectedId}
                onClick={() => onSelect(c.id)}
              />
            ))}
            {(!conversations || conversations.length === 0) && (
              <div className="p-3 text-sm text-muted-foreground">
                Nenhuma conversa. Clique em "Nova" para iniciar.
              </div>
            )}
          </div>
        </ScrollArea>
      </div>
    </div>
  );
}
