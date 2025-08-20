
import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { 
  Book, 
  ExternalLink, 
  CheckCircle, 
  AlertCircle, 
  Copy,
  Download,
  Settings,
  Smartphone,
  Building2,
  Zap,
  Globe,
  Key,
  Database
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const IntegrationGuide = () => {
  const [copiedText, setCopiedText] = useState<string>("");
  const { toast } = useToast();

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    setCopiedText(label);
    toast({
      title: "Copiado!",
      description: `${label} copiado para a área de transferência.`,
    });
    setTimeout(() => setCopiedText(""), 2000);
  };

  const CodeBlock = ({ code, label }: { code: string; label: string }) => (
    <div className="relative bg-gray-900 text-gray-100 p-4 rounded-lg font-mono text-sm">
      <Button
        variant="ghost"
        size="sm"
        className="absolute top-2 right-2 text-gray-400 hover:text-white"
        onClick={() => copyToClipboard(code, label)}
      >
        <Copy className="h-4 w-4" />
      </Button>
      <pre className="whitespace-pre-wrap pr-10">{code}</pre>
    </div>
  );

  return (
    <Card className="p-6 animate-fade-in">
      <div className="flex items-center gap-3 mb-6">
        <div className="gradient-primary p-2 rounded-lg">
          <Book className="h-6 w-6 text-white" />
        </div>
        <div>
          <h2 className="text-2xl font-bold text-foreground">Manual de Integração</h2>
          <p className="text-muted-foreground">Guia completo para conectar Bitrix24 e Evolution API</p>
        </div>
      </div>

      <Tabs defaultValue="overview" className="w-full">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="overview">Visão Geral</TabsTrigger>
          <TabsTrigger value="evolution">Evolution API</TabsTrigger>
          <TabsTrigger value="bitrix">Bitrix24</TabsTrigger>
          <TabsTrigger value="integration">Integração</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="mt-6 space-y-6">
          <div className="grid md:grid-cols-2 gap-6">
            <Card className="p-6">
              <div className="flex items-center gap-3 mb-4">
                <Smartphone className="h-6 w-6 text-green-600" />
                <h3 className="text-lg font-semibold">Evolution API</h3>
              </div>
              <p className="text-muted-foreground mb-4">
                API para automação do WhatsApp que permite enviar e receber mensagens de forma programática.
              </p>
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <CheckCircle className="h-4 w-4 text-green-600" />
                  <span className="text-sm">Envio de mensagens</span>
                </div>
                <div className="flex items-center gap-2">
                  <CheckCircle className="h-4 w-4 text-green-600" />
                  <span className="text-sm">Webhooks para recebimento</span>
                </div>
                <div className="flex items-center gap-2">
                  <CheckCircle className="h-4 w-4 text-green-600" />
                  <span className="text-sm">Gerenciamento de instâncias</span>
                </div>
              </div>
            </Card>

            <Card className="p-6">
              <div className="flex items-center gap-3 mb-4">
                <Building2 className="h-6 w-6 text-blue-600" />
                <h3 className="text-lg font-semibold">Bitrix24</h3>
              </div>
              <p className="text-muted-foreground mb-4">
                Sistema CRM que permite gerenciamento de leads, contatos e automações de vendas.
              </p>
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <CheckCircle className="h-4 w-4 text-green-600" />
                  <span className="text-sm">Criação de leads</span>
                </div>
                <div className="flex items-center gap-2">
                  <CheckCircle className="h-4 w-4 text-green-600" />
                  <span className="text-sm">Webhook API</span>
                </div>
                <div className="flex items-center gap-2">
                  <CheckCircle className="h-4 w-4 text-green-600" />
                  <span className="text-sm">Automações personalizadas</span>
                </div>
              </div>
            </Card>
          </div>

          <Card className="p-6 bg-blue-50 border-blue-200">
            <div className="flex items-start gap-3">
              <Zap className="h-6 w-6 text-blue-600 mt-1" />
              <div>
                <h3 className="text-lg font-semibold text-blue-900 mb-2">Fluxo da Integração</h3>
                <ol className="list-decimal list-inside space-y-2 text-blue-800">
                  <li>Mensagem recebida no WhatsApp via Evolution API</li>
                  <li>Webhook processa a mensagem e extrai dados</li>
                  <li>Lead é criado automaticamente no Bitrix24</li>
                  <li>Resposta automática é enviada pelo WhatsApp</li>
                </ol>
              </div>
            </div>
          </Card>
        </TabsContent>

        <TabsContent value="evolution" className="mt-6 space-y-6">
          <div className="space-y-6">
            <div>
              <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
                <Settings className="h-5 w-5" />
                1. Configuração da Evolution API
              </h3>
              
              <div className="space-y-4">
                <Card className="p-4">
                  <h4 className="font-medium mb-2">Pré-requisitos</h4>
                  <ul className="list-disc list-inside space-y-1 text-sm text-muted-foreground">
                    <li>Servidor com Evolution API instalada</li>
                    <li>Node.js versão 18 ou superior</li>
                    <li>WhatsApp Business ou pessoal</li>
                  </ul>
                </Card>

                <Card className="p-4">
                  <h4 className="font-medium mb-3">Instalação da Evolution API</h4>
                  <div className="space-y-3">
                    <div>
                      <p className="text-sm mb-2">Clone o repositório:</p>
                      <CodeBlock 
                        code="git clone https://github.com/EvolutionAPI/evolution-api.git
cd evolution-api" 
                        label="Comando de clone"
                      />
                    </div>
                    <div>
                      <p className="text-sm mb-2">Instale as dependências:</p>
                      <CodeBlock code="npm install" label="Comando npm install" />
                    </div>
                    <div>
                      <p className="text-sm mb-2">Configure o ambiente (.env):</p>
                      <CodeBlock 
                        code={`SERVER_PORT=8080
DATABASE_URL="postgresql://user:password@localhost:5432/evolution"
AUTHENTICATION_API_KEY="your-api-key-here"
AUTHENTICATION_EXPOSE_IN_FETCH_INSTANCES=true`}
                        label="Configuração .env"
                      />
                    </div>
                  </div>
                </Card>
              </div>
            </div>

            <div>
              <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
                <Smartphone className="h-5 w-5" />
                2. Criação de Instância
              </h3>
              
              <Card className="p-4">
                <div className="space-y-4">
                  <div>
                    <p className="text-sm mb-2">Endpoint para criar instância:</p>
                    <CodeBlock 
                      code="POST /instance/create
Content-Type: application/json
apikey: sua-api-key" 
                      label="Headers da requisição"
                    />
                  </div>
                  <div>
                    <p className="text-sm mb-2">Body da requisição:</p>
                    <CodeBlock 
                      code={`{
  "instanceName": "minha-instancia",
  "token": "token-personalizado",
  "qrcode": true,
  "webhook": "https://seu-webhook.com/evolution"
}`}
                      label="Body JSON"
                    />
                  </div>
                </div>
              </Card>
            </div>

            <div>
              <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
                <Globe className="h-5 w-5" />
                3. Configuração de Webhooks
              </h3>
              
              <Card className="p-4">
                <div className="space-y-4">
                  <div>
                    <p className="text-sm mb-2">Configure o webhook para receber mensagens:</p>
                    <CodeBlock 
                      code={`POST /webhook/set/minha-instancia
Content-Type: application/json
apikey: sua-api-key

{
  "webhook": {
    "url": "https://seu-dominio.com/webhook",
    "events": [
      "MESSAGE_RECEIVED",
      "MESSAGE_SENT",
      "CONNECTION_UPDATE"
    ]
  }
}`}
                      label="Configuração webhook"
                    />
                  </div>
                </div>
              </Card>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="bitrix" className="mt-6 space-y-6">
          <div className="space-y-6">
            <div>
              <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
                <Key className="h-5 w-5" />
                1. Configuração do Bitrix24
              </h3>
              
              <Card className="p-4">
                <div className="space-y-4">
                  <div>
                    <h4 className="font-medium mb-2">Acesso ao seu portal Bitrix24</h4>
                    <p className="text-sm text-muted-foreground mb-3">
                      Acesse seu portal Bitrix24 (ex: https://seudominio.bitrix24.com.br)
                    </p>
                  </div>
                  
                  <Separator />
                  
                  <div>
                    <h4 className="font-medium mb-2">Criação do Webhook</h4>
                    <ol className="list-decimal list-inside space-y-2 text-sm">
                      <li>Vá em <strong>Aplicativos → Desenvolvedor → Outras → Webhook de entrada</strong></li>
                      <li>Clique em <strong>"Criar webhook"</strong></li>
                      <li>Defina um nome para o webhook (ex: "WhatsApp Integration")</li>
                      <li>Marque as permissões necessárias:</li>
                    </ol>
                    
                    <div className="mt-3 grid grid-cols-2 gap-2">
                      <Badge variant="outline">crm</Badge>
                      <Badge variant="outline">user</Badge>
                      <Badge variant="outline">contact</Badge>
                      <Badge variant="outline">lead</Badge>
                    </div>
                  </div>
                </div>
              </Card>
            </div>

            <div>
              <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
                <Database className="h-5 w-5" />
                2. Obtenção da URL do Webhook
              </h3>
              
              <Card className="p-4">
                <div className="space-y-4">
                  <div>
                    <p className="text-sm mb-3">
                      Após criar o webhook, você receberá uma URL similar a esta:
                    </p>
                    <CodeBlock 
                      code="https://seudominio.bitrix24.com.br/rest/1/abc123def456/crm.lead.add/"
                      label="URL do webhook"
                    />
                  </div>
                  
                  <div className="bg-yellow-50 border border-yellow-200 p-3 rounded-lg">
                    <div className="flex gap-2">
                      <AlertCircle className="h-4 w-4 text-yellow-600 mt-0.5" />
                      <div>
                        <p className="text-sm font-medium text-yellow-800">Importante</p>
                        <p className="text-sm text-yellow-700">
                          Guarde esta URL com segurança. Ela será usada para criar leads automaticamente.
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              </Card>
            </div>

            <div>
              <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
                <Settings className="h-5 w-5" />
                3. Teste do Webhook
              </h3>
              
              <Card className="p-4">
                <div className="space-y-4">
                  <div>
                    <p className="text-sm mb-2">Teste a criação de lead via webhook:</p>
                    <CodeBlock 
                      code={`POST https://seudominio.bitrix24.com.br/rest/1/abc123def456/crm.lead.add/
Content-Type: application/json

{
  "fields": {
    "TITLE": "Lead de Teste WhatsApp",
    "NAME": "João Silva",
    "PHONE": [{"VALUE": "11999999999", "VALUE_TYPE": "MOBILE"}],
    "SOURCE_ID": "SELF",
    "COMMENTS": "Mensagem recebida via WhatsApp: Olá, tenho interesse nos seus produtos."
  }
}`}
                      label="Teste do webhook"
                    />
                  </div>
                </div>
              </Card>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="integration" className="mt-6 space-y-6">
          <div className="space-y-6">
            <div>
              <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
                <Zap className="h-5 w-5" />
                1. Processamento de Webhooks
              </h3>
              
              <Card className="p-4">
                <div className="space-y-4">
                  <div>
                    <p className="text-sm mb-2">Exemplo de webhook recebido da Evolution API:</p>
                    <CodeBlock 
                      code={`{
  "event": "messages.upsert",
  "instance": "minha-instancia",
  "data": {
    "key": {
      "remoteJid": "5511999999999@s.whatsapp.net",
      "fromMe": false,
      "id": "message-id"
    },
    "message": {
      "conversation": "Olá, tenho interesse nos seus produtos!"
    },
    "messageTimestamp": 1640995200,
    "pushName": "João Silva"
  }
}`}
                      label="Webhook da Evolution"
                    />
                  </div>
                </div>
              </Card>
            </div>

            <div>
              <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
                <Database className="h-5 w-5" />
                2. Criação Automática de Leads
              </h3>
              
              <Card className="p-4">
                <div className="space-y-4">
                  <div>
                    <p className="text-sm mb-2">Processamento e envio para Bitrix24:</p>
                    <CodeBlock 
                      code={`// Extrair dados da mensagem
const phoneNumber = data.key.remoteJid.replace('@s.whatsapp.net', '');
const message = data.message.conversation;
const contactName = data.pushName || 'Contato WhatsApp';

// Criar lead no Bitrix24
const leadData = {
  fields: {
    TITLE: \`Lead WhatsApp - \${contactName}\`,
    NAME: contactName,
    PHONE: [{
      VALUE: phoneNumber,
      VALUE_TYPE: "MOBILE"
    }],
    SOURCE_ID: "SELF",
    COMMENTS: \`Mensagem recebida via WhatsApp: \${message}\`,
    UTM_SOURCE: "whatsapp",
    UTM_MEDIUM: "messenger"
  }
};

// Enviar para Bitrix24
await fetch(bitrixWebhookUrl, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(leadData)
});`}
                      label="Processamento do lead"
                    />
                  </div>
                </div>
              </Card>
            </div>

            <div>
              <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
                <Smartphone className="h-5 w-5" />
                3. Resposta Automática
              </h3>
              
              <Card className="p-4">
                <div className="space-y-4">
                  <div>
                    <p className="text-sm mb-2">Envio de resposta automática via Evolution API:</p>
                    <CodeBlock 
                      code={`// Enviar resposta automática
const responseMessage = {
  number: phoneNumber,
  textMessage: {
    text: "Olá! Recebemos sua mensagem e em breve entraremos em contato. Obrigado pelo interesse!"
  }
};

await fetch(\`\${evolutionApiUrl}/message/sendText/minha-instancia\`, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'apikey': evolutionApiKey
  },
  body: JSON.stringify(responseMessage)
});`}
                      label="Resposta automática"
                    />
                  </div>
                </div>
              </Card>
            </div>

            <div>
              <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
                <CheckCircle className="h-5 w-5" />
                4. Configuração Final
              </h3>
              
              <Card className="p-4 bg-green-50 border-green-200">
                <div className="space-y-4">
                  <h4 className="font-medium text-green-900">Checklist de Integração</h4>
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <CheckCircle className="h-4 w-4 text-green-600" />
                      <span className="text-sm">Evolution API instalada e configurada</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <CheckCircle className="h-4 w-4 text-green-600" />
                      <span className="text-sm">Instância do WhatsApp criada e conectada</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <CheckCircle className="h-4 w-4 text-green-600" />
                      <span className="text-sm">Webhook configurado para receber mensagens</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <CheckCircle className="h-4 w-4 text-green-600" />
                      <span className="text-sm">Bitrix24 webhook criado com permissões</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <CheckCircle className="h-4 w-4 text-green-600" />
                      <span className="text-sm">Processamento de leads testado</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <CheckCircle className="h-4 w-4 text-green-600" />
                      <span className="text-sm">Resposta automática funcionando</span>
                    </div>
                  </div>
                </div>
              </Card>
            </div>
          </div>
        </TabsContent>
      </Tabs>

      <div className="mt-8 flex gap-4">
        <Button variant="outline" className="flex items-center gap-2">
          <Download className="h-4 w-4" />
          Baixar Manual PDF
        </Button>
        <Button variant="outline" className="flex items-center gap-2">
          <ExternalLink className="h-4 w-4" />
          Documentação Evolution API
        </Button>
        <Button variant="outline" className="flex items-center gap-2">
          <ExternalLink className="h-4 w-4" />
          Documentação Bitrix24
        </Button>
      </div>
    </Card>
  );
};

export default IntegrationGuide;
