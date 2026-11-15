# Panduan Deployment CampusCare (Docker + Cloudflare Tunnel)

Panduan ini disusun langkah demi langkah untuk mahasiswa yang baru pertama kali memasang aplikasi ke server Linux (Ubuntu VM di Proxmox) menggunakan Docker.

> **Ringkasnya:** Kita tidak menjalankan `npm run dev` atau `python -m http.server` di server. Sebagai gantinya, Docker membungkus aplikasi menjadi dua kotak siap jalan: **Nginx** (halaman web) dan **Express API** (backend), lalu menyambungkannya ke **PostgreSQL** yang sudah berjalan di VM lain.

---

## 1. Gambaran Arsitektur & Istilah Singkat

### Alur Permintaan

```text
  [Pengunjung / Browser HP & Laptop]
                 │  HTTPS (otomatis diurus Cloudflare)
                 ▼
         [Cloudflare Edge]
                 │  Terowongan aman (Cloudflare Tunnel)
                 ▼
     [cloudflared di VM / jaringan tim]
                 │  HTTP biasa ke port lokal (mis. localhost:8080)
                 ▼
  ┌──────────────┴─────────────────────────────────────┐
  │  VM Aplikasi (Ubuntu + Docker)                     │
  │                                                    │
  │  ┌──────────────────────────────────────────────┐  │
  │  │ Container "web" (Nginx, port 80 -> 8080)     │  │
  │  │  • File statis: index.html, css/, js/, views/│  │
  │  │  • Semua alamat /api/* diteruskan ke "api"   │  │
  │  └──────────────────────┬───────────────────────┘  │
  │                         │ jaringan internal Docker  │
  │                         ▼                          │
  │  ┌──────────────────────────────────────────────┐  │
  │  │ Container "api" (Node.js Express, port 3000) │  │
  │  │  • Tidak dibuka langsung ke luar             │  │
  │  └──────────────────────┬───────────────────────┘  │
  └─────────────────────────┼──────────────────────────┘
                            │ Koneksi SQL lewat jaringan VM (DATABASE_URL)
                            ▼
  ┌────────────────────────────────────────────────────┐
  │  VM Database (terpisah)                            │
  │  • Container PostgreSQL milik teman (port 5432)    │
  └────────────────────────────────────────────────────┘
```

Karena frontend dan `/api/*` dilayani lewat satu domain yang sama melalui Nginx (*same-origin*), browser tidak terkena masalah CORS dan cukup menggunakan **satu domain**.

### Kamus Istilah Singkat

| Istilah | Arti sederhana |
| :--- | :--- |
| **VM (Virtual Machine)** | Komputer virtual di dalam server Proxmox (di sini memakai Ubuntu, 1 vCPU, 2 GB RAM). |
| **Image** | Cetakan aplikasi yang sudah berisi program dan semua kebutuhannya (ibarat *installer* yang siap dijalankan). |
| **Container** | Aplikasi yang sedang berjalan dari sebuah *image* (di dalam kotak terpisah agar tidak bentrok dengan aplikasi lain). |
| **Docker Compose** | Alat untuk menyalakan beberapa container sekaligus dari satu berkas konfigurasi (`docker-compose.yml`). |
| **Cloudflare Tunnel (`cloudflared`)** | Penghubung aman dari VM ke Cloudflare agar website bisa diakses dari internet memakai HTTPS tanpa harus membuka port router/firewall. |

---

## 2. Prasyarat & Data yang Harus Ditanyakan ke Pemilik Server

Sebelum mulai, pastikan di VM aplikasi sudah terpasang **Docker** (v24+ / 29.x dengan `docker compose`) dan **Git**. Lalu, tanyakan dan catat informasi berikut dari teman pemilik server/database:

| Informasi yang Ditanyakan | Contoh Jawaban | Catatan Anda |
| :--- | :--- | :--- |
| **User & Hostname SSH (atau IP VM Aplikasi)** | `ubuntu` / `ssh.domainkampus.id` | |
| **Cara SSH lewat Cloudflare Access** | Perintah `cloudflared access tcp` | |
| **IP VM Database (PostgreSQL)** | `192.168.10.25` | |
| **Port PostgreSQL** | `5432` | |
| **Nama Database, User, & Password Postgres** | db: `campuscare`, user: `campuscare` | |
| **Domain Publik Website** | `https://campuscare.domainanda.id` | |
| **Port yang Ditunjuk Tunnel Saat Ini** | `http://localhost:8080` (atau `3001`, dll.) | |
| **Cara Menjalankan Website Lama** | `docker compose up -d` di `/opt/web-lama` | |

### Cara Masuk ke VM Lewat SSH (Cloudflare Access)

Bila server menggunakan Cloudflare Access untuk SSH, siapkan `cloudflared` di laptop Anda, lalu buka **dua jendela terminal**:

**Terminal 1** — buka terowongan TCP (biarkan jendela ini tetap terbuka):
```bash
cloudflared access tcp --hostname <hostname-ssh-dari-teman> --url 127.0.0.1:2222
```

**Terminal 2** — masuk SSH lewat terowongan tersebut:
```bash
ssh <user>@127.0.0.1 -p 2222
```

---

## 3. Menyiapkan Database di Server PostgreSQL

Database PostgreSQL tidak dibuat oleh `docker-compose.yml` ini karena sudah ada di VM database milik teman.

### Langkah A — Buat Database & User (di VM Database)

Minta teman pemilik VM database (atau jalankan di VM database bila punya akses) untuk membuat database `campuscare`. Contoh jika PostgreSQL berjalan di dalam container bernama `postgres`:

```bash
docker exec -it <nama_container_postgres> psql -U postgres -c "CREATE DATABASE campuscare;"
```

*(Disarankan membuat user khusus untuk CampusCare, atau memakai user/password yang disepakati dengan teman Anda. Pastikan PostgreSQL mengizinkan koneksi masuk dari IP VM Aplikasi pada `pg_hba.conf` dan firewall.)*

### Langkah B — Impor Skema & Data Awal (SEKALI SAJA, dari VM Aplikasi)

Langkah ini dilakukan setelah Anda mengunduh kode dan mengisi `.env` di Bagian 4. **PENTING:** Jangan mengimpor ulang `import-db.sh` pada database yang sudah berisi data pengguna asli! Skrip `import-db.sh` bersifat *upsert* dan akan menimpa akun demo (beserta sandinya), data aset seed, dan teknisi seed kembali ke pengaturan awal.

---

## 4. Mengambil Kode, Mengatur `.env`, & Menjalankan Aplikasi

Jalankan perintah berikut di **VM Aplikasi** setelah masuk lewat SSH:

### 4.1. Unduh Kode

```bash
git clone <URL_REPO_INI> campuscare
cd campuscare
```

Pastikan semua skrip bantu bisa dieksekusi:
```bash
chmod +x deploy/scripts/*.sh
```

### 4.2. Buat dan Isi Berkas `.env`

Salin template `.env.production.example` menjadi `.env` di root folder proyek:
```bash
cp .env.production.example .env
chmod 600 .env
```

Buat kunci acak yang kuat untuk `JWT_SECRET` (minimal 16 karakter; perintah di bawah membuat 64 karakter):
```bash
openssl rand -hex 32
```

Buka `.env` dengan editor teks (`nano .env`) dan isi bagian-bagian berikut:
- `WEB_PORT=8080` (atau samakan dengan port website lama jika ingin tanpa mengubah pengaturan tunnel).
- `DATABASE_URL=postgres://USER:PASSWORD@IP_VM_DATABASE:PORT/campuscare`
  *(Jika password mengandung karakter spesial seperti `@`, `#`, `:`, ganti dengan versi URL-encode, misal `@` → `%40`, `#` → `%23`).*
- `DB_SSL=false` (umumnya `false` untuk Postgres di jaringan lokal/VM kampus).
- `JWT_SECRET=<tempel hasil openssl rand -hex 32 tadi>`
- `CORS_ORIGIN=https://DOMAIN_ANDA` (tanpa garis miring `/` di akhir).
- `GOOGLE_CLIENT_ID=<isi Client ID Google Anda jika pakai Google Login>`.

Simpan dengan `Ctrl+O`, `Enter`, lalu keluar `Ctrl+X`.

### 4.3. Impor Database (Hanya Sekali saat Pertama Kali)

```bash
deploy/scripts/import-db.sh
```
Saat diminta konfirmasi, ketik **`YA`** (huruf besar semua) lalu tekan `Enter`.

### 4.4. Build & Jalankan Aplikasi

```bash
deploy/scripts/deploy.sh
```

Skrip ini akan membangun image Docker untuk `api` dan `web`, menyalakannya, menunggu hingga sehat (*healthy*), dan mengecek `http://localhost:8080/api/health`.

---

## 5. Mengganti Website Lama dengan Aman

Agar tidak terjadi kesalahan permanen saat mengganti website lama yang sedang berjalan di VM:

1. **Catat dulu informasi website lama:**
   - Di folder mana website lama berada.
   - Bagaimana cara menjalankannya (mis. `docker ps` untuk melihat nama container, atau `systemctl status ...`).
   - Port berapa yang sedang dituju oleh Cloudflare Tunnel saat ini.

2. **Hentikan website lama (JANGAN dihapus dulu):**
   Jika website lama memakai Docker Compose di foldernya:
   ```bash
   cd /lokasi/website-lama
   docker compose stop
   ```
   Atau jika hanya satu container Docker:
   ```bash
   docker stop <nama_container_lama>
   ```
   *(Dengan `stop`, container dan datanya masih aman tersimpan kalau sewaktu-waktu perlu dinyalakan lagi.)*

3. **Arahkan lalu lintas Cloudflare Tunnel ke CampusCare:**
   Pilih salah satu dari dua cara berikut:
   - **Cara A (Ubah di Dashboard Cloudflare):**
     Buka **Cloudflare Zero Trust** → **Networks** → **Tunnels** → pilih tunnel tim → **Public Hostname** → edit domain Anda, lalu arahkan **Service** ke `http://localhost:8080` (sesuai `WEB_PORT` di `.env`).
   - **Cara B (Tanpa ubah Cloudflare):**
     Samakan `WEB_PORT` di berkas `.env` CampusCare dengan port yang sebelumnya dipakai website lama (misal `WEB_PORT=3001`), lalu jalankan ulang `deploy/scripts/deploy.sh`.

4. **Cara Rollback (jika gagal dan harus kembali ke website lama):**
   ```bash
   cd ~/campuscare
   docker compose stop
   cd /lokasi/website-lama
   docker compose start   # atau: docker start <nama_container_lama>
   ```
   *(Jika tadi mengubah port di Cloudflare, kembalikan juga ke port website lama.)*

---

## 6. Mengaktifkan Login dengan Google (OAuth 2.0)

> **Catatan:** Login memakai email + kata sandi tetap berjalan normal meskipun Google Login belum diatur.

Agar tombol **Masuk dengan Google** berfungsi di domain produksi:

1. Buka [Google Cloud Console](https://console.cloud.google.com/) → **APIs & Services** → **Credentials**.
2. Klik **OAuth 2.0 Client IDs** milik aplikasi CampusCare.
3. Pada bagian **Authorized JavaScript origins**, klik **+ ADD URI** dan masukkan domain publik Anda:
   ```text
   https://DOMAIN_ANDA
   ```
   *(Harus `https://`, **tanpa** path dan **tanpa** garis miring `/` di akhir.)*
4. Klik **Save**. Perubahan di Google membutuhkan waktu sekitar **5 menit hingga beberapa menit** sampai aktif.
5. Pastikan nilai `GOOGLE_CLIENT_ID` di berkas `.env` server **sama persis** dengan `GOOGLE_CLIENT_ID` yang ada di `js/config.js` (atau perbarui `js/config.js` jika memakai Client ID baru, lalu jalankan `deploy.sh` lagi).

*(Catatan teknis Nginx: Header `Content-Security-Policy` dan `Cross-Origin-Opener-Policy` sengaja tidak dipasang ketat pada konfigurasi Nginx agar skrip dan iframe Google Sign-In dari `accounts.google.com` tidak terblokir.)*

---

## 7. Keamanan Wajib Setelah Deploy

Lakukan tiga hal ini segera setelah aplikasi berhasil jalan:

1. **Ganti kata sandi akun demo bawaan!**
   Kata sandi bawaan (`CampusCare#2026`) tertulis di repositori publik. Jalankan skrip berikut untuk mengganti sandi akun demo admin dan mahasiswa (ketikan tidak akan tampil di layar):
   ```bash
   deploy/scripts/set-demo-passwords.sh
   ```
2. **Jangan pernah commit `.env` ke Git.**
   Berkas `.env` sudah masuk di `.gitignore`. Periksa selalu dengan `git status` sebelum melakukan `git push`.
3. **Batasi akses PostgreSQL.**
   Port `5432` PostgreSQL **tidak boleh** dibuka ke internet publik. Pastikan di firewall VM database (misal `ufw`) dan `pg_hba.conf`, hanya IP VM Aplikasi yang diizinkan mengakses port `5432`.

---

## 8. Uji Akhir (Daftar Centang)

Buka domain publik Anda (`https://DOMAIN_ANDA`) dan pastikan semua poin berikut berhasil:

- [ ] Buka `https://DOMAIN_ANDA/api/health` → tampil JSON `{"success":true,"data":{"status":"ok",...}}`.
- [ ] Login sebagai **Admin Sarpras** (pakai sandi baru hasil `set-demo-passwords.sh`).
- [ ] Buka tab **Inventaris Sarpras**, tambahkan satu aset baru (atau ubah data), lalu **Refresh halaman (`F5`)** → data aset baru tersebut harus tetap ada (tersimpan di PostgreSQL).
- [ ] Logout, lalu login sebagai **Mahasiswa**.
- [ ] Buat satu **Pengaduan Baru** → tiket muncul di daftar pengaduan.
- [ ] Logout, login lagi sebagai **Admin**, disposisikan / ubah status tiket yang baru dibuat → status berubah dan tersimpan setelah refresh.
- [ ] Buka `https://DOMAIN_ANDA` lewat **HP menggunakan data seluler** (bukan Wi-Fi lokal) untuk memastikan Cloudflare Tunnel dan tampilan mobile berjalan baik.

---

## 9. Operasional Sehari-hari

Semua perintah dijalankan di folder root repo (`~/campuscare`):

| Kebutuhan | Perintah |
| :--- | :--- |
| **Cek status cepat, health check, & log terakhir** | `deploy/scripts/check.sh` |
| **Lihat log API secara langsung (*live*)** | `docker compose logs -f api` |
| **Lihat log Nginx (web)** | `docker compose logs -f web` |
| **Restart semua container** | `docker compose restart` |
| **Hentikan aplikasi** | `docker compose down` |
| **Update aplikasi setelah ada perubahan kode di Git** | `git pull && deploy/scripts/deploy.sh` |
| **Backup database (disimpan di `./backups/`, maks 7 terakhir)** | `deploy/scripts/backup-db.sh` |
| **Menjalankan file migrasi SQL baru** | `deploy/scripts/migrate.sh backend/db/migrations/00X_nama.sql` |

### Cara Restore Database dari Backup

Jika suatu saat perlu mengembalikan data dari berkas backup di `./backups/`:
```bash
# Muat DATABASE_URL dari .env lalu kirim isi backup ke psql lewat container
set -a && source .env && set +a
gunzip -c backups/campuscare_YYYYmmdd_HHMM.sql.gz | docker run --rm -i --network host postgres:16-alpine psql "$DATABASE_URL" -v ON_ERROR_STOP=1
```

---

## 10. Pemecahan Masalah (Troubleshooting)

| Gejala / Pesan Error | Kemungkinan Penyebab | Solusi |
| :--- | :--- | :--- |
| **"Tidak dapat terhubung ke server backend"** di web | Container `api` mati, atau permintaan `/api` gagal diteruskan Nginx. | Jalankan `deploy/scripts/check.sh` dan lihat log `docker compose logs --tail 50 api`. |
| **502 Bad Gateway** | Nginx tidak bisa menghubungi container `api` (biasanya `api` sedang crash atau restart berulang). | Cek penyebab crash di `docker compose logs --tail 50 api`. |
| **Error SQL `column ... does not exist`** | Database sudah pernah dibuat sebelumnya, tapi migrasi terbaru belum dijalankan. | Jalankan `deploy/scripts/migrate.sh backend/db/migrations/<file_migrasi>.sql`. |
| **Error `403` saat membuka menu role tertentu** | Di browser masih tersimpan token login (`localStorage`) dari peran/role yang berbeda atau sesi lama. | Klik **Keluar** di aplikasi, atau hapus data situs/localStorage di browser lalu login ulang. |
| **Google Login: `origin is not allowed` / `origin_mismatch`** | Domain publik (`https://DOMAIN_ANDA`) belum didaftarkan di Google Cloud Console. | Tambahkan `https://DOMAIN_ANDA` ke **Authorized JavaScript origins** di Google Cloud Console (Bagian 6), lalu tunggu beberapa menit. |
| **Container `api` langsung mati: `JWT_SECRET lemah/belum diset`** | `JWT_SECRET` di `.env` masih kosong, memakai kata contoh (`secret`, `ganti_ini`, dll.), atau kurang dari 16 karakter. | Buat kunci baru pakai `openssl rand -hex 32`, isi ke `.env`, lalu jalankan `deploy/scripts/deploy.sh`. |
| **API gagal konek DB (`ECONNREFUSED` / `ETIMEDOUT` / `password authentication failed`)** | `DATABASE_URL` salah, firewall VM database memblokir port `5432`, atau `pg_hba.conf` Postgres belum mengizinkan IP VM aplikasi. | Periksa isi `DATABASE_URL` di `.env`, buka port `5432` khusus untuk IP VM aplikasi di firewall VM database, dan tambahkan aturan `host` di `pg_hba.conf`. |
| **Perubahan JS / tampilan tidak muncul setelah update** | Cache lama masih tersimpan di browser atau di Cloudflare. | Lakukan *hard refresh* (`Ctrl+F5` / `Ctrl+Shift+R`). Jika masih sama, lakukan *Purge Cache* di dashboard Cloudflare. |
