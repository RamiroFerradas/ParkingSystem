#!/usr/bin/env bash
# Aplica las migraciones SQL en orden contra el PostgreSQL local (Docker).
set -euo pipefail
cd "$(dirname "$0")/.."

# Git Bash (MSYS) convierte rutas tipo /migrations/... en rutas de Windows; evitarlo
export MSYS_NO_PATHCONV=1
export MSYS2_ARG_CONV_EXCL="*"

COMPOSE="docker compose"
PSQL=(docker compose exec -T db psql -v ON_ERROR_STOP=1 -q -U "${POSTGRES_USER:-parking}" -d "${POSTGRES_DB:-parking}")

# Asegura tabla de control de migraciones
"${PSQL[@]}" -c "CREATE TABLE IF NOT EXISTS schema_migrations (
  filename text PRIMARY KEY,
  applied_at timestamptz NOT NULL DEFAULT now()
);" > /dev/null

for file in db/migrations/*.sql; do
  name="$(basename "$file")"
  already=$("${PSQL[@]}" -tA -c "SELECT 1 FROM schema_migrations WHERE filename = '$name';" || true)
  if [ "$already" = "1" ]; then
    echo "· $name (ya aplicada)"
    continue
  fi
  echo "→ Aplicando $name ..."
  "${PSQL[@]}" -f "/migrations/$name"
  "${PSQL[@]}" -c "INSERT INTO schema_migrations (filename) VALUES ('$name');" > /dev/null
  echo "✓ $name aplicada"
done
echo "Migraciones al día."
