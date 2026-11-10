#!/usr/bin/env bash
# ============================================================================
# db/reset.sh — Drop schema public lalu import ulang campuscare_full.sql
#
# Pemakaian:
#   cd backend
#   cp .env.example .env     # lalu isi DATABASE_URL
#   npm run db:reset
#
# Peringatan: script ini MENGHAPUS seluruh objek di schema public database
# yang ditunjuk DATABASE_URL. Hanya jalankan pada database development/demo.
# ============================================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
ENV_FILE="$BACKEND_DIR/.env"
FULL_SQL="$SCRIPT_DIR/campuscare_full.sql"

# Muat .env sederhana (KEY=VALUE) sambil membuang karakter CR dari Windows.
if [ -f "$ENV_FILE" ]; then
  while IFS= read -r line || [ -n "$line" ]; do
    line="${line%$'\r'}"
    case "$line" in
      '' | \#*) continue ;;
    esac
    export "$line"
  done < "$ENV_FILE"
fi

if [ -z "${DATABASE_URL:-}" ]; then
  echo "ERROR: DATABASE_URL belum diset. Isi $ENV_FILE atau export DATABASE_URL." >&2
  exit 1
fi

if ! command -v psql >/dev/null 2>&1; then
  echo "ERROR: psql tidak ditemukan di PATH. Install PostgreSQL client dulu." >&2
  exit 1
fi

if [ ! -f "$FULL_SQL" ]; then
  echo "ERROR: file tidak ditemukan: $FULL_SQL" >&2
  exit 1
fi

echo "==> Menghapus schema public..."
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 \
  -c 'DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public; GRANT ALL ON SCHEMA public TO public;'

echo "==> Mengimpor campuscare_full.sql..."
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f "$FULL_SQL"

echo "==> Selesai. Database CampusCare siap dipakai."
