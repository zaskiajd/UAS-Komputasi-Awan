#!/usr/bin/env bash
# =============================================================================
# deploy/scripts/backup-db.sh — Backup database PostgreSQL CampusCare
# -----------------------------------------------------------------------------
# Pemakaian (dari folder repo):
#   deploy/scripts/backup-db.sh
#
# Menyimpan hasil pg_dump terkompresi (.sql.gz) ke folder ./backups/
# dengan nama campuscare_YYYYmmdd_HHMM.sql.gz dan otomatis menyisakan
# 7 berkas backup terbaru saja agar disk VM tidak penuh.
# pg_dump dijalankan lewat container postgres:16-alpine (host tidak perlu
# memasang postgresql-client).
# =============================================================================

set -euo pipefail

# shellcheck source=_lib.sh
source "$(dirname "${BASH_SOURCE[0]}")/_lib.sh"

BACKUP_DIR="$REPO_DIR/backups"
KEEP_COUNT=7

load_env
require_database_url
require_docker
ensure_pg_image

mkdir -p "$BACKUP_DIR"

timestamp="$(date +%Y%m%d_%H%M)"
outfile="$BACKUP_DIR/campuscare_${timestamp}.sql.gz"
tmpfile="${outfile}.tmp"

# Hapus berkas sementara bila proses gagal di tengah jalan.
trap 'rm -f "$tmpfile"' EXIT

info "Database sumber : $(mask_url "$DATABASE_URL")"
info "Menyimpan backup ke $outfile ..."

# --no-owner & --no-privileges agar file lebih mudah di-restore ke user/DB lain.
pg_docker pg_dump --no-owner --no-privileges | gzip -c > "$tmpfile"

# Pastikan file tidak kosong sebelum mengganti nama final.
[ -s "$tmpfile" ] || die "Hasil backup kosong. Periksa koneksi ke database."
mv "$tmpfile" "$outfile"

size="$(du -h "$outfile" | cut -f1)"
info "Backup selesai ($size): $outfile"

# Hapus backup lama, sisakan 7 terbaru berdasarkan nama/waktu.
mapfile -t all_backups < <(ls -1t "$BACKUP_DIR"/campuscare_*.sql.gz 2>/dev/null || true)
if [ "${#all_backups[@]}" -gt "$KEEP_COUNT" ]; then
  info "Membersihkan backup lama (menyisakan $KEEP_COUNT terbaru)..."
  for old in "${all_backups[@]:$KEEP_COUNT}"; do
    rm -f "$old"
    echo "  Dihapus: $(basename "$old")"
  done
fi
