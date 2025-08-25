
#!/usr/bin/env bash
set -euo pipefail

# ===== Config =====
# URL base das Edge Functions (local ou produção)
BASE_URL="${BASE_URL:-http://localhost:54321/functions/v1}"
# ID da linha do Open Lines a testar (ex.: 15)
LINE_ID="${LINE_ID:-}"
# Número de teste (E.164), ex.: +5511999999999
TEST_PHONE="${TEST_PHONE:-}"
# Quantas tentativas de polling de status (Evolution)
POLL_TRIES="${POLL_TRIES:-10}"
POLL_SLEEP="${POLL_SLEEP:-3}"   # segundos

if ! command -v jq >/dev/null 2>&1; then
  echo "❌ jq não encontrado. Instale 'jq' e tente novamente."
  exit 1
fi

echo "▶️  QA iniciado"
echo "    BASE_URL   = $BASE_URL"
echo "    LINE_ID    = ${LINE_ID:-<vazio>}"
echo "    TEST_PHONE = ${TEST_PHONE:-<vazio>}"
echo

# Pequeno helper
post_json () {
  local fn="$1"; shift
  local body="$1"; shift || true
  curl -sS -X POST "$BASE_URL/$fn" \
    -H 'Content-Type: application/json' \
    -d "$body"
}

step () {
  echo
  echo "===== $* ====="
}

# 1) BITRIX TOKEN REFRESH
step "1) Bitrix: token refresh"
REFRESH="$(post_json bitrix-token-refresh '{}')"
echo "$REFRESH" | jq .
OK="$(echo "$REFRESH" | jq -r '.ok // false')"
if [ "$OK" != "true" ]; then
  echo "⚠️  Sem token Bitrix para renovar (ok=false). Se é o primeiro uso, faça o OAuth via UI e rode novamente."
else
  REFRESHED="$(echo "$REFRESH" | jq -r '.refreshed // false')"
  if [ "$REFRESHED" = "true" ]; then
    echo "✅ Token renovado com sucesso."
  else
    echo "ℹ️  Token ainda válido (não precisou renovar)."
  fi
fi

# 2) EVOLUTION: LIST INSTANCES
step "2) Evolution: list_instances"
INSTANCES="$(post_json evolution-connector-v2 '{"action":"list_instances"}')"
echo "$INSTANCES" | jq .
FIRST_ID="$(echo "$INSTANCES" | jq -r '.instances[0].id // empty')"

# 3) BIND / ENSURE SESSION PARA A LINE (se informada)
if [ -n "$LINE_ID" ]; then
  step "3) Evolution: ensure_line_session para LINE_ID=$LINE_ID"
  ENSURE="$(post_json evolution-connector-v2 "{\"action\":\"ensure_line_session\",\"bitrix_line_id\":\"$LINE_ID\"}")"
  echo "$ENSURE" | jq .
  ENSURE_OK="$(echo "$ENSURE" | jq -r '.ok // false')"
  if [ "$ENSURE_OK" != "true" ]; then
    echo "❌ ensure_line_session falhou"; exit 1
  fi
  INSTANCE_ID="$(echo "$ENSURE" | jq -r '.instanceId')"
  if [ -z "$INSTANCE_ID" ] || [ "$INSTANCE_ID" = "null" ]; then
    # fallback para primeira instância listada
    INSTANCE_ID="$FIRST_ID"
  fi

  step "4) Evolution: bind_line (instanceId=$INSTANCE_ID, lineId=$LINE_ID)"
  BIND="$(post_json evolution-connector-v2 "{\"action\":\"bind_line\",\"instanceId\":\"$INSTANCE_ID\",\"lineId\":\"$LINE_ID\"}")"
  echo "$BIND" | jq .
  BIND_OK="$(echo "$BIND" | jq -r '.ok // false')"
  if [ "$BIND_OK" != "true" ]; then
    echo "⚠️  bind_line não retornou ok=true (pode já estar vinculado)."
  fi

  step "5) Evolution: start_session_for_line (lineId=$LINE_ID)"
  START="$(post_json evolution-connector-v2 "{\"action\":\"start_session_for_line\",\"lineId\":\"$LINE_ID\"}")"
  echo "$START" | jq .

  # 6) Poll de status + QR
  step "6) Evolution: polling de status"
  TRIES=0
  CONNECTED=0
  NEED_QR=0
  while [ $TRIES -lt $POLL_TRIES ]; do
    STATUS="$(post_json evolution-connector-v2 "{\"action\":\"get_status_for_line\",\"lineId\":\"$LINE_ID\"}")"
    echo "$STATUS" | jq .
    STATE="$(echo "$STATUS" | jq -r '.status // .state // "unknown"' | tr '[:upper:]' '[:lower:]')"
    echo "→ estado: $STATE"
    if echo "$STATE" | grep -Eq 'connected|open'; then
      CONNECTED=1; break
    fi
    if echo "$STATE" | grep -Eq 'qr|pair|connecting|unknown|pending'; then
      NEED_QR=1
      QR="$(post_json evolution-connector-v2 "{\"action\":\"get_qr_for_line\",\"lineId\":\"$LINE_ID\"}")"
      B64="$(echo "$QR" | jq -r '.qr_base64 // .data.qr_base64 // .data.base64 // empty')"
      if [ -n "$B64" ]; then
        echo "$B64" | sed 's#^data:image/png;base64,##' | base64 -d > qr.png || true
        echo "📷 QR salvo em ./qr.png — escaneie no WhatsApp e aguarde conexão."
      fi
    fi
    TRIES=$((TRIES+1))
    sleep "$POLL_SLEEP"
  done

  if [ $CONNECTED -eq 1 ]; then
    echo "✅ Evolution conectado à linha $LINE_ID"
  else
    echo "⚠️  Não conectou dentro do tempo. Se gerou QR, escaneie e rode o script novamente para confirmar."
  fi

  # 7) Teste de envio
  if [ -n "$TEST_PHONE" ]; then
    step "7) Evolution: test_send para $TEST_PHONE (lineId=$LINE_ID)"
    SEND="$(post_json evolution-connector-v2 "{\"action\":\"test_send\",\"lineId\":\"$LINE_ID\",\"to\":\"$TEST_PHONE\",\"text\":\"Ping de teste\"}")"
    echo "$SEND" | jq .
    echo "✅ Solicitação de envio enviada; verifique a entrega no WhatsApp/Logs."
  fi
else
  echo "ℹ️  Pulei os passos de bind/QR/send porque LINE_ID não foi definido."
fi

echo
echo "🎉 QA finalizado."
