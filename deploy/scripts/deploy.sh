#!/usr/bin/env bash
# =============================================================================
# deploy/scripts/deploy.sh — Build dan jalankan CampusCare dengan Docker Compose
# -----------------------------------------------------------------------------
# Pemakaian (dari folder repo):
#   deploy/scripts/deploy.sh
#
# Yang dilakukan:
#   1. Mengecek .env ada dan nilai penting (JWT_SECRET, DATABASE_URL) sudah diisi.
#   2. docker compose build   (membuat image api dan web)
#   3. docker compose up -d   (menjalankan/menyegarkan container)
#   4. Menunggu kedua container sehat (healthy), lalu mencetak status.
#
# Aman dijalankan berulang kali, mis. setelah "git pull" untuk update kode.
# =============================================================================

set -euo pipefail

# shellcheck source=_lib.sh
source "$(dirname "${BASH_SOURCE[0]}")/_lib.sh"

require_compose
load_env

# --- 1. Cek konfigurasi -----------------------------------------------------------
info "Mengecek isi .env..."

JWT_SECRET="${JWT_SECRET:-}"
[ -n "$JWT_SECRET" ] \
  || die "JWT_SECRET di .env masih kosong. Buat dengan: openssl rand -hex 32  lalu tempel ke .env"
case "$JWT_SECRET" in
  ganti_ini | secret | changeme | password)
    die "JWT_SECRET masih memakai nilai contoh. Buat yang baru: openssl rand -hex 32" ;;
esac
[ "${#JWT_SECRET}" -ge 16 ] \
  || die "JWT_SECRET terlalu pendek (minimal 16 karakter). Buat dengan: openssl rand -hex 32"

require_database_url

case "${CORS_ORIGIN:-}" in
  "" | *DOMAIN_ANDA*)
    warn "CORS_ORIGIN belum diisi domain asli (contoh: https://campuscare.domainanda.id)." ;;
esac

if [ -z "${GOOGLE_CLIENT_ID:-}" ]; then
  warn "GOOGLE_CLIENT_ID kosong: tombol Masuk dengan Google akan gagal (login email tetap jalan)."
fi

WEB_PORT="${WEB_PORT:-8080}"

cd "$REPO_DIR"

# --- 2. Build image ----------------------------------------------------------------
info "Membangun image (bisa beberapa menit pada build pertama)..."
docker compose build --pull

# --- 3. Jalankan container -----------------------------------------------------------
# Compose menunggu api sehat dulu sebelum menyalakan web (depends_on).
info "Menjalankan container..."
if ! docker compose up -d --remove-orphans; then
  warn "Container gagal dijalankan. 30 baris log api terakhir:"
  docker compose logs --tail 30 api || true
  die "Periksa log di atas. Penyebab umum: DATABASE_URL salah / database tidak terjangkau, atau JWT_SECRET ditolak. Lihat docs/DEPLOY.md bagian Pemecahan Masalah."
fi

# --- 4. Tunggu sampai sehat -------------------------------------------------------------
# Status kesehatan satu service: healthy / starting / unhealthy / (status container)
service_health() {
  local cid
  cid="$(docker compose ps -q "$1" 2>/dev/null || true)"
  if [ -z "$cid" ]; then
    echo "tidak-ada"
    return
  fi
  docker inspect -f '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' "$cid" 2>/dev/null \
    || echo "tidak-diketahui"
}

info "Menunggu container sehat (maksimal 120 detik)..."
api_state=""
web_state=""
for _ in $(seq 1 60); do
  api_state="$(service_health api)"
  web_state="$(service_health web)"
  if [ "$api_state" = "healthy" ] && [ "$web_state" = "healthy" ]; then
    break
  fi
  sleep 2
done

docker compose ps

if [ "$api_state" != "healthy" ] || [ "$web_state" != "healthy" ]; then
  warn "Belum sehat: api=$api_state, web=$web_state. 30 baris log api terakhir:"
  docker compose logs --tail 30 api || true
  die "Deploy belum berhasil. Lihat docs/DEPLOY.md bagian Pemecahan Masalah."
fi

# --- Selesai ----------------------------------------------------------------------
info "Mengecek /api/health lewat Nginx..."
if http_get "http://localhost:${WEB_PORT}/api/health"; then
  echo
else
  warn "Health check lewat Nginx gagal, padahal container sehat. Cek: docker compose logs web"
fi

cat <<EOF

==> Selesai. CampusCare berjalan.
    Cek dari VM ini  : curl http://localhost:${WEB_PORT}/api/health
    Halaman (lokal)  : http://localhost:${WEB_PORT}/
    Lewat domain     : ${CORS_ORIGIN:-https://DOMAIN_ANDA}/api/health
    Cloudflare Tunnel harus mengarah ke http://localhost:${WEB_PORT}
    Status & log     : deploy/scripts/check.sh
EOF
