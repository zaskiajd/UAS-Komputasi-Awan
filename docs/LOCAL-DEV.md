# Menjalankan CampusCare di Komputer Lokal (Windows)

Panduan ini menyiapkan database PostgreSQL lokal, mengimpor skema + seed,
lalu menjalankan backend API dan frontend untuk pengembangan di localhost.

## 1. Install PostgreSQL

1. Unduh installer PostgreSQL 16 dari <https://www.postgresql.org/download/windows/>
   (installer EDB memasukkan `psql` dan `pgAdmin`).
2. Saat instalasi, tetapkan password user `postgres` — simpan, dipakai di langkah berikutnya.
3. Biarkan port default **5432**.
4. Pastikan `psql` bisa dipanggil; kalau belum, tambahkan ke PATH:
   `C:\Program Files\PostgreSQL\16\bin`.

Buka Git Bash dan cek:

```bash
psql --version
```

## 2. Buat database dan impor data

Dari folder root project:

```bash
# buat database-nya dulu
psql -U postgres -c "CREATE DATABASE campuscare;"

# impor skema + seed (file gabungan, idempotent — boleh diulang)
psql -U postgres -d campuscare -f backend/db/campuscare_full.sql
```

Saat diminta password, isi password user `postgres` Anda.

> **Penting (encoding):** impor HANYA lewat `psql -f` seperti di atas. Impor
> lewat GUI (mis. pgAdmin "Query Tool" atau fitur import) dapat salah membaca
> UTF-8 sehingga karakter khusus seperti pemisah lokasi `•` menjadi
> mojibake `â€¢` di database. Gejalanya: label lokasi di aplikasi tampil
> `Gedung A â€¢ Lt. 1`. Bila sudah terlanjur, jalankan ulang dua perintah di
> atas (data lokal dev tidak akan hilang selain tiket tes Anda sendiri).

> Setiap saat Anda ingin mengembalikan database ke kondisi awal, jalankan
> ulang dua perintah di atas (atau `DROP DATABASE` lalu `CREATE` lagi).

**Isi seed:** 2 akun demo, 4 tim, 15 teknisi, 7 kategori, lokasi, dan aset
inventaris. **Tidak ada tiket dummy** — database mulai bersih agar pengetesan
(notifikasi real-time, SLA, dan statistik dashboard admin) mencerminkan aktivitas nyata.

## 3. Konfigurasi backend

`backend/.env` sudah disiapkan di repo lokal (tidak ikut ke git). Buka dan
ganti `GANTI_PASSWORD` dengan password PostgreSQL Anda:

```
DATABASE_URL=postgres://postgres:PASSWORD_ANDA@localhost:5432/campuscare
```

## 4. Jalankan backend

```bash
cd backend
npm install
npm run dev
```

Backend berjalan di <http://localhost:3000>. Cek:

```bash
curl http://localhost:3000/api/health
```

## 5. Jalankan frontend

Dari folder root project (window terminal terpisah):

```bash
python -m http.server 8000
```

Buka <http://localhost:8000>. Frontend otomatis mengarah ke API
`http://localhost:3000` saat dijalankan di localhost (lihat `js/config.js`).

## 6. Akun untuk login

| Peran | Email | Password awal |
| --- | --- | --- |
| Admin Sarpras | `hendrawan@unsil.ac.id` | `CampusCare#2026` |
| Mahasiswa | `217006120@student.unsil.ac.id` | `CampusCare#2026` |

Ganti password demo sebelum demo/publikasi. Cara tercepat lewat psql:

```bash
psql -U postgres -d campuscare -c \
  "UPDATE users SET password_hash = crypt('PASSWORD_BARU', gen_salt('bf', 10));"
```

## 7. Menjalankan test

Test integrasi memakai database sungguhan (pastikan langkah 2 sudah dilakukan):

```bash
cd backend
npm run db:reset   # drop + import ulang database dari campuscare_full.sql
npm test           # 4 file test: api, assets, photos, technicians
```

## Catatan fitur real-time (WebSocket)

- Notifikasi berjalan di `ws://localhost:3000/api/ws` (otomatis oleh frontend).
- Buka dua browser berbeda: satu login admin, satu mahasiswa.
- Mahasiswa buat pengaduan → admin menerima toast "Pengaduan Baru Masuk" tanpa refresh.
- Admin ubah status tiket → mahasiswa menerima toast perubahan status dan
  daftar pengaduan ter-refresh otomatis.
