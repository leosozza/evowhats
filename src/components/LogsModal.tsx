
import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { RefreshCw, Download } from "lucide-react";

type LogEntry = {
  id: string;
  timestamp: string;
  level: "info" | "warning" | "error";
  message: string;
  source: "evolution" | "bitrix" | "system";
};

type LogsModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

const LogsModal = ({ open, onOpenChange }: LogsModalProps) => {
  const [logs] = useState<LogEntry[]>([
    {
      id: "1",
      timestamp: new Date().toISOString(),
      level: "info",
      message: "WhatsApp conectado com sucesso",
      source: "evolution"
    },
    {
      id: "2", 
      timestamp: new Date(Date.now() - 300000).toISOString(),
      level: "warning",
      message: "Tentativa de reconexão com Bitrix24",
      source: "bitrix"
    },
    {
      id: "3",
      timestamp: new Date(Date.now() - 600000).toISOString(),
      level: "error",
      message: "Falha na entrega de mensagem - timeout",
      source: "evolution"
    },
    {
      id: "4",
      timestamp: new Date(Date.now() - 900000).toISOString(),
      level: "info",
      message: "Sistema iniciado",
      source: "system"
    }
  ]);

  const getLevelColor = (level: string) => {
    switch (level) {
      case "error": return "bg-red-100 text-red-800";
      case "warning": return "bg-yellow-100 text-yellow-800";
      case "info": return "bg-blue-100 text-blue-800";
      default: return "bg-gray-100 text-gray-800";
    }
  };

  const getSourceColor = (source: string) => {
    switch (source) {
      case "evolution": return "bg-green-100 text-green-800";
      case "bitrix": return "bg-purple-100 text-purple-800";
      case "system": return "bg-gray-100 text-gray-800";
      default: return "bg-gray-100 text-gray-800";
    }
  };

  const formatTime = (timestamp: string) => {
    return new Date(timestamp).toLocaleString('pt-BR');
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[80vh]">
        <DialogHeader>
          <DialogTitle className="flex items-center justify-between">
            <span>Logs do Sistema</span>
            <div className="flex gap-2">
              <Button variant="outline" size="sm">
                <RefreshCw className="h-4 w-4 mr-2" />
                Atualizar
              </Button>
              <Button variant="outline" size="sm">
                <Download className="h-4 w-4 mr-2" />
                Exportar
              </Button>
            </div>
          </DialogTitle>
        </DialogHeader>
        
        <ScrollArea className="h-[500px] w-full">
          <div className="space-y-3">
            {logs.map((log) => (
              <div key={log.id} className="border rounded-lg p-3 bg-card">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <Badge className={getLevelColor(log.level)}>
                      {log.level.toUpperCase()}
                    </Badge>
                    <Badge className={getSourceColor(log.source)}>
                      {log.source}
                    </Badge>
                  </div>
                  <span className="text-xs text-muted-foreground">
                    {formatTime(log.timestamp)}
                  </span>
                </div>
                <p className="text-sm text-foreground">{log.message}</p>
              </div>
            ))}
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
};

export default LogsModal;
