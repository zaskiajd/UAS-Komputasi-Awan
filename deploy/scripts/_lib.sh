#!/usr/bin/env bash
# =============================================================================
# deploy/scripts/_lib.sh — Fungsi bersama untuk skrip deploy CampusCare
# -----------------------------------------------------------------------------
# Berkas ini TIDAK dijalankan langsung. Skrip lain memuatnya dengan:
#   source "$(dirname "${BASH_SOURCE[0]}")/_lib.sh"
# =============================================================================

# Folder root repo = dua tingkat di atas folder skrip ini (deploy/scripts/..).
REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
ENV_FILE="$REPO_DIR/.env"

# Image resmi Postgres yang dipakai untuk menjalankan psql / pg_dump di dalam
# container sementara, jadi host TIDAK perlu memasang psql.
# Bisa diganti saat menjalankan, mis.: PG_IMAGE=postgres:17-alpine ./skrip.sh
PG_IMAGE="${PG_IMAGE:-postgres:16-alpine}"

# Variabel environment tambahan untuk container psql (diisi skrip tertentu),
# contoh: PG_DOCKER_ENV=(-e NAMA_VARIABEL)
PG_DOCKER_ENV=()

# --- Pesan ---------------------------------------------------------------------
info() { printf '==> %s\n' "$*"; }
warn() { printf 'PERINGATAN: %s\n' "$*" >&2; }
die()  { printf 'GAGAL: %s\n' "$*" >&2; exit 1; }

# --- Docker --------------------------------------------------------------------
require_docker() {
  command -v docker >/dev/null 2>&1 \
    || die "Perintah 'docker' tidak ditemukan. Pasang Docker terlebih dahulu."
  docker info >/dev/null 2>&1 \
    || die "Tidak bisa menghubungi Docker. Coba jalankan dengan sudo, atau masukkan user ke grup docker: sudo usermod -aG docker \$USER (lalu logout dan login lagi)."
}

require_compose() {
  require_docker
  docker compose version >/dev/null 2>&1 \
    || die "'docker compose' (Compose v2) tidak tersedia. Pasang paket docker-compose-plugin."
}

# Unduh image Postgres lebih dulu (sekali saja) agar pesan unduhan tidak
# tercampur dengan hasil query.
ensure_pg_image() {
  local image="${1:-$PG_IMAGE}"
  if ! docker image inspect "$image" >/dev/null 2>&1; then
    info "Mengunduh image $image (sekali saja)..."
    docker pull "$image" >&2
  fi
}

# --- Berkas .env -----------------------------------------------------------------
# Membaca .env baris per baris (format KEY=nilai) TANPA mengeksekusinya sebagai
# skrip, lalu mengekspor nilainya. Karakter CR dari Windows dibuang.
load_env() {
  [ -f "$ENV_FILE" ] || die "Berkas .env tidak ditemukan di $ENV_FILE
       Buat dulu:  cp .env.production.example .env   lalu isi nilainya (lihat docs/DEPLOY.md)."

  local line key value
  local re='^[[:space:]]*(export[[:space:]]+)?([A-Za-z_][A-Za-z0-9_]*)[[:space:]]*=(.*)$'
  local dq='^"(.*)"$'
  local sq="^'(.*)'\$"

  while IFS= read -r line || [ -n "$line" ]; do
    line="${line%$'\r'}"
    [[ "$line" =~ $re ]] || continue      # lewati komentar dan baris kosong
    key="${BASH_REMATCH[2]}"
    value="${BASH_REMATCH[3]}"
    if [[ "$value" =~ $dq || "$value" =~ $sq ]]; then
      value="${BASH_REMATCH[1]}"          # buang tanda kutip pembungkus
    fi
    export "$key=$value"
  done < "$ENV_FILE"
}

# Pastikan DATABASE_URL terisi dan bukan nilai contoh.
require_database_url() {
  [ -n "${DATABASE_URL:-}" ] || die "DATABASE_URL di .env masih kosong."
  case "$DATABASE_URL" in
    *IP_VM_DATABASE* | *USER:PASSWORD@* | *GANTI_PASSWORD*)
      die "DATABASE_URL di .env masih berisi nilai contoh. Isi dengan alamat database yang asli." ;;
  esac
  # Container psql berjalan dengan --network host, jadi "host.docker.internal"
  # (dipakai bila Postgres di host yang sama) cukup diganti 127.0.0.1.
  PSQL_URL="${DATABASE_URL/@host.docker.internal/@127.0.0.1}"
  export PSQL_URL
}

# Menampilkan URL database dengan password disamarkan.
mask_url() {
  printf '%s' "$1" | sed -E 's#(://[^:/@]+):[^@]*@#\1:****@#'
}

# --- Menjalankan program Postgres di container sementara ------------------------
# Pemakaian: pg_docker <psql|pg_dump> [opsi...]
# - --network host: container memakai jaringan VM, jadi bisa menjangkau IP VM
#   database seperti perintah biasa di host.
# - URL database dikirim lewat environment (bukan argumen perintah docker),
#   sehingga tidak tercatat di riwayat shell.
# - Opsi -i meneruskan stdin (mis. isi berkas .sql) ke dalam container.
pg_docker() {
  local prog="$1"
  shift
  DATABASE_URL="$PSQL_URL" docker run --rm -i --network host \
    -e DATABASE_URL \
    -e PGCLIENTENCODING=UTF8 \
    -e PGCONNECT_TIMEOUT=10 \
    ${PG_DOCKER_ENV[@]+"${PG_DOCKER_ENV[@]}"} \
    "$PG_IMAGE" \
    sh -c 'prog="$1"; shift; exec "$prog" --dbname="$DATABASE_URL" "$@"' sh "$prog" "$@"
}

psql_docker() { pg_docker psql "$@"; }

# --- HTTP sederhana (curl, atau wget bila curl tidak ada) -------------------------
http_get() {
  if command -v curl >/dev/null 2>&1; then
    curl -fsS --max-time 10 "$1"
  elif command -v wget >/dev/null 2>&1; then
    wget -q -T 10 -O - "$1"
  else
    die "curl/wget tidak ditemukan. Pasang dengan: sudo apt install -y curl"
  fi
}
