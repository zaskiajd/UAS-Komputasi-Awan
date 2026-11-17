#!/usr/bin/env bash
# =============================================================================
# deploy/scripts/backup-uploads.sh — Backup foto pengaduan (named volume)
# -----------------------------------------------------------------------------
# Pemakaian (dari folder repo):
#   deploy/scripts/backup-uploads.sh
#
# Foto disimpan di named volume "campuscare_uploads" (lihat docker-compose.yml
# dan docs/DEPLOY.md). Skrip ini mengarsipkan isi volume ke
# ./backups/uploads_YYYYmmdd_HHMM.tar.gz dan menyisakan 7 arsip terbaru.
# Container alpine sementara dipakai agar host tidak perlu memasang tar khusus;
# volume dipasang read-only sehingga backup tidak mengubah data.
#
# Backup database tetap terpisah: deploy/scripts/backup-db.sh.
# =============================================================================

set -euo pipefail

# shellcheck source=_lib.sh
source "$(dirname "${BASH_SOURCE[0]}")/_lib.sh"

BACKUP_DIR="$REPO_DIR/backups"
KEEP_COUNT=7

# Samakan dengan nama volume di docker-compose.yml. Bisa diganti saat menjalankan:
#   UPLOAD_VOLUME=campuscare_uploads deploy/scripts/backup-uploads.sh
UPLOAD_VOLUME="${UPLOAD_VOLUME:-campuscare_uploads}"
ALPINE_IMAGE="${ALPINE_IMAGE:-alpine:3.20}"

require_docker

docker volume inspect "$UPLOAD_VOLUME" >/dev/null 2>&1 \
  || die "Volume '$UPLOAD_VOLUME' belum ada. Jalankan 'docker compose up -d' terlebih dahulu."

if ! docker image inspect "$ALPINE_IMAGE" >/dev/null 2>&1; then
  info "Mengunduh image $ALPINE_IMAGE (sekali saja)..."
  docker pull "$ALPINE_IMAGE" >&2
fi

mkdir -p "$BACKUP_DIR"

timestamp="$(date +%Y%m%d_%H%M)"
outfile="$BACKUP_DIR/uploads_${timestamp}.tar.gz"
tmpfile="${outfile}.tmp"
archive_name="$(basename "$tmpfile")"

# Hapus arsip sementara bila proses gagal di tengah jalan.
trap 'rm -f "$tmpfile"' EXIT

info "Volume sumber   : $UPLOAD_VOLUME"
info "Menyimpan backup ke $outfile ..."

# --user membuat arsip dimiliki user yang menjalankan skrip (bukan root).
docker run --rm \
  --user "$(id -u):$(id -g)" \
  -v "$UPLOAD_VOLUME:/data:ro" \
  -v "$BACKUP_DIR:/backup" \
  "$ALPINE_IMAGE" \
  tar czf "/backup/$archive_name" -C /data .

# Pastikan arsip tidak kosong sebelum mengganti nama final.
[ -s "$tmpfile" ] || die "Hasil backup kosong. Periksa isi volume '$UPLOAD_VOLUME'."
mv "$tmpfile" "$outfile"

size="$(du -h "$outfile" | cut -f1)"
info "Backup selesai ($size): $outfile"

# Hapus arsip lama, sisakan 7 terbaru berdasarkan nama/waktu.
mapfile -t all_backups < <(ls -1t "$BACKUP_DIR"/uploads_*.tar.gz 2>/dev/null || true)
if [ "${#all_backups[@]}" -gt "$KEEP_COUNT" ]; then
  info "Membersihkan backup lama (menyisakan $KEEP_COUNT terbaru)..."
  for old in "${all_backups[@]:$KEEP_COUNT}"; do
    rm -f "$old"
    echo "  Dihapus: $(basename "$old")"
  done
fi
