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
    errorHandler.js            # 404 + error terpusat (termasuk pemetaan error PostgreSQL)
  routes/                      # index.js memasang /auth dan /tickets
  controllers/                 # baca request → validasi → panggil service → kirim respons
  services/                    # logika bisnis & query SQL (auth, ticket)
  utils/                       # response, errors, validate
tests/api.test.js              # 42 pengujian integrasi
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

Yang diuji (51 tes integrasi): register/login/JWT (kedaluwarsa, token palsu, `alg=none`, role dari token tidak dipercaya),
Google OAuth (ID token invalid, email unverified, domain ditolak, pendaftaran mahasiswa baru, login ulang, penautan akun lokal, pencegahan eskalasi role, penolakan login sandi pada akun Google-only),
pembatasan role, kepemilikan tiket (mahasiswa B tidak bisa membuka/mengubah/menghapus tiket mahasiswa A),
validasi input, aturan status (edit/hapus), soft delete, ubah status oleh admin + riwayat, buka kembali tiket.

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

## Deploy (catatan untuk anggota 5)

- Start command: `npm start` — Root/working directory: `backend`.
- Set semua env var di atas di dashboard PaaS; `DATABASE_URL` dari database cloud, `DB_SSL=true` bila diwajibkan.
- Jalankan `db/campuscare_full.sql` ke database cloud sekali (bukan `db:reset` bila sudah ada data nyata).
- Health check: `GET /api/health` (mengecek koneksi database).
- Isi `CORS_ORIGIN` dengan URL frontend publik, mis. `https://campuscare.example.com`.
