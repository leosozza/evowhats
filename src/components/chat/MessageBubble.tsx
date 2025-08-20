
import { DBMessage } from "@/services/chatApi";
import { CheckCircle2, Clock } from "lucide-react";

function formatTime(iso: string) {
  try {
    const d = new Date(iso);
    return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  } catch {
    return "";
  }
}

function StatusIcon({ status }: { status: DBMessage["status"] }) {
  if (status === "read") return <CheckCircle2 className="h-3 w-3 text-blue-500" />;
  if (status === "delivered") return <CheckCircle2 className="h-3 w-3 text-green-500" />;
  if (status === "failed") return <Clock className="h-3 w-3 text-red-500" />;
  return <Clock className="h-3 w-3 text-muted-foreground" />;
}

export default function MessageBubble({ message }: { message: DBMessage }) {
  const isOut = message.direction === "out";
  return (
    <div className={`flex ${isOut ? "justify-end" : "justify-start"}`}>
      <div
        className={`max-w-[80%] rounded-lg px-3 py-2 text-sm shadow-sm ${
          isOut
            ? "bg-primary text-primary-foreground"
            : "bg-accent text-accent-foreground"
        }`}
      >
        <div className="whitespace-pre-wrap break-words">{message.content}</div>
        <div
          className={`mt-1 flex items-center gap-1 text-[10px] ${
            isOut ? "text-primary-foreground/80" : "text-muted-foreground"
          }`}
        >
          <span>{formatTime(message.created_at)}</span>
          {isOut && <StatusIcon status={message.status} />}
        </div>
      </div>
    </div>
  );
}
