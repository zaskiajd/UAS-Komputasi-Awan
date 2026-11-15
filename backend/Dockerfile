# =============================================================================
# backend/Dockerfile — Image untuk API Express CampusCare
# -----------------------------------------------------------------------------
# Image ini hanya berisi kode yang dibutuhkan saat aplikasi berjalan:
# package.json, dependensi production, server.js, dan folder src/.
# Folder tests/ dan db/ sengaja TIDAK disalin (lihat backend/.dockerignore).
#
# Dibangun otomatis oleh docker-compose.yml (service "api"). Build manual:
#   docker build -t campuscare-api ./backend
# =============================================================================

FROM node:20-alpine

# Semua berkas aplikasi ditaruh di /app di dalam container.
WORKDIR /app

# Mode production: Express lebih cepat dan backend menolak JWT_SECRET lemah.
ENV NODE_ENV=production

# Salin daftar dependensi lebih dulu agar langkah "npm ci" bisa di-cache Docker
# selama package.json / package-lock.json tidak berubah.
COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force

# Salin kode aplikasi (tanpa tests/ dan db/).
COPY server.js ./
COPY src ./src

# Jalankan sebagai user biasa "node" (bawaan image), bukan root.
USER node

# Port yang didengarkan Express di dalam container (bisa diubah lewat env PORT).
EXPOSE 3000

# Docker memeriksa kesehatan API setiap 30 detik. /api/health juga mengecek
# koneksi ke database, jadi status "unhealthy" bisa berarti database tak terjangkau.
# wget sudah tersedia di image alpine (busybox).
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD wget -q -O /dev/null "http://127.0.0.1:${PORT:-3000}/api/health" || exit 1

CMD ["node", "server.js"]
