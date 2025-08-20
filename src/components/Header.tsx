
import { useState } from "react";
import { MessageSquare, Settings, Activity } from "lucide-react";
import { Button } from "@/components/ui/button";
import LogsModal from "./LogsModal";

const Header = () => {
  const [showLogs, setShowLogs] = useState(false);

  const handleConfigClick = () => {
    // Procurar pela aba de configurações no Dashboard
    const configTab = document.querySelector('[value="config"]') as HTMLElement;
    if (configTab) {
      configTab.click();
      // Scroll suave para a seção de configurações
      setTimeout(() => {
        const configSection = document.querySelector('[data-state="active"]');
        if (configSection) {
          configSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
      }, 100);
    } else {
      // Fallback: tentar encontrar o trigger da aba de config
      const configTrigger = document.querySelector('button[data-value="config"]') as HTMLElement;
      if (configTrigger) {
        configTrigger.click();
      }
    }
  };

  return (
    <>
      <header className="bg-white border-b border-border shadow-sm">
        <div className="container mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <div className="gradient-primary p-2 rounded-lg">
                <MessageSquare className="h-6 w-6 text-white" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-foreground">
                  EvoWhats
                </h1>
                <p className="text-sm text-muted-foreground">
                  Bitrix24 + Evolution API
                </p>
              </div>
            </div>
            
            <div className="flex items-center space-x-2">
              <Button variant="outline" size="sm" onClick={() => setShowLogs(true)}>
                <Activity className="h-4 w-4 mr-2" />
                Logs
              </Button>
              <Button variant="outline" size="sm" onClick={handleConfigClick}>
                <Settings className="h-4 w-4 mr-2" />
                Configurações
              </Button>
            </div>
          </div>
        </div>
      </header>

      <LogsModal open={showLogs} onOpenChange={setShowLogs} />
    </>
  );
};

export default Header;
