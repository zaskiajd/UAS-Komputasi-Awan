#!/usr/bin/env bash
# =============================================================================
# deploy/scripts/import-db.sh — Impor skema + data awal CampusCare ke database
# -----------------------------------------------------------------------------
# Pemakaian (dari folder repo, SEKALI saja pada database yang masih kosong):
#   deploy/scripts/import-db.sh
#   deploy/scripts/import-db.sh --force   # paksa walau tabel users sudah ada
#
# Mengimpor backend/db/campuscare_full.sql (schema.sql + seed.sql) ke database
# di DATABASE_URL (.env). psql dijalankan di container postgres:16-alpine,
# jadi host tidak perlu memasang psql.
#
# PERINGATAN: data seed bersifat "upsert". Bila dijalankan pada database yang
# SUDAH berisi, akun demo (termasuk sandinya), aset seed, dan teknisi seed
# akan DITIMPA kembali ke nilai awal.
# =============================================================================

set -euo pipefail

# shellcheck source=_lib.sh
source "$(dirname "${BASH_SOURCE[0]}")/_lib.sh"

usage() {
  sed -n '3,16p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'
}

FORCE=0
for arg in "$@"; do
  case "$arg" in
    --force) FORCE=1 ;;
    -h | --help) usage; exit 0 ;;
    *) die "Argumen tidak dikenal: $arg (pakai --help)" ;;
  esac
done

SQL_FILE="$REPO_DIR/backend/db/campuscare_full.sql"
[ -f "$SQL_FILE" ] || die "Berkas tidak ditemukan: $SQL_FILE"

load_env
require_database_url
require_docker
ensure_pg_image

info "Database tujuan: $(mask_url "$DATABASE_URL")"
info "Mengecek koneksi dan isi database..."

users_exists="$(psql_docker -X -q -t -A -v ON_ERROR_STOP=1 \
  -c "SELECT to_regclass('public.users') IS NOT NULL")" \
  || die "Tidak bisa terhubung ke database. Periksa DATABASE_URL, firewall VM database, dan pg_hba.conf."

if [ "$users_exists" = "t" ]; then
  if [ "$FORCE" -ne 1 ]; then
    die "Tabel 'users' SUDAH ada di database ini, jadi impor dibatalkan.
       Impor ulang akan MENIMPA akun demo (termasuk sandinya), aset seed, dan teknisi seed.
       Bila database ini hanya perlu kolom/tabel baru, jalankan migrasi (deploy/scripts/migrate.sh).
       Bila benar-benar ingin menimpa, buat backup dulu (deploy/scripts/backup-db.sh),
       lalu jalankan ulang dengan: deploy/scripts/import-db.sh --force"
  fi
  warn "Opsi --force dipakai: tabel users sudah ada dan data seed akan ditimpa."
fi

cat <<'EOF'

  Skrip ini akan mengimpor backend/db/campuscare_full.sql:
    - membuat tabel, view, dan fungsi CampusCare (bila belum ada);
    - mengisi data awal: 2 akun demo, tim, teknisi, kategori, lokasi, aset, tiket contoh.
  Data seed bersifat upsert: pada database yang sudah berisi, akun demo,
  aset seed, dan teknisi seed akan DITIMPA ke nilai awal.

EOF

answer=""
read -r -p "Ketik YA (huruf besar) untuk melanjutkan: " answer || true
[ "$answer" = "YA" ] || die "Dibatalkan. Tidak ada perubahan pada database."

info "Mengimpor... (berhenti otomatis bila ada error)"
psql_docker -X -q -v ON_ERROR_STOP=1 -f - < "$SQL_FILE"

cat <<'EOF'

==> Impor selesai.
    LANGKAH WAJIB BERIKUTNYA: ganti sandi akun demo, karena sandi bawaan seed
    tercantum di repo dan diketahui publik:
      deploy/scripts/set-demo-passwords.sh
EOF
