# EvoWhats - WhatsApp + Bitrix24 Integration

Sistema de integração entre WhatsApp (via Evolution API) e Bitrix24 para gerenciamento unificado de conversas e leads.

## Arquitetura

### Frontend (React + TypeScript)
- **Dashboard**: Monitoramento e diagnósticos
- **Configurações**: Gestão de conexões e parâmetros
- **Autenticação**: Via Supabase Auth

### Backend (Supabase Edge Functions)
- `evolution-connector-v2`: Adaptador para Evolution API
- `evolution-webhook-v2`: Receptor de webhooks da Evolution
- `bitrix-events-v2`: Receptor de eventos do Bitrix24
- `bitrix-openlines-manager`: Gerenciador de canais abertos
- Demais funções de OAuth e sincronização

### Integração
- **Evolution API**: Gerenciamento de instâncias WhatsApp
- **Bitrix24**: CRM e Open Lines via OAuth2
- **Supabase**: Banco de dados, autenticação e Edge Functions

## Configuração

1. **Clone o projeto**
   ```bash
   git clone <repo-url>
   cd evowhats
   ```

2. **Instale dependências**
   ```bash
   npm install
   ```

3. **Configure variáveis de ambiente**
   ```bash
   cp .env.example .env
   # Edite .env com suas credenciais Supabase
   ```

4. **Configure secrets no Supabase**
   - `EVOLUTION_BASE_URL`: URL da Evolution API (sem barra final)
   - `EVOLUTION_API_KEY`: Token de acesso da Evolution
   - `SUPABASE_URL` e `SUPABASE_SERVICE_ROLE_KEY`: Credenciais do projeto

5. **Deploy das Edge Functions**
   ```bash
   supabase functions deploy
   ```

6. **Execute o projeto**
   ```bash
   npm run dev
   ```

## Estrutura de Pastas

```
src/
├── components/         # Componentes React
│   ├── ui/            # Componentes base (shadcn)
│   ├── bitrix/        # Componentes específicos Bitrix
│   └── Diagnostics.tsx # Painel de diagnósticos unificado
├── hooks/             # Hooks customizados
├── pages/             # Páginas da aplicação
├── services/          # Integrações externas
├── utils/             # Utilitários
└── lib/               # Bibliotecas e configurações

supabase/
└── functions/         # Edge Functions (apenas *-v2)
    ├── evolution-connector-v2/
    ├── evolution-webhook-v2/
    ├── bitrix-events-v2/
    └── bitrix-openlines-manager/
```

## Recursos

- ✅ Autenticação via Supabase
- ✅ Integração WhatsApp via Evolution API  
- ✅ Integração Bitrix24 via OAuth2
- ✅ Sincronização bidirecional de mensagens
- ✅ Monitoramento em tempo real
- ✅ Diagnósticos automáticos
- ✅ Rate limiting e segurança

## Desenvolvimento

Para contribuir:

1. Siga o padrão de commits convencionais
2. Mantenha cobertura de testes
3. Use TypeScript strict mode
4. Respeite as políticas RLS do Supabase
5. Implemente logging estruturado nas Edge Functions

## Troubleshooting

### Função retorna "Unknown action"
- Verifique se as Edge Functions v2 estão deployadas
- Confirme se o project-ref está correto no frontend
- Execute diagnósticos no painel

### Erro de CORS
- Verifique se as functions respondem adequadamente a OPTIONS
- Confirme os headers CORS nas Edge Functions

### Problemas de autenticação
- Verifique se os secrets estão configurados no Supabase
- Confirme se as RLS policies estão ativas
- Execute teste de conexão no painel

## Licença

MIT License