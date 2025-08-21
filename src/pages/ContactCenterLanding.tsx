
import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { MessageSquare, Settings } from "lucide-react";

const ContactCenterLanding = () => {
  const handleOpenSetup = () => {
    // Abrir setup no mesmo iframe/slider sem redirect hard
    window.history.pushState({}, '', '/connector/setup');
    window.location.reload();
  };

  return (
    <div className="min-h-screen bg-background p-4">
      <Card className="max-w-2xl mx-auto">
        <CardHeader className="text-center">
          <div className="flex justify-center mb-4">
            <MessageSquare className="h-12 w-12 text-primary" />
          </div>
          <CardTitle className="text-2xl">EvoWhats Connector</CardTitle>
          <p className="text-muted-foreground">
            Integração WhatsApp via Evolution API para Bitrix24 Open Channels
          </p>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="p-4 border rounded-lg">
              <h3 className="font-medium mb-2">✅ Multi-instâncias</h3>
              <p className="text-sm text-muted-foreground">
                Cada linha do Bitrix pode ter sua própria conexão WhatsApp
              </p>
            </div>
            <div className="p-4 border rounded-lg">
              <h3 className="font-medium mb-2">🔄 Mensagens em tempo real</h3>
              <p className="text-sm text-muted-foreground">
                Sincronização bidirecional WhatsApp ↔ Bitrix24
              </p>
            </div>
          </div>
          
          <div className="text-center">
            <Button onClick={handleOpenSetup} size="lg">
              <Settings className="h-4 w-4 mr-2" />
              Configurar Conexões
            </Button>
          </div>
          
          <div className="text-xs text-center text-muted-foreground">
            <p>Versão: {new Date().getFullYear()}.{String(new Date().getMonth() + 1).padStart(2, '0')}.{String(new Date().getDate()).padStart(2, '0')}</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default ContactCenterLanding;
