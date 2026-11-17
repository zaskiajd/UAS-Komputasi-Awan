# Panduan Deployment CampusCare (Lingkungan Kelompok 5)

Panduan ini disesuaikan dengan lingkungan nyata tim: **VM1 sebagai server aplikasi
(Docker + Nginx), VM2 sebagai server PostgreSQL, dan Cloudflare Tunnel yang
berjalan di host Debian** (bukan di dalam VM). Aplikasi tetap dibungkus Docker:
container **web** (Nginx) melayani frontend dan meneruskan `/api` + `/uploads`
ke container **api** (Express), lalu API terhubung ke PostgreSQL di VM2.

> **Ringkasnya:** jangan menjalankan `npm run dev` di server. Deploy selalu lewat
> SSH ke VM1, lalu jalankan `deploy/scripts/deploy.sh`. **Jangan build/deploy
> lewat Portainer "Repository"** (lihat peringatan di Bagian 2).

---

## 1. Lingkungan Produksi

| Komponen | Alamat / Nilai | Keterangan |
| :--- | :--- | :--- |
| **VM1 — aplikasi** | `192.168.122.161` | Docker + Nginx. Menjalankan CampusCare dan stack dummy `web1` (port **8081**) serta `web2` (port **8082**). |
| **VM2 — database** | `192.168.122.28` | PostgreSQL. Port `5432`. |
| **VM3 — host lain** | `192.168.122.175` | Host aplikasi `webkelompok5` yang sudah ada. **Tidak dipakai** untuk deploy CampusCare. |
| **Subnet** | `192.168.122.0/24` | Semua koneksi aplikasi ↔ database lewat subnet ini. |
| **Domain** | `kelompok5-iass.my.id` | Dikelola lewat Cloudflare. |
| **Hostname CampusCare** | `web1.kelompok5-iass.my.id` | Route tunnel sudah menunjuk ke `http://192.168.122.161:8081`. |
| **Cloudflare Tunnel** | Host Debian (di luar VM) | Route diarahkan ke IP:port VM. **Tidak ada `cloudflared` di dalam VM.** |

### Alur Permintaan

```text
  [Pengunjung / Browser]
            │ HTTPS (TLS diurus Cloudflare)
            ▼
    [Cloudflare Edge]
            │ Cloudflare Tunnel
            ▼
  [cloudflared di HOST DEBIAN]  ← bukan di dalam VM
            │ route: web1.kelompok5-iass.my.id
            │        → http://192.168.122.161:8081
            ▼
  ┌──────────────────────────────────────────────┐
  │ VM1 192.168.122.161                          │
  │                                              │
  │  ┌────────────────────────────────────────┐  │
  │  │ Container "web" (Nginx) :8081 → :80    │  │
  │  │  • index.html, css/, js/, views/      │  │
  │  │  • /api/* dan /uploads/* → container   │  │
  │  │    "api"                               │  │
  │  └──────────────────┬─────────────────────┘  │
  │                     │ network Docker         │
  │                     ▼                        │
  │  ┌────────────────────────────────────────┐  │
  │  │ Container "api" (Express :3000)        │  │
  │  │  • tidak dibuka ke host                │  │
  │  │  • foto → volume campuscare_uploads    │  │
  │  └──────────────────┬─────────────────────┘  │
  └─────────────────────┼────────────────────────┘
                        │ DATABASE_URL (TCP 5432)
                        ▼
  ┌──────────────────────────────────────────────┐
  │ VM2 192.168.122.28 — PostgreSQL              │
  │  • database: campuscare                      │
  │  • pg_hba: izinkan 192.168.122.161/32        │
  └──────────────────────────────────────────────┘
```

Karena frontend, `/api/*`, dan `/uploads/*` dilayani lewat satu domain yang sama
melalui Nginx (*same-origin*), browser tidak terkena CORS dan cukup memakai satu
domain.

Foto pengaduan **tidak** disimpan di database dan **tidak** ikut ke dalam image.
Backend menulis ke `/app/uploads` di dalam container; path itu dipasangi named
volume `campuscare_uploads`. Volume ini **wajib di-backup** bersama database.

### Kamus Istilah Singkat

| Istilah | Arti sederhana |
| :--- | :--- |
| **VM** | Komputer virtual di server Proxmox. VM1 menjalankan aplikasi, VM2 menjalankan PostgreSQL. |
| **Image** | Cetakan aplikasi siap jalan (berisi program + dependensinya). |
| **Container** | Aplikasi yang berjalan dari sebuah image. |
| **Docker Compose** | Alat untuk menyalakan beberapa container dari `docker-compose.yml`. |
| **Cloudflare Tunnel** | Terowongan aman dari host Debian ke Cloudflare, sehingga domain bisa diakses tanpa membuka port ke internet. |
| **Portainer** | UI Docker di VM1. Dipakai untuk **menghentikan stack lama**, bukan untuk build CampusCare. |

---

## 2. Peringatan Penting Sebelum Deploy

### 2.1 Jangan deploy lewat Portainer "Repository"

**JANGAN** menambahkan/deploy CampusCare lewat Portainer menu **Stacks →
Repository**. Build image lewat Portainer Agent gagal dengan error:

```text
http2 frame too large
```

Deploy **wajib** lewat SSH ke VM1, lalu jalankan:

```bash
cd ~/campuscare
deploy/scripts/deploy.sh
```

Portainer tetap boleh dipakai untuk **menghentikan stack `web1`** agar port 8081
bebas (lihat Bagian 6.1).

### 2.2 Port 8081 sedang dipakai stack `web1`

Route `web1.kelompok5-iass.my.id` **sudah menunjuk** ke
`http://192.168.122.161:8081`, jadi **tunnel tidak perlu diubah**. Namun port
8081 saat ini dipakai stack dummy `web1`:

1. Buka Portainer di VM1.
2. Masuk ke **Stacks** → pilih stack **`web1`** → klik **Stop**.
3. Jangan menghapus stack/volume `web1`; cukup dihentikan agar bisa dinyalakan
   lagi untuk rollback.

Cek port sudah bebas sebelum deploy:

```bash
ss -ltnp | grep ':8081' || echo "Port 8081 bebas"
```

### 2.3 RAM VM1 terbatas (±1,6 GiB)

VM1 hanya memiliki **±1,6 GiB RAM** dan sudah menjalankan `web1`, `web2`,
`node-exporter`, dan `cAdvisor`. Karena itu:

- Lakukan build saat **tidak ada uji beban** dan tidak ada demo paralel.
- Pantau memori dengan `free -h` dan `docker stats --no-stream`.
- Batas memori di `docker-compose.yml` saat ini: **`api` 512 MB** dan **`web`
  128 MB**. Bila build/container terkena OOM, batas itu **boleh diturunkan**
  (mis. `api` 384 MB, `web` 96 MB), lalu jalankan `deploy/scripts/deploy.sh`
  lagi. Jangan mengubah kode aplikasi.
- Bila perlu, hentikan sementara stack yang tidak sedang dipakai (mis. `web2`)
  **hanya jika diizinkan**, lalu nyalakan kembali setelah deploy.

---

## 3. Akses SSH

### 3.1 Terminal di browser (paling mudah)

Buka salah satu URL berikut, lalu login dengan **One-time PIN** yang dikirim
Cloudflare Access:

| Target | URL |
| :--- | :--- |
| VM1 (web/app) | `https://ssh-webserver.kelompok5-iass.my.id` |
| VM2 (database) | `https://ssh-db.kelompok5-iass.my.id` |
| VM3 (host lain) | `https://ssh-app.kelompok5-iass.my.id` |

### 3.2 Dari terminal laptop dengan `cloudflared`

Pasang `cloudflared`, lalu gunakan `ProxyCommand` (tidak perlu dua terminal):

```bash
ssh -o ProxyCommand="cloudflared access ssh --hostname ssh-webserver.kelompok5-iass.my.id" \
  <user>@ssh-webserver.kelompok5-iass.my.id
```

Ganti `ssh-webserver` menjadi `ssh-db` atau `ssh-app` untuk VM lain, dan ganti
`<user>` dengan user Linux yang diberikan admin. Cloudflare Access akan meminta
One-time PIN saat pertama kali terhubung.

> Tidak ada `cloudflared access tcp` + `ssh 127.0.0.1 -p 2222` di lingkungan ini.
> Tunnel berjalan di host Debian dan hanya meneruskan HTTP ke IP VM.

---

## 4. Prasyarat di VM1

Pastikan sudah terpasang:

- Docker Engine + plugin `docker compose` (Compose v2).
- `git`.
- Akses ke port `5432` VM2 (lihat Bagian 5).

```bash
docker --version
docker compose version
git --version
free -h
```

Tidak perlu memasang `cloudflared` di VM1. Tunnel sudah diurus host Debian.

---

## 5. Menyiapkan Database di VM2 (PostgreSQL)

Database PostgreSQL **tidak** dibuat oleh `docker-compose.yml` CampusCare.
Saat ini `pg_hba.conf` di VM2 hanya mengizinkan `192.168.122.175/32` untuk
database `webkelompok5`. **Jangan menghapus/mengubah aturan itu.** Tambahkan
aturan baru khusus CampusCare dari VM1 (`192.168.122.161/32`).

### 5.1 Buat User & Database CampusCare

Masuk ke VM2 lewat SSH (`https://ssh-db.kelompok5-iass.my.id`), lalu jalankan
salah satu cara berikut.

**A. PostgreSQL terpasang langsung di VM2:**

```bash
sudo -u postgres psql -v ON_ERROR_STOP=1 <<'SQL'
CREATE ROLE campuscare LOGIN PASSWORD 'GANTI_PASSWORD_KUAT';
CREATE DATABASE campuscare OWNER campuscare;
SQL
```

**B. PostgreSQL berjalan di Docker:**

```bash
# Cari nama container PostgreSQL
docker ps --format 'table {{.Names}}\t{{.Image}}\t{{.Ports}}' | grep -i postgres

# Ganti <container_postgres> dengan nama container dari perintah di atas
docker exec -i <container_postgres> psql -U postgres -v ON_ERROR_STOP=1 <<'SQL'
CREATE ROLE campuscare LOGIN PASSWORD 'GANTI_PASSWORD_KUAT';
CREATE DATABASE campuscare OWNER campuscare;
SQL
```

Gunakan sandi kuat dan simpan di tempat aman. Bila sandi mengandung karakter
khusus (`@`, `#`, `:`, `/`, `?`, `%`), tulis versi **URL-encode** di
`DATABASE_URL` (mis. `#` → `%23`).

### 5.2 Tambahkan Aturan `pg_hba.conf`

Aturan yang ditambahkan (satu baris, pilih salah satu metode sandi):

```text
# CampusCare: izinkan VM1 mengambil database campuscare
host    campuscare    campuscare    192.168.122.161/32    scram-sha-256
```

Bila server memang memakai sandi `md5`, gunakan:

```text
host    campuscare    campuscare    192.168.122.161/32    md5
```

> Rekomendasi: **`scram-sha-256`**. Metode `md5` hanya cocok bila sandi user
> benar-benar disimpan dengan `md5` (cek `SHOW password_encryption;`).
> Jangan menulis dua baris sekaligus.

**A. PostgreSQL terpasang langsung:**

```bash
# Lihat lokasi file yang benar-benar dipakai
sudo -u postgres psql -c "SHOW hba_file;"

# Contoh hasil: /etc/postgresql/16/main/pg_hba.conf
sudo nano /etc/postgresql/16/main/pg_hba.conf

# Setelah menambah baris di atas:
sudo systemctl reload postgresql
```

`reload` cukup; tidak perlu restart. Bila perlu, cek status:

```bash
sudo systemctl status postgresql
```

**B. PostgreSQL di Docker:**

```bash
# 1) Pastikan file hba yang dipakai dan lokasi volume datanya
docker exec -it <container_postgres> psql -U postgres -c "SHOW hba_file;"
docker inspect <container_postgres> \
  --format '{{range .Mounts}}{{.Type}} {{.Source}} -> {{.Destination}}{{"\n"}}{{end}}'
```

`SHOW hba_file` biasanya menampilkan `/var/lib/postgresql/data/pg_hba.conf`.
Edit file **di host** pada volume yang terpasang (bukan di dalam container):

```bash
sudo nano <path_volume_dari_docker_inspect>/pg_hba.conf
```

Lalu reload dari dalam container:

```bash
docker exec -it <container_postgres> psql -U postgres -c "SELECT pg_reload_conf();"
```

Bila reload tidak terbaca, restart container PostgreSQL pada jam sepi:

```bash
docker restart <container_postgres>
```

### 5.3 Firewall VM2

Port `5432` **tidak boleh** terbuka ke internet. Bila `ufw` aktif, izinkan hanya
dari VM1:

```bash
sudo ufw status
sudo ufw allow from 192.168.122.161 to any port 5432 proto tcp
```

Bila PostgreSQL di Docker mem-publish port, pastikan publishing-nya tidak
terbuka ke publik (mis. bind ke IP LAN VM2, bukan `0.0.0.0`), dan atur aturan
`DOCKER-USER` bila perlu. Tunnel Cloudflare **hanya** untuk HTTP, bukan port
database.

### 5.4 Verifikasi Koneksi dari VM1

Dari VM1 (bukan dari VM2):

```bash
docker run --rm --network host postgres:16-alpine \
  psql "postgres://campuscare:PASSWORD@192.168.122.28:5432/campuscare" \
  -c "select current_database(), current_user;"
```

Bila berhasil, akan tampil `campuscare | campuscare`.

Contoh isi `.env`:

```text
DATABASE_URL=postgres://USER:PASSWORD@192.168.122.28:5432/campuscare
```

Ganti `USER` dan `PASSWORD` dengan kredensial asli. Skrip deploy sengaja
menolak nilai contoh yang masih mengandung `USER:PASSWORD@` agar tidak lupa
diisi.

---

## 6. Deploy CampusCare di VM1

### 6.1 Kosongkan Port 8081

Hentikan stack `web1` lewat Portainer (Bagian 2.2), lalu pastikan port bebas:

```bash
ss -ltnp | grep ':8081' || echo "Port 8081 bebas"
```

`web2` di port 8082 tidak perlu dihentikan.

### 6.2 Unduh Kode

```bash
git clone <URL_REPO_INI> ~/campuscare
cd ~/campuscare
chmod +x deploy/scripts/*.sh
```

### 6.3 Buat dan Isi `.env`

```bash
cp .env.production.example .env
chmod 600 .env
openssl rand -hex 32
nano .env
```

Isi nilai penting:

- `WEB_PORT=8081` — sudah menjadi default template. Port ini sama dengan route
  tunnel `web1.kelompok5-iass.my.id`, jadi **tunnel tidak perlu diubah**.
- `DATABASE_URL=postgres://USER:PASSWORD@192.168.122.28:5432/campuscare`
- `DB_SSL=false` (PostgreSQL di LAN kampus).
- `JWT_SECRET=<hasil openssl rand -hex 32>`.
- `CORS_ORIGIN=https://web1.kelompok5-iass.my.id` (tanpa garis miring akhir).
- `GOOGLE_CLIENT_ID=<Client ID Google, bila memakai Google Login>`.
- Biarkan `CLOUDFLARE_TUNNEL_TOKEN` **kosong**; tunnel berjalan di host Debian.

### 6.4 Impor Database (Sekali Saja)

Database `campuscare` harus sudah dibuat di VM2 (Bagian 5). Dari folder repo di
VM1:

```bash
deploy/scripts/import-db.sh
```

Ketik **`YA`** saat diminta. Skrip ini mengimpor skema + data awal dari
`backend/db/campuscare_full.sql` memakai container sementara `postgres:16-alpine`
(VM1 tidak perlu memasang `psql`).

> **Jangan** menjalankan `import-db.sh` pada database yang sudah berisi data
> pengguna asli. Skrip ini bersifat *upsert* dan akan menimpa akun demo, aset
> seed, dan teknisi seed. Untuk perubahan skema berikutnya, gunakan
> `deploy/scripts/migrate.sh backend/db/migrations/00X_nama.sql`.

### 6.5 Build & Jalankan

```bash
deploy/scripts/deploy.sh
```

Skrip akan:

1. memeriksa `.env` (`JWT_SECRET`, `DATABASE_URL`, dsb.);
2. `docker compose build --pull`;
3. `docker compose up -d --remove-orphans`;
4. menunggu container `api` dan `web` sehat;
5. mengecek `http://localhost:8081/api/health`.

Semua perintah dijalankan dari VM1 lewat SSH. **Jangan** memakai Portainer
"Repository" untuk langkah ini.

### 6.6 Rollback ke `web1`

```bash
cd ~/campuscare
docker compose down        # JANGAN pakai -v; volume & foto harus tetap ada
```

Lalu di Portainer: **Stacks → `web1` → Start**. Route tunnel sudah menunjuk ke
port 8081, jadi tidak ada perubahan Cloudflare.

---

## 7. Cloudflare Tunnel & Domain

- Tunnel berjalan di **host Debian**, bukan di VM. Tidak ada `cloudflared` yang
  perlu dipasang/dijalankan di VM1/VM2/VM3.
- Route yang sudah ada: `web1.kelompok5-iass.my.id` →
  `http://192.168.122.161:8081`.
- Karena route tersebut sudah menunjuk ke port default CampusCare, **tidak ada
  perubahan tunnel** yang diperlukan saat deploy.
- Bila suatu saat route harus diubah, lakukan di host Debian (konfigurasi
  `cloudflared`) atau dashboard Cloudflare. Jangan mengubah `docker-compose.yml`
  atau memasang tunnel baru di dalam VM.
- Service `cloudflared` di `docker-compose.yml` bersifat opsional dan **tidak
  dipakai** di lingkungan ini; biarkan `CLOUDFLARE_TUNNEL_TOKEN` kosong dan
  jangan jalankan profile `tunnel`.
- TLS/HTTPS diterminasi Cloudflare; koneksi dari host Debian ke VM1 memakai HTTP
  di subnet `192.168.122.0/24`.

---

## 8. Mengaktifkan Login dengan Google (OAuth 2.0)

> Login email + kata sandi tetap berjalan meskipun Google Login belum diatur.

1. Buka [Google Cloud Console](https://console.cloud.google.com/) → **APIs &
   Services** → **Credentials**.
2. Pilih **OAuth 2.0 Client ID** milik CampusCare.
3. Di **Authorized JavaScript origins**, tambahkan:
   ```text
   https://web1.kelompok5-iass.my.id
   ```
   (harus `https://`, tanpa path dan tanpa `/` di akhir).
4. **Save**, lalu tunggu beberapa menit.
5. Pastikan `GOOGLE_CLIENT_ID` di `.env` sama persis dengan yang dipakai
   frontend (`js/config.js` atau `window.CAMPUSCARE_GOOGLE_CLIENT_ID`). Bila
   berubah, jalankan `deploy/scripts/deploy.sh` lagi.

---

## 9. Keamanan Wajib Setelah Deploy

1. **Ganti sandi akun demo** (sandi bawaan ada di repo publik):
   ```bash
   deploy/scripts/set-demo-passwords.sh
   ```
2. **Jangan commit `.env`.** Berkas ini sudah di `.gitignore`. Periksa dengan
   `git status` sebelum `git push`.
3. **Batasi PostgreSQL.** Hanya `192.168.122.161/32` yang boleh mengakses
   database `campuscare`; port `5432` tidak boleh terbuka ke internet.
4. **Jangan mengekspos Docker API/Portainer ke publik.** Portainer hanya untuk
   admin di jaringan/internal.

---

## 10. Uji Akhir (Daftar Centang)

Dari VM1:

- [ ] `curl http://localhost:8081/api/health` → JSON `{"success":true,...}`.
- [ ] `deploy/scripts/check.sh` menampilkan container `api` dan `web` sehat.

Dari browser (domain publik):

- [ ] Buka `https://web1.kelompok5-iass.my.id/api/health`.
- [ ] Login sebagai **Admin Sarpras** (sandi baru hasil `set-demo-passwords.sh`).
- [ ] Tambah/ubah aset di **Inventaris Sarpras**, refresh (`F5`) → data tetap ada.
- [ ] Logout, login sebagai **Mahasiswa**.
- [ ] Buat **Pengaduan Baru** dengan 1–3 foto → tiket muncul dan pratinjau foto
      tampil.
- [ ] Refresh (`F5`) → foto masih tampil (bukan ikon rusak).
- [ ] Buka detail tiket sebagai mahasiswa dan admin → foto tampil di keduanya.
- [ ] Sebagai admin, lakukan disposisi/ubah status → status tersimpan setelah
      refresh.
- [ ] Buka dari HP memakai data seluler untuk memastikan Cloudflare Tunnel dan
      tampilan mobile berjalan.

---

## 11. Operasional Sehari-hari

Semua perintah dijalankan di folder repo (`~/campuscare`) pada VM1:

| Kebutuhan | Perintah |
| :--- | :--- |
| **Cek status cepat + health check + log terakhir** | `deploy/scripts/check.sh` |
| **Lihat log API secara langsung** | `docker compose logs -f api` |
| **Lihat log Nginx (web)** | `docker compose logs -f web` |
| **Restart semua container** | `docker compose restart` |
| **Hentikan aplikasi** | `docker compose down` |
| **Update setelah `git pull`** | `git pull && deploy/scripts/deploy.sh` |
| **Backup database (maks 7 arsip)** | `deploy/scripts/backup-db.sh` |
| **Backup foto (named volume, maks 7 arsip)** | `deploy/scripts/backup-uploads.sh` |
| **Backup database + foto** | `deploy/scripts/backup-db.sh && deploy/scripts/backup-uploads.sh` |
| **Menjalankan migrasi SQL baru** | `deploy/scripts/migrate.sh backend/db/migrations/00X_nama.sql` |

> **Penting:** `docker compose down` **tidak** menghapus named volume. Jangan
> pakai `docker compose down -v` kecuali database dan foto memang ingin dihapus.
> Salin `./backups/` ke mesin lain secara berkala.

### Memantau Memori VM1

```bash
free -h
docker stats --no-stream
```

Bila `api`/`web` sering di-kill saat build, hentikan uji beban, lalu turunkan
`mem_limit` di `docker-compose.yml` (mis. `api` 384 MB, `web` 96 MB) dan deploy
ulang. Jangan menjalankan build bersamaan dengan uji beban atau demo paralel.

### Restore Database dari Backup

```bash
set -a && source .env && set +a
gunzip -c backups/campuscare_YYYYmmdd_HHMM.sql.gz \
  | docker run --rm -i --network host postgres:16-alpine \
      psql "$DATABASE_URL" -v ON_ERROR_STOP=1
```

### Restore Foto dari Backup

Arsip `backups/uploads_YYYYmmdd_HHMM.tar.gz` berisi isi named volume
`campuscare_uploads`. Hentikan API agar tidak ada unggahan saat restore:

```bash
docker compose stop api

docker run --rm \
  -v campuscare_uploads:/data \
  -v "$PWD/backups:/backup" \
  alpine:3.20 \
  sh -c 'rm -rf /data/* && tar xzf /backup/uploads_YYYYmmdd_HHMM.tar.gz -C /data && chown -R 1000:1000 /data'

docker compose start api
```

Setelah restore, buka beberapa tiket lama untuk memastikan fotonya tampil.
Gunakan backup database dan foto dari **waktu yang berdekatan** agar tidak ada
baris `ticket_photos` tanpa berkas (atau sebaliknya).

---

## 12. Pemecahan Masalah (Troubleshooting)

| Gejala / Pesan Error | Kemungkinan Penyebab | Solusi |
| :--- | :--- | :--- |
| **Build lewat Portainer gagal: `http2 frame too large`** | Portainer Agent tidak sanggup mengirim konteks build besar. | Jangan deploy lewat Portainer **Repository**. SSH ke VM1 lalu jalankan `deploy/scripts/deploy.sh`. |
| **Port 8081 sudah dipakai / container `web` gagal start** | Stack `web1` masih berjalan. | Hentikan stack `web1` di Portainer, cek `ss -ltnp \| grep ':8081'`, lalu deploy ulang. |
| **Build sangat lambat atau container di-kill** | RAM VM1 ±1,6 GiB sudah dipakai `web1`/`web2`/monitoring. | Build saat tidak ada uji beban; pantau `free -h` dan `docker stats`; turunkan `mem_limit` `api`/`web` di `docker-compose.yml` bila perlu. |
| **"Tidak dapat terhubung ke server backend"** | Container `api` mati atau `/api` gagal diteruskan Nginx. | `deploy/scripts/check.sh`, lalu `docker compose logs --tail 50 api`. |
| **502 Bad Gateway** | Nginx tidak bisa menghubungi `api` (crash/restart). | Lihat `docker compose logs --tail 50 api`. |
| **Error SQL `column ... does not exist`** | Migrasi terbaru belum dijalankan. | `deploy/scripts/migrate.sh backend/db/migrations/<file>.sql`. |
| **`password authentication failed` / `no pg_hba.conf entry`** | `DATABASE_URL` salah, atau `pg_hba.conf` VM2 belum mengizinkan `192.168.122.161/32` untuk database `campuscare`. | Tambahkan baris `host campuscare campuscare 192.168.122.161/32 scram-sha-256`, lalu `SELECT pg_reload_conf();` (atau `sudo systemctl reload postgresql`). Pastikan password di URL benar/URL-encoded. |
| **`ECONNREFUSED` / `ETIMEDOUT` ke 192.168.122.28:5432** | PostgreSQL tidak listen di alamat tersebut, firewall memblokir, atau container DB tidak mem-publish port ke LAN. | Cek `ss -ltnp \| grep 5432` di VM2, aturan `ufw`/`DOCKER-USER`, dan pastikan koneksi dari VM1 diizinkan. |
| **`403` saat membuka menu role tertentu** | Token lama/role berbeda tersimpan di `localStorage`. | Logout, hapus data situs, lalu login ulang. |
| **Google Login: `origin is not allowed`** | `https://web1.kelompok5-iass.my.id` belum terdaftar. | Tambahkan ke **Authorized JavaScript origins**, tunggu beberapa menit. |
| **Container `api` mati: `JWT_SECRET lemah/belum diset`** | `JWT_SECRET` kosong/contoh/kurang dari 16 karakter. | `openssl rand -hex 32`, isi `.env`, jalankan `deploy/scripts/deploy.sh`. |
| **Unggah foto: `413 Request Entity Too Large`** | Body request melebihi batas Nginx atau berkas > 3 MB. | Pastikan `deploy/nginx/default.conf` terbaru ikut ter-build (`deploy/scripts/deploy.sh`). Perkecil foto. |
| **Foto 404 / ikon rusak setelah deploy** | Volume belum terpasang, `UPLOAD_DIR` diubah, atau `/uploads/` tidak diteruskan. | Pastikan `docker compose config` menampilkan `uploads:/app/uploads` dan `UPLOAD_DIR=/app/uploads`; cek log `api` dan `web`. Jangan mengubah `UPLOAD_DIR`. |
| **API error menulis foto (`EACCES`)** | Volume tidak dapat ditulis user `node` (uid 1000). | `docker compose stop api`, lalu `docker run --rm -v campuscare_uploads:/data alpine:3.20 chown -R 1000:1000 /data`, lalu `docker compose start api`. |
| **Perubahan JS/tampilan tidak muncul** | Cache browser/Cloudflare. | Hard refresh (`Ctrl+F5`), lalu *Purge Cache* di Cloudflare bila perlu. |
