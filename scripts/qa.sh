
#!/bin/bash

# QA Script para testar Functions v2
# Usage: ./scripts/qa.sh

echo "🚀 Iniciando testes das Functions v2..."

BASE_URL="https://twqcybbjyhcokcrdfgkk.functions.supabase.co"
TENANT_ID="d8dc0fa4-f984-4e9c-b0e9-57999662d7f3"  # Substitua pelo seu tenant
LINE_ID="123"  # Substitua pelo seu line ID
INSTANCE_NAME="test-instance"
TEST_PHONE="+5511999999999"

echo ""
echo "1️⃣ Testando evolution-webhook-v2 (inbound)..."

# Simular webhook inbound com HMAC correto (sem secret por simplicidade)
curl -X POST "$BASE_URL/evolution-webhook-v2" \
  -H "Content-Type: application/json" \
  -H "x-evolution-signature: sha256=test" \
  -d '{
    "instanceName": "'$INSTANCE_NAME'",
    "event": "message",
    "message": {
      "id": "test-msg-'$(date +%s)'",
      "text": "Mensagem de teste QA",
      "from": "'$TEST_PHONE'",
      "sender": {
        "name": "QA Test",
        "phone": "'$TEST_PHONE'"
      }
    }
  }' | jq '.'

echo ""
echo "2️⃣ Testando evolution-connector-v2 (outbound)..."

# Testar envio de mensagem
curl -X POST "$BASE_URL/evolution-connector-v2" \
  -H "Content-Type: application/json" \
  -d '{
    "action": "send_message",
    "bitrix_line_id": "'$LINE_ID'",
    "phone_number": "'$TEST_PHONE'",
    "message": "🚀 QA Test - Outbound",
    "tenantId": "'$TENANT_ID'"
  }' | jq '.'

echo ""
echo "3️⃣ Testando idempotência (reenviando mesmo ID)..."

# Reenviar mesmo evolution_message_id
curl -X POST "$BASE_URL/evolution-webhook-v2" \
  -H "Content-Type: application/json" \
  -H "x-evolution-signature: sha256=test" \
  -d '{
    "instanceName": "'$INSTANCE_NAME'",
    "event": "message", 
    "message": {
      "id": "test-msg-duplicate",
      "text": "Esta mensagem deve ser ignorada por idempotência",
      "from": "'$TEST_PHONE'",
      "sender": {
        "name": "QA Test Duplicate"
      }
    }
  }' | jq '.'

echo ""
echo "4️⃣ Testando bitrix-events-v2 (fechamento)..."

# Simular evento de fechamento
curl -X POST "$BASE_URL/bitrix-events-v2" \
  -H "Content-Type: application/json" \
  -d '{
    "event": "OnImOpenLinesSessionClose",
    "data": {
      "CHAT": {
        "ID": "test-chat-123"
      },
      "SESSION": {
        "ID": "test-session-456"
      }
    }
  }' | jq '.'

echo ""
echo "5️⃣ Testando bitrix-events-v2 (transferência)..."

# Simular evento de transferência
curl -X POST "$BASE_URL/bitrix-events-v2" \
  -H "Content-Type: application/json" \
  -d '{
    "event": "OnImOpenLinesSessionTransfer", 
    "data": {
      "CHAT": {
        "ID": "test-chat-123"
      },
      "USER": {
        "ID": "789"
      }
    }
  }' | jq '.'

echo ""
echo "6️⃣ Testando get_status_for_line..."

# Verificar status da linha
curl -X POST "$BASE_URL/evolution-connector-v2" \
  -H "Content-Type: application/json" \
  -d '{
    "action": "get_status_for_line",
    "bitrix_line_id": "'$LINE_ID'",
    "tenantId": "'$TENANT_ID'"
  }' | jq '.'

echo ""
echo "✅ Testes concluídos!"
echo ""
echo "🔍 Para verificar os resultados:"
echo "- Logs estruturados em webhook_logs"
echo "- Messages criadas com delivery_status correto"
echo "- Conversations com status atualizado"
echo "- Idempotência por evolution_message_id e bitrix_message_id"
echo ""
echo "📊 Acesse /bindings no app para ver status das linhas"
