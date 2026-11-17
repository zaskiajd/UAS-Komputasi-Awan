# CampusCare — Backend (Express + PostgreSQL)

REST API untuk autentikasi (register/login/JWT, role `student` & `admin`) dan pengaduan fasilitas.
Lapisan database (schema, seed, `src/config/db.js`) ada di `db/`; kontraknya di `../docs/db-contract.md`.
Dokumentasi endpoint lengkap: [`../docs/API.md`](../docs/API.md).

## Struktur

```text
server.js                      # titik masuk (listen + graceful shutdown)
src/
  app.js                       # perakitan Express: helmet, CORS, JSON, routes, error handler
  config/
    db.js                      # koneksi PostgreSQL (pool, query, withTransaction)
    env.js                     # env var + validasi JWT_SECRET
  middleware/
    auth.js                    # authenticate (JWT) + requireRole('admin'|'student')
    upload.js                  # multer memoryStorage + pesan error foto (3 MB/3 berkas)
    errorHandler.js            # 404 + error terpusat (termasuk pemetaan error PostgreSQL)
  routes/                      # index.js memasang /auth, /tickets, /assets
  controllers/                 # baca request → validasi → panggil service → kirim respons
  services/                    # logika bisnis & query SQL (auth, ticket, photo, asset)
  utils/                       # response, errors, validate, uploads (magic bytes/UUID)
tests/
  api.test.js                  # pengujian auth & tiket
  assets.test.js               # pengujian inventaris
  photos.test.js               # pengujian unggah/hapus/penyajian foto
```

## Menjalankan lokal

```bash
cd backend
cp .env.example .env           # isi DATABASE_URL dan JWT_SECRET
npm install
npm run db:reset               # import schema + seed (menghapus isi schema public!)
npm run dev                    # http://localhost:3000/api/health
```

Akun demo (dari seed): `217006120@student.unsil.ac.id` (mahasiswa) dan `hendrawan@unsil.ac.id` (admin),
sandi `CampusCare#2026` — **ganti sebelum rilis**.

## Pengujian

```bash
npm test
```

Test memakai server Express sungguhan terhadap database di `DATABASE_URL` (harus sudah di-seed).
Test membuat lalu menghapus akun/tiketnya sendiri, tetapi **jangan diarahkan ke database produksi**.
Bila sandi demo diganti, set `TEST_ADMIN_EMAIL` / `TEST_ADMIN_PASSWORD` (dan `TEST_SKIP_DEMO_STUDENT=1`).

Yang diuji (93 tes integrasi): register/login/JWT (kedaluwarsa, token palsu, `alg=none`, role dari token tidak dipercaya),
Google OAuth (ID token invalid, email unverified, domain ditolak, pendaftaran mahasiswa baru, login ulang, penautan akun lokal, pencegahan eskalasi role, penolakan login sandi pada akun Google-only),
pembatasan role, kepemilikan tiket (mahasiswa B tidak bisa membuka/mengubah/menghapus tiket mahasiswa A),
validasi input, aturan status (edit/hapus), soft delete, ubah status oleh admin + riwayat, buka kembali tiket,
inventaris aset, serta foto pengaduan (magic bytes, batas 3 foto/3 MB, unggahan paralel, penyajian `/uploads`, hapus
berkas, dan pembersihan saat tiket dibatalkan).

## Environment variable

| Nama | Wajib | Keterangan |
| --- | --- | --- |
| `DATABASE_URL` | ya | Connection string PostgreSQL |
| `DB_SSL` | — | `true` untuk database cloud yang mewajibkan SSL |
| `JWT_SECRET` | ya | Min. 16 karakter acak; di production server menolak start bila lemah |
| `JWT_EXPIRES_IN` | — | Default `8h` |
| `PORT` | — | Default `3000` (PaaS biasanya mengisi otomatis) |
| `NODE_ENV` | — | Set `production` saat deploy |
| `CORS_ORIGIN` | prod | URL frontend, pisahkan koma bila lebih dari satu |
| `AUTH_RATE_LIMIT` | — | Percobaan login/registrasi per IP per 15 menit (default 50) |
| `UPLOAD_DIR` | — | Folder foto pengaduan (default `backend/uploads`; Docker: `/app/uploads`) |
| `UPLOAD_RATE_LIMIT` | — | Permintaan unggah/hapus foto per IP per 15 menit (default 30) |
| `GOOGLE_CLIENT_ID` | opsional | OAuth 2.0 Web Client ID dari Google Cloud Console untuk verifikasi ID token |
| `ALLOWED_EMAIL_DOMAINS` | — | Domain email yang diizinkan untuk login Google (default: `student.unsil.ac.id,unsil.ac.id`) |

## Konfigurasi Google OAuth 2.0 (Google Identity Services)

1. Buka [Google Cloud Console](https://console.cloud.google.com/) > **APIs & Services** > **Credentials**.
2. Buat **OAuth 2.0 Client ID** bertipe *Web application*.
3. Pada **Authorized JavaScript origins**, tambahkan origin frontend Anda (misalnya `http://localhost:8000` untuk development lokal atau domain production).
4. Salin Client ID yang dihasilkan ke:
   - `backend/.env` pada variabel `GOOGLE_CLIENT_ID`
   - `js/config.js` pada konfigurasi `GOOGLE_CLIENT_ID` (atau inject via `window.CAMPUSCARE_GOOGLE_CLIENT_ID`)
5. Bila database sudah berjalan sebelum fitur ini, jalankan migrasi:
   ```bash
   psql "$DATABASE_URL" -f db/migrations/002_google_auth.sql
   ```

## Foto pengaduan

Foto diunggah terpisah setelah tiket dibuat: `POST /api/tickets/:id/photos`
(`multipart/form-data`, field `photos`, maks. 3 berkas × 3 MB, JPEG/PNG/WebP).
Metadata disimpan di `ticket_photos`; berkas fisik memakai nama UUID di
`UPLOAD_DIR` dan disajikan publik di `/uploads/<file>`. Bila database sudah
berjalan sebelum fitur ini, jalankan migrasi:

```bash
psql "$DATABASE_URL" -f db/migrations/003_ticket_photos.sql
```

Saat deploy Docker, `UPLOAD_DIR` berada di named volume `campuscare_uploads`.
Backup bersama database memakai `../deploy/scripts/backup-uploads.sh`.

## Deploy (Docker / Server)

Panduan lengkap pemasangan aplikasi menggunakan Docker Compose (`docker-compose.yml`), Nginx reverse proxy, dan database PostgreSQL terpisah tersedia di [`../docs/DEPLOY.md`](../docs/DEPLOY.md).

Ringkasan cepat untuk server:
- Gunakan template `../.env.production.example` di root repo sebagai `.env` (bukan `backend/.env.example`, karena `backend/.env.example` hanya untuk pengembangan lokal).
- `backend/Dockerfile` membangun image production (`NODE_ENV=production`, port `3000`, user non-root `node`).
- Impor database awal (`db/campuscare_full.sql`) cukup dijalankan **sekali** lewat `../deploy/scripts/import-db.sh`, lalu segera ganti sandi akun demo dengan `../deploy/scripts/set-demo-passwords.sh`.
- Health check: `GET /api/health` (mengecek koneksi database).
- Isi `CORS_ORIGIN` dengan URL publik frontend, mis. `https://campuscare.example.com`.
