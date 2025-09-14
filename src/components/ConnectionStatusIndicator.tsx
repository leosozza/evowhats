import React from "react";
import { Badge } from "@/components/ui/badge";
import { Loader2, CheckCircle, XCircle, AlertCircle, Clock } from "lucide-react";

interface ConnectionStatusIndicatorProps {
  status: string;
  isLoading?: boolean;
  instanceName?: string;
  className?: string;
}

export const ConnectionStatusIndicator: React.FC<ConnectionStatusIndicatorProps> = ({
  status,
  isLoading = false,
  instanceName,
  className = ""
}) => {
  const getStatusConfig = (state: string) => {
    const normalizedState = state.toLowerCase();
    
    switch (normalizedState) {
      case "open":
      case "connected":
        return {
          variant: "default" as const,
          icon: <CheckCircle className="h-3 w-3" />,
          text: "Conectado",
          color: "text-green-600 bg-green-50 border-green-200"
        };
        
      case "connecting":
      case "pending_qr":
        return {
          variant: "secondary" as const,
          icon: isLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Clock className="h-3 w-3" />,
          text: "Conectando...",
          color: "text-yellow-600 bg-yellow-50 border-yellow-200"
        };
        
      case "close":
      case "closed":
      case "disconnected":
        return {
          variant: "destructive" as const,
          icon: <XCircle className="h-3 w-3" />,
          text: "Desconectado",
          color: "text-red-600 bg-red-50 border-red-200"
        };
        
      case "error":
        return {
          variant: "destructive" as const,
          icon: <AlertCircle className="h-3 w-3" />,
          text: "Erro",
          color: "text-red-600 bg-red-50 border-red-200"
        };
        
      default:
        return {
          variant: "outline" as const,
          icon: <AlertCircle className="h-3 w-3" />,
          text: "Desconhecido",
          color: "text-gray-600 bg-gray-50 border-gray-200"
        };
    }
  };

  const config = getStatusConfig(status);

  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <Badge 
        variant={config.variant}
        className={`flex items-center gap-1 ${config.color}`}
      >
        {config.icon}
        {config.text}
      </Badge>
      {instanceName && (
        <span className="text-xs text-muted-foreground truncate">
          {instanceName}
        </span>
      )}
    </div>
  );
};