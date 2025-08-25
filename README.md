
# Welcome to your Lovable project

## Project info

**URL**: https://lovable.dev/projects/cc36407e-faf0-456e-8337-8cf59bc73db3

## How can I edit this code?

There are several ways of editing your application.

**Use Lovable**

Simply visit the [Lovable Project](https://lovable.dev/projects/cc36407e-faf0-456e-8337-8cf59bc73db3) and start prompting.

Changes made via Lovable will be committed automatically to this repo.

**Use your preferred IDE**

If you want to work locally using your own IDE, you can clone this repo and push changes. Pushed changes will also be reflected in Lovable.

The only requirement is having Node.js & npm installed - [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating)

Follow these steps:

```sh
# Step 1: Clone the repository using the project's Git URL.
git clone <YOUR_GIT_URL>

# Step 2: Navigate to the project directory.
cd <YOUR_PROJECT_NAME>

# Step 3: Install the necessary dependencies.
npm i

# Step 4: Start the development server with auto-reloading and an instant preview.
npm run dev
```

**Edit a file directly in GitHub**

- Navigate to the desired file(s).
- Click the "Edit" button (pencil icon) at the top right of the file view.
- Make your changes and commit the changes.

**Use GitHub Codespaces**

- Navigate to the main page of your repository.
- Click on the "Code" button (green button) near the top right.
- Select the "Codespaces" tab.
- Click on "New codespace" to launch a new Codespace environment.
- Edit files directly within the Codespace and commit and push your changes once you're done.

## What technologies are used for this project?

This project is built with:

- Vite
- TypeScript
- React
- shadcn-ui
- Tailwind CSS

## How can I deploy this project?

Simply open [Lovable](https://lovable.dev/projects/cc36407e-faf0-456e-8337-8cf59bc73db3) and click on Share -> Publish.

## Can I connect a custom domain to my Lovable project?

Yes, you can!

To connect a domain, navigate to Project > Settings > Domains and click Connect Domain.

Read more here: [Setting up a custom domain](https://docs.lovable.dev/tips-tricks/custom-domain#step-by-step-guide)

---

## Plano B - Functions v2 (Melhorias Implementadas)

### 🆕 Functions v2 Criadas

Este projeto agora inclui versões v2 das Edge Functions com melhorias significativas:

#### 1. `bitrix-events-v2`
- ✅ Eventos de fechamento/transferência de sessão Open Lines
- ✅ Validação de assinatura HMAC do Bitrix
- ✅ Logs estruturados com categorias (OL, SECURITY)
- ✅ Atualização de `conversations.status` e `assigned_user_id`
- ✅ Idempotência por `bitrix_message_id`

#### 2. `bitrix-events-bind-v2`
- ✅ Registro de eventos adicionais:
  - `OnImOpenLinesSessionClose`
  - `OnImOpenLinesSessionFinish`
  - `OnImOpenLinesSessionTransfer`
  - `OnImOpenLinesOperatorAssign`
- ✅ Aponta todos os eventos para `bitrix-events-v2`
- ✅ Logs de sucesso em `webhook_logs`

#### 3. `evolution-webhook-v2`
- ✅ Validação HMAC com `x-evolution-signature`
- ✅ Logs estruturados (INBOUND, EVO, SECURITY)
- ✅ Idempotência por `evolution_message_id`
- ✅ Rejeição de payloads com assinatura inválida

#### 4. `evolution-connector-v2`
- ✅ Sistema de retries com backoff (1s, 3s, 7s)
- ✅ Atualização de `delivery_status`: queued → sent/failed
- ✅ Logs detalhados de tentativas e falhas
- ✅ Endpoint `get_status_for_line` para verificar status

### 🖥️ Nova UI - Bindings Dashboard

Acesse `/bindings` para:
- 📊 Ver status das instâncias em tempo real
- 🧪 Testar envio de mensagens
- 🔄 Atualizar status das linhas
- 📝 Logs detalhados de conectividade

### 🔧 Como Migrar para v2

#### 1. Rebind Eventos Bitrix
```bash
curl -X POST "https://twqcybbjyhcokcrdfgkk.functions.supabase.co/bitrix-events-bind-v2" \
  -H "Content-Type: application/json" \
  -d '{
    "portalUrl": "https://seu-portal.bitrix24.com.br",
    "accessToken": "seu_access_token",
    "tenantId": "seu_tenant_id"
  }'
```

#### 2. Atualizar Webhook Evolution
No painel Evolution API, altere a URL do webhook para:
```
https://twqcybbjyhcokcrdfgkk.functions.supabase.co/evolution-webhook-v2
```

#### 3. Configurar Secrets (Opcional)
Para validação HMAC, configure:
- `EVOLUTION_WEBHOOK_SECRET` - Secret do webhook Evolution
- `BITRIX_APP_SECRET` - Secret da aplicação Bitrix

### 🧪 Testes Automatizados

Execute o script de QA:
```bash
chmod +x scripts/qa.sh
./scripts/qa.sh
```

O script testa:
1. ✅ Webhooks inbound com HMAC
2. ✅ Envio outbound com retries
3. ✅ Idempotência de mensagens
4. ✅ Eventos de fechamento/transferência
5. ✅ Status das linhas

### 📊 Observabilidade

Todos os logs seguem o padrão estruturado:
```json
{
  "category": "INBOUND|OUTBOUND|OL|EVO|BIND|SECURITY",
  "tenantId": "uuid",
  "instanceId": "string",
  "conversationId": "uuid", 
  "chatId": "string",
  "direction": "in|out",
  "provider": "evolution|bitrix|system",
  "msgKey": "string",
  "valid_signature": boolean
}
```

### 🚀 Próximos Passos

1. Execute `bitrix-events-bind-v2` para registrar eventos
2. Altere webhook Evolution para `evolution-webhook-v2`
3. Acesse `/bindings` para monitorar status
4. Execute `scripts/qa.sh` para validar funcionamento
5. Configure secrets HMAC para máxima segurança

### 📁 Estrutura v2

```
supabase/functions/
├── bitrix-events-v2/          # Eventos Bitrix com fechamento/transferência
├── bitrix-events-bind-v2/     # Bind eventos apontando para v2
├── evolution-webhook-v2/      # Webhook Evolution com HMAC
├── evolution-connector-v2/    # Conector com retries
└── log-structured-event/      # Helper de logs estruturados

src/
├── lib/log.ts                 # Helper de logs padronizados
└── pages/BindingsDashboard.tsx # Nova UI para status/teste
```

As functions originais permanecem intactas. Use as versões v2 para todas as novas integrações.
