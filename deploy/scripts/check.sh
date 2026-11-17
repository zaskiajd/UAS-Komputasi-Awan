#!/usr/bin/env bash
# =============================================================================
# deploy/scripts/check.sh — Cek cepat status CampusCare di server
# -----------------------------------------------------------------------------
# Pemakaian (dari folder repo):
#   deploy/scripts/check.sh
#
# Menampilkan:
#   1. Status container (docker compose ps)
#   2. Respons /api/health lewat Nginx (http://localhost:WEB_PORT/api/health)
#   3. 30 baris log terakhir dari container api
# =============================================================================

set -euo pipefail

# shellcheck source=_lib.sh
source "$(dirname "${BASH_SOURCE[0]}")/_lib.sh"

require_compose
load_env

WEB_PORT="${WEB_PORT:-8080}"
cd "$REPO_DIR"

info "Status container:"
docker compose ps
echo

info "Cek /api/health lewat Nginx (http://localhost:${WEB_PORT}/api/health):"
if http_get "http://localhost:${WEB_PORT}/api/health"; then
  echo
else
  warn "Endpoint /api/health tidak merespons atau mengembalikan error."
fi
echo

info "30 baris log terakhir (service api):"
docker compose logs --tail 30 api || warn "Gagal membaca log api."
