#!/usr/bin/env bash
# =============================================================================
# deploy/scripts/migrate.sh — Menjalankan SATU berkas migrasi SQL
# -----------------------------------------------------------------------------
# Pemakaian (dari folder repo):
#   deploy/scripts/migrate.sh backend/db/migrations/002_google_auth.sql
#   deploy/scripts/migrate.sh 002_google_auth.sql      # cukup nama berkasnya
#
# Migrasi dipakai untuk database yang SUDAH berisi data, agar mendapat
# kolom/tabel baru tanpa menimpa data. Berkas migrasi CampusCare idempotent
# (aman dijalankan ulang). Eksekusi berhenti pada error pertama (ON_ERROR_STOP).
# Catatan: database yang baru diimpor dari campuscare_full.sql sudah memuat
# semua perubahan migrasi yang ada saat ini.
# =============================================================================

set -euo pipefail

# shellcheck source=_lib.sh
source "$(dirname "${BASH_SOURCE[0]}")/_lib.sh"

MIGRATIONS_DIR="$REPO_DIR/backend/db/migrations"

list_migrations() {
  echo "Migrasi yang tersedia:"
  local f
  for f in "$MIGRATIONS_DIR"/*.sql; do
    [ -e "$f" ] && echo "  backend/db/migrations/$(basename "$f")"
  done
}

if [ "$#" -ne 1 ] || [ "$1" = "-h" ] || [ "$1" = "--help" ]; then
  echo "Pemakaian: deploy/scripts/migrate.sh backend/db/migrations/00X_nama.sql"
  list_migrations
  [ "$#" -eq 1 ] && exit 0
  exit 1
fi

file="$1"
# Izinkan hanya nama berkas (tanpa folder).
if [ ! -f "$file" ] && [ -f "$MIGRATIONS_DIR/$file" ]; then
  file="$MIGRATIONS_DIR/$file"
fi
[ -f "$file" ] || { list_migrations; die "Berkas migrasi tidak ditemukan: $1"; }

# Pastikan berkas benar-benar berada di backend/db/migrations dan bernama 00X_*.sql.
abs="$(cd "$(dirname "$file")" && pwd)/$(basename "$file")"
case "$abs" in
  "$MIGRATIONS_DIR"/*) ;;
  *) die "Hanya berkas di backend/db/migrations/ yang boleh dijalankan: $1" ;;
esac
[[ "$(basename "$abs")" =~ ^[0-9]{3}_.+\.sql$ ]] \
  || die "Nama berkas migrasi harus berbentuk 00X_nama.sql: $(basename "$abs")"

load_env
require_database_url
require_docker
ensure_pg_image

info "Database tujuan : $(mask_url "$DATABASE_URL")"
info "Migrasi         : backend/db/migrations/$(basename "$abs")"

psql_docker -X -v ON_ERROR_STOP=1 -f - < "$abs"

info "Migrasi $(basename "$abs") selesai."
