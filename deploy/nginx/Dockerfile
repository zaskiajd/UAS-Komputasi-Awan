# =============================================================================
# deploy/nginx/Dockerfile — Image "web": Nginx + file statis frontend CampusCare
# -----------------------------------------------------------------------------
# Frontend CampusCare tidak perlu di-build (tanpa bundler; css/tailwind.css
# sudah jadi), jadi image ini cukup MENYALIN file statis ke folder Nginx.
#
# Dockerfile ini butuh konteks ROOT repo. Di docker-compose.yml:
#   build:
#     context: .
#     dockerfile: deploy/nginx/Dockerfile
# Build manual (jalankan dari root repo):
#   docker build -f deploy/nginx/Dockerfile -t campuscare-web .
# =============================================================================

FROM nginx:1.27-alpine

# Hapus halaman contoh bawaan Nginx dan konfigurasi default-nya.
RUN rm -rf /usr/share/nginx/html/* /etc/nginx/conf.d/default.conf \
 && mkdir -p /etc/nginx/snippets

# Konfigurasi Nginx milik CampusCare.
COPY deploy/nginx/default.conf /etc/nginx/conf.d/default.conf
COPY deploy/nginx/security-headers.conf /etc/nginx/snippets/security-headers.conf

# File statis frontend. Yang TIDAK disalin: backend/, docs/, node_modules/,
# .git/, .env* (lihat juga .dockerignore di root repo).
COPY index.html /usr/share/nginx/html/index.html
COPY UNSIL.png /usr/share/nginx/html/UNSIL.png
COPY css/    /usr/share/nginx/html/css/
COPY js/     /usr/share/nginx/html/js/
COPY views/  /usr/share/nginx/html/views/
COPY assets/ /usr/share/nginx/html/assets/

EXPOSE 80

# Cek sederhana: Nginx menjawab halaman utama. (wget bawaan alpine/busybox)
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -q -O /dev/null http://127.0.0.1/ || exit 1
