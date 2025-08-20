
import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { MessageCircle, User, Clock, CheckCircle2 } from "lucide-react";

interface Message {
  id: string;
  contact: string;
  message: string;
  timestamp: string;
  status: "sent" | "delivered" | "read" | "failed";
  direction: "in" | "out";
}

const MessageMonitor = () => {
  const [messages] = useState<Message[]>([
    {
      id: "1",
      contact: "+55 11 99999-9999",
      message: "Olá! Gostaria de saber mais sobre os produtos.",
      timestamp: "14:30",
      status: "read",
      direction: "in"
    },
    {
      id: "2",
      contact: "+55 11 99999-9999",
      message: "Claro! Vou te passar o catálogo completo.",
      timestamp: "14:32",
      status: "delivered",
      direction: "out"
    },
    {
      id: "3",
      contact: "+55 11 88888-8888",
      message: "Preciso de ajuda com meu pedido #1234",
      timestamp: "14:35",
      status: "sent",
      direction: "in"
    }
  ]);

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "sent":
        return <Clock className="h-3 w-3 text-gray-500" />;
      case "delivered":
        return <CheckCircle2 className="h-3 w-3 text-green-500" />;
      case "read":
        return <CheckCircle2 className="h-3 w-3 text-blue-500" />;
      case "failed":
        return <Clock className="h-3 w-3 text-red-500" />;
      default:
        return <Clock className="h-3 w-3 text-gray-400" />;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "sent":
        return "bg-gray-100 text-gray-700";
      case "delivered":
        return "bg-green-100 text-green-700";
      case "read":
        return "bg-blue-100 text-blue-700";
      case "failed":
        return "bg-red-100 text-red-700";
      default:
        return "bg-gray-100 text-gray-700";
    }
  };

  return (
    <Card className="p-6 animate-fade-in">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-semibold text-foreground flex items-center">
          <MessageCircle className="h-5 w-5 mr-2" />
          Monitor de Mensagens
        </h2>
        <Badge variant="secondary" className="gradient-success text-white">
          {messages.length} mensagens hoje
        </Badge>
      </div>
      
      <ScrollArea className="h-96">
        <div className="space-y-3">
          {messages.map((message) => (
            <div
              key={message.id}
              className={`p-4 rounded-lg border transition-all duration-200 hover:shadow-md ${
                message.direction === "in" 
                  ? "bg-blue-50 border-blue-200" 
                  : "bg-green-50 border-green-200"
              }`}
            >
              <div className="flex items-start justify-between mb-2">
                <div className="flex items-center space-x-2">
                  <User className="h-4 w-4 text-muted-foreground" />
                  <span className="font-medium text-sm text-foreground">
                    {message.contact}
                  </span>
                  <Badge 
                    variant="outline" 
                    className={`text-xs ${getStatusColor(message.status)}`}
                  >
                    {getStatusIcon(message.status)}
                    <span className="ml-1">{message.status}</span>
                  </Badge>
                </div>
                <span className="text-xs text-muted-foreground">
                  {message.timestamp}
                </span>
              </div>
              <p className="text-sm text-foreground leading-relaxed">
                {message.message}
              </p>
            </div>
          ))}
        </div>
      </ScrollArea>
    </Card>
  );
};

export default MessageMonitor;
