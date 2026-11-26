#!/usr/bin/env bash
# Rede de segurança simples. Não garante que não há segredos: apanha os erros mais comuns.
# Mostra só os NOMES dos ficheiros, para nunca imprimir um segredo nos registos.
set -uo pipefail

cd "$(dirname "$0")/.."
status=0

echo "1. Chaves privadas"
if git grep -lE -e '-----BEGIN [A-Z ]*PRIVATE KEY-----' -- . ':!scripts/check-secrets.sh'; then
  echo "ERRO: há uma chave privada no repositório." >&2
  status=1
fi

echo "2. JWT escritos no código (por exemplo, a service_role ou a anon coladas)"
if git grep -lE 'eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{10,}' -- . ':!scripts/check-secrets.sh'; then
  echo "ERRO: há um JWT escrito num ficheiro." >&2
  status=1
fi

echo "3. Chave service_role no app ou no painel"
if git grep -liE 'service_role_key' -- apps/mobile/src apps/admin/src; then
  echo "ERRO: a chave service_role nunca pode estar no app nem no painel." >&2
  status=1
fi

echo "4. Ficheiros .env versionados"
if git ls-files | grep -E '(^|/)\.env(\..*)?$' | grep -vE '\.env\.example$'; then
  echo "ERRO: há ficheiros .env no repositório. Só .env.example é permitido." >&2
  status=1
fi

if [ "$status" -eq 0 ]; then
  echo "Sem problemas encontrados."
fi
exit "$status"
