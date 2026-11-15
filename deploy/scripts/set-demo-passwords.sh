#!/usr/bin/env bash
# =============================================================================
# deploy/scripts/set-demo-passwords.sh — Ganti sandi akun demo di database
# -----------------------------------------------------------------------------
# Pemakaian (dari folder repo, WAJIB setelah import-db.sh):
#   deploy/scripts/set-demo-passwords.sh
#
# Sandi bawaan seed tertulis di repo (diketahui publik), jadi harus diganti.
# Skrip ini meminta sandi baru lewat prompt:
#   - ketikan TIDAK tampil di layar dan TIDAK tersimpan di riwayat shell;
#   - sandi TIDAK ditulis ke berkas mana pun; ia dikirim ke container psql
#     lewat environment variable, lalu di-hash di database dengan
#     crypt(sandi, gen_salt('bf', 10)) dari pgcrypto (bcrypt, kompatibel
#     dengan bcryptjs yang dipakai backend).
#
# Akun demo (dari backend/db/seed.sql):
#   - admin     : hendrawan@unsil.ac.id
#   - mahasiswa : 217006120@student.unsil.ac.id
# =============================================================================

set -euo pipefail

# shellcheck source=_lib.sh
source "$(dirname "${BASH_SOURCE[0]}")/_lib.sh"

ADMIN_EMAIL="hendrawan@unsil.ac.id"
STUDENT_EMAIL="217006120@student.unsil.ac.id"
MIN_LENGTH=8

[ -t 0 ] || die "Skrip ini harus dijalankan langsung di terminal (butuh input sandi)."

load_env
require_database_url
require_docker
ensure_pg_image

# Minta sandi dua kali (tanpa ditampilkan) sampai cocok dan cukup panjang.
# Hasil disimpan di variabel global NEW_PASSWORD.
NEW_PASSWORD=""
ask_password() {
  local label="$1" first second
  while true; do
    IFS= read -r -s -p "Sandi baru untuk $label: " first
    echo
    IFS= read -r -s -p "Ulangi sandi untuk $label: " second
    echo
    if [ "$first" != "$second" ]; then
      echo "  Sandi tidak sama. Coba lagi."
    elif [ "${#first}" -lt "$MIN_LENGTH" ]; then
      echo "  Sandi minimal $MIN_LENGTH karakter. Coba lagi."
    elif [ "$first" = "CampusCare#2026" ]; then
      echo "  Itu sandi demo bawaan yang diketahui publik. Pakai sandi lain."
    else
      NEW_PASSWORD="$first"
      return 0
    fi
  done
}

info "Database tujuan: $(mask_url "$DATABASE_URL")"
echo "Sandi yang diketik tidak akan tampil di layar."
echo

ask_password "admin ($ADMIN_EMAIL)"
CC_ADMIN_PW="$NEW_PASSWORD"
ask_password "mahasiswa ($STUDENT_EMAIL)"
CC_STUDENT_PW="$NEW_PASSWORD"
NEW_PASSWORD=""

# Hapus sandi dari memori shell saat skrip selesai (berhasil maupun gagal).
trap 'unset CC_ADMIN_PW CC_STUDENT_PW' EXIT
export CC_ADMIN_PW CC_STUDENT_PW

# Nama variabel (bukan nilainya) yang diteruskan ke container psql.
PG_DOCKER_ENV=(-e CC_ADMIN_PW -e CC_STUDENT_PW)

info "Memperbarui sandi..."
output="$(psql_docker -X -q -t -A -v ON_ERROR_STOP=1 \
  -v admin_email="$ADMIN_EMAIL" -v student_email="$STUDENT_EMAIL" -f - <<'SQL'
\getenv admin_pw CC_ADMIN_PW
\getenv student_pw CC_STUDENT_PW
BEGIN;
WITH upd AS (
  UPDATE users
     SET password_hash = crypt(:'admin_pw', gen_salt('bf', 10))
   WHERE email = :'admin_email'
  RETURNING 1
)
SELECT 'admin=' || count(*) FROM upd;
WITH upd AS (
  UPDATE users
     SET password_hash = crypt(:'student_pw', gen_salt('bf', 10))
   WHERE email = :'student_email'
  RETURNING 1
)
SELECT 'mahasiswa=' || count(*) FROM upd;
COMMIT;
SQL
)" || die "Gagal memperbarui sandi. Periksa koneksi database dan pastikan import-db.sh sudah dijalankan."

admin_count="$(printf '%s\n' "$output" | sed -n 's/^admin=//p')"
student_count="$(printf '%s\n' "$output" | sed -n 's/^mahasiswa=//p')"

echo "  Akun admin     ($ADMIN_EMAIL): ${admin_count:-0} diperbarui"
echo "  Akun mahasiswa ($STUDENT_EMAIL): ${student_count:-0} diperbarui"

if [ "${admin_count:-0}" != "1" ] || [ "${student_count:-0}" != "1" ]; then
  die "Ada akun demo yang tidak ditemukan di database. Sudahkah import-db.sh dijalankan ke database yang benar?"
fi

info "Selesai. Login di website memakai sandi baru. Simpan sandi di tempat aman (password manager)."
