#!/usr/bin/env bash
# Corre todos os ficheiros supabase/tests/*_smoke.sql. Cada um termina com "rollback".
# Uso local (Supabase local a correr):  bash scripts/run-sql-tests.sh
# Num projeto de TESTES do Supabase:    ALLOW_SQL_TESTS=yes DATABASE_URL=postgresql://... bash scripts/run-sql-tests.sh
set -euo pipefail

DB_URL="${DATABASE_URL:-postgresql://postgres:postgres@127.0.0.1:54322/postgres}"

case "$DB_URL" in
  *@127.0.0.1:* | *@localhost:*) ;;
  *)
    if [ "${ALLOW_SQL_TESTS:-}" != "yes" ]; then
      echo "Recusado: DATABASE_URL não é uma base local." >&2
      echo "Estes testes escrevem dados (e fazem rollback), por isso só devem correr num projeto de TESTES." >&2
      echo "Se é mesmo um projeto de testes, repita com ALLOW_SQL_TESTS=yes." >&2
      exit 2
    fi
    ;;
esac

if ! command -v psql >/dev/null 2>&1; then
  echo "O comando psql não foi encontrado. Instale o cliente do PostgreSQL." >&2
  exit 2
fi

cd "$(dirname "$0")/.."
shopt -s nullglob
files=(supabase/tests/*_smoke.sql)

if [ "${#files[@]}" -eq 0 ]; then
  echo "Nenhum teste SQL encontrado em supabase/tests." >&2
  exit 2
fi

failed=0
for file in "${files[@]}"; do
  echo "== ${file}"
  if ! psql "$DB_URL" -v ON_ERROR_STOP=1 -q -f "$file"; then
    echo "FALHOU: ${file}" >&2
    failed=$((failed + 1))
  fi
done

echo "Ficheiros: ${#files[@]}. Falhas: ${failed}."
[ "$failed" -eq 0 ]
