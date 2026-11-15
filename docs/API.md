# Dokumentasi API CampusCare

Base URL lokal: `http://localhost:3000/api`

**Format respons** (sesuai kesepakatan kelompok):

```jsonc
// sukses
{ "success": true, "data": { ... }, "message": "..." }      // daftar menambah "meta": { total, limit, offset }
// gagal
{ "success": false, "message": "...", "errors": { "field": "pesan" } }   // "errors" hanya untuk 422/409
```

**Autentikasi:** kirim header `Authorization: Bearer <token>` (token didapat dari register/login, berlaku 8 jam).

| Kode | Arti |
| --- | --- |
| 200 / 201 | Berhasil / berhasil dibuat |
| 400 | Body bukan JSON valid / melanggar constraint DB |
| 401 | Token tidak ada, salah, atau kedaluwarsa; atau email/sandi salah |
| 403 | Role tidak diizinkan |
| 404 | Data tidak ada **atau bukan milik Anda** (sengaja disamakan agar ID tidak bisa ditebak) |
| 409 | Konflik: duplikat, atau aksi tidak boleh pada status tiket saat ini |
| 422 | Validasi input gagal (lihat `errors`) |
| 429 | Terlalu banyak percobaan login/registrasi |

---

## Auth

### `POST /auth/register` — publik
Selalu membuat akun **mahasiswa** (field `role` dari klien diabaikan).

```json
{ "name": "Muhammad Rizki", "nim": "217006999", "faculty": "Teknik Informatika",
  "email": "217006999@student.unsil.ac.id", "password": "minimal8karakter", "confirmPassword": "minimal8karakter" }
```
`confirmPassword` opsional. → `201` `{ data: { token, user: { id, nim, name, email, role, faculty } } }`.
Error: `422` validasi, `409` email/NIM sudah terdaftar.

### `POST /auth/login` — publik
```json
{ "email": "217006120@student.unsil.ac.id", "password": "CampusCare#2026", "role": "student" }
```
`role` opsional (chip peran di form login): bila diisi dan tidak cocok dengan akun → `403`.
Email/sandi salah → `401` dengan pesan yang sama untuk kedua kasus.
Akun dengan `auth_provider='google'` tanpa password akan ditolak dengan respons `401` yang sama ("Email atau kata sandi salah.") demi menjaga keamanan dan mencegah enumerasi pengguna.

### `POST /auth/google` — publik
Autentikasi menggunakan ID Token dari Google Identity Services (GIS).

```json
{ "credential": "<google_id_token>" }
```

**Aturan & Alur Akun:**
- Token diverifikasi dengan `google-auth-library` (`audience = GOOGLE_CLIENT_ID`).
- Tolak bila `email_verified` bukan `true` (`403`).
- Tolak bila domain email tidak ada di daftar `ALLOWED_EMAIL_DOMAINS` (`403`).
- Bila `google_id` sudah ada di database: login pengguna terkait.
- Bila email sudah ada sebagai akun lokal: tautkan `google_id` ke akun tersebut (penautan akun).
- Bila belum ada: buat akun baru dengan role **SELALU** `student` (`password_hash: NULL`, `auth_provider: 'google'`). NIM otomatis diekstrak dari bagian depan email jika berupa 6–20 digit angka, faculty default `"Belum diisi"`. Role tidak pernah bisa ditentukan dari token Google atau dari input klien.
- Dilindungi oleh rate limiter yang sama dengan login/register (`AUTH_RATE_LIMIT`).
- Respons sukses (`200`): `{ data: { token, user: { id, nim, name, email, role, faculty } } }`.

### `GET /auth/me` — login
Profil pengguna dari token → `{ data: { id, nim, name, email, role, faculty } }`.

---

## Pengaduan (`/tickets`) — semua wajib login

`:id` boleh **id numerik** (`13`) atau **kode tiket** yang di-encode (`%23CC-2026-0916`).

| Method & path | Role | Fungsi |
| --- | --- | --- |
| `GET /tickets` | student / admin | Mahasiswa: miliknya saja (tanpa yang sudah dihapus dari riwayat). Admin: semua. |
| `GET /tickets/:id` | student / admin | Detail + `history` + `responses`. Admin juga dapat `notes`, `instructions`, `assignments`. |
| `POST /tickets` | student | Buat pengaduan. |
| `PATCH /tickets/:id` | student (pemilik) | Ubah pengaduan — **hanya saat status `review`**. |
| `DELETE /tickets/:id` | student (pemilik) | Hapus — lihat aturan di bawah. |
| `PATCH /tickets/:id/status` | admin | Ubah status + catat riwayat. |

### Query `GET /tickets`
`status` (`review|progress|waiting|done|rejected`), `category` (kode, mis. `ac`), `priority` (`Tinggi|Sedang|Rendah`),
`q` (cari judul/kode/lokasi/pelapor/deskripsi), `limit` (1–100, default 50), `offset`.

### Body `POST /tickets`
Nama field sengaja mengikuti form pengaduan di frontend:

```json
{
  "title": "AC tidak dingin di Lab AI",
  "category": "ac",                              // categories.code (bukan label)
  "building": "Gedung F (Fakultas Teknik)",      // atau "locationId": 9
  "room": "Lab AI - Lt. 3",
  "priority": "Sedang",                          // Tinggi | Sedang | Rendah (default Sedang)
  "description": "AC berbunyi bising dan tidak dingin.",
  "photoUrl": "https://..."                      // opsional
}
```
Pemetaan label form → kode kategori (`Kelistrikan & AC`→`ac`, `Proyektor & Audio`→`projector`,
`Jaringan Wi-Fi`→`network`, `Sanitasi / Toilet`→`sanitation`, `Meja / Kursi Kuliah`→`furniture`,
`Lift / Akses Gedung`→`lift`) ada di `docs/db-contract.md` §6.1.

Server mengisi sendiri: pemilik (dari token), status `review`, progress `0`, `urgent` (= prioritas Tinggi),
kode tiket, SLA, dan riwayat awal “Pengaduan diterima”. Gedung yang belum ada di tabel `locations`
tetap diterima (disimpan sebagai teks lokasi).

### Body `PATCH /tickets/:id/status` (admin)
```json
{
  "status": "progress",
  "progress": 35,
  "teamId": "electrical",
  "assignee": "hendra",
  "supporters": ["dimas"],
  "priority": "Tinggi",
  "note": "Teknisi menuju lokasi.",
  "instruction": "Segera cek kompresor AC."
}
```
`progress`, `teamId`, `assignee`, `supporters`, `priority`, `note`, dan `instruction` opsional.
Saat disposisi dikirim bersama `teamId`/`assignee`/`supporters`/`priority`, server otomatis menyimpan tim penanganan, PIC + teknisi pendukung ke `ticket_assignments`, prioritas + SLA baru, dan instruksi ke `ticket_comments`.
`done` → progress 100, `completed_at` terisi, penugasan aktif ditutup.
`rejected` → penugasan aktif dilepas. Dari `done` ke status lain = **buka kembali** (penugasan terakhir diaktifkan lagi).
Status yang sama tanpa perubahan lain → `409`.

### Aturan status untuk mahasiswa

| Status tiket | Edit (`PATCH`) | Hapus (`DELETE`) |
| --- | --- | --- |
| `review` | ✅ | ✅ dibatalkan — baris dihapus permanen |
| `progress`, `waiting` | ❌ 409 | ❌ 409 (sedang ditangani) |
| `done`, `rejected` | ❌ 409 | ✅ soft delete — hilang dari daftar mahasiswa, tetap terlihat admin |

### Bentuk objek tiket
Mengikuti objek `report` di frontend (`docs/db-contract.md` §5.1). `id` berisi **kode tiket**; id numerik ada di `ticketId`.

```jsonc
{ "id": "#CC-2026-0916", "ticketId": 13, "title": "...", "description": "...",
  "reporter": "Nama (Mhs • NIM)", "owner": "217006120",
  "location": "Gedung F (Fakultas Teknik) • Lab AI - Lt. 3", "locationId": 9, "building": "...", "room": "...",
  "cat": "ac", "category": { "code": "ac", "label": "Kelistrikan & AC", "icon": "mode_fan" },
  "status": "review", "priority": "Tinggi", "urgent": true, "progress": 0,
  "teamId": null, "team": null, "assignee": null, "assigneeName": null,
  "photoUrl": null, "slaDueAt": "...", "isOverdue": false,
  "createdAt": "...", "updatedAt": "...", "completedAt": null,
  // hanya di detail:
  "history": [{ "id": 31, "at": "...", "label": "...", "actor": "...", "status": "review", "note": "..." }],
  "responses": [{ "id": 1, "at": "...", "author": "...", "text": "..." }]
  // khusus admin: "deletedByStudentAt", "notes", "instructions", "assignments"
}
```

---

## Inventaris Aset (`/assets`) — khusus admin

Semua endpoint wajib login **dan** berperan `admin`. Mahasiswa mendapat `403`.

| Method & path | Fungsi |
| --- | --- |
| `GET /assets` | Daftar aset beserta `history` tiap aset. |
| `GET /assets/:id` | Detail satu aset + `history`. `404` bila tidak ada. |
| `POST /assets` | Tambah aset. Server membuat ID dan status aktif. |
| `PATCH /assets/:id` | Ubah data aset. ID tidak berubah; aset terarsip ditolak `409`. |
| `POST /assets/:id/service` | Tandai selesai servis (hanya aset aktif). |
| `POST /assets/:id/archive` | Arsipkan aset (hanya aset aktif). |
| `POST /assets/:id/restore` | Pulihkan aset (hanya aset terarsip). |
| `DELETE /assets/:id` | Hapus permanen — lihat aturan di bawah. |

`:id` berformat `AST-<PREFIX>-<nomor>` (mis. `AST-AC-0312`). ID yang tidak valid dijawab `404`.

### Query `GET /assets`
`status` (`active` default, `archived`, `all`), `condition` (`good|service|disrupted|broken`),
`category` (kode, mis. `ac`), `q` (cari nama/ID/lokasi), `limit` (1–500, default 200), `offset`.

Respons daftar menambahkan `meta`:

```jsonc
{ "success": true, "data": [ /* objek aset */ ], "message": "Daftar aset.",
  "meta": { "total": 7, "limit": 200, "offset": 0 } }
```

### Body `POST /assets`

```jsonc
{
  "name": "AC Split 2 PK — Lab Komputer 3",
  "category": "ac",                              // categories.code (bukan label)
  "location": "Gedung F (Fakultas Teknik) • Lt. 2", // "building • room"; room opsional
  "zone": "FT",
  "teamId": "electrical",
  "condition": "good",                           // opsional, default good
  "note": "Drainase tersumbat."                  // opsional
}
```

Server mengisi sendiri: `id` (`AST-<PREFIX>-<nomor 4 digit>`), `archived = false`,
`createdAt`, dan riwayat awal `Aset terdaftar`. Bila `note` kosong, disimpan sebagai
`"Tidak ada catatan."`.

Lokasi memakai **find-or-create**: teks dipisahkan pada `•` menjadi `building` dan
`room` (room `NULL` bila kosong). Bila pasangan gedung+ruang sudah ada, baris lama
dipakai dan **zonanya tidak ditimpa** (respons mengembalikan zona yang tersimpan).
Mengirim ulang string `location` persis seperti hasil `GET` tidak membuat baris baru.

### Body `PATCH /assets/:id`

Kirim hanya field yang diubah: `name`, `category`, `location`, `zone`, `teamId`,
`condition`, `note`. `id` tidak bisa diubah. Perubahan dicatat ke `asset_history`
dengan diff `nama`, `kategori`, `lokasi`, `zona`, `tim`, dan `kondisi`; bila tidak ada
perbedaan pada enam field itu, catatan berisi
`"Detail aset diperbarui tanpa perubahan kondisi."`.

### Aturan aksi

- **Servis** → `condition = 'good'`, `last_service_at = now()`, catatan diganti
  `"Servis selesai dan aset dinyatakan kembali dalam kondisi baik."`.
- **Arsip** → `archived = true`, `archived_at` terisi. Hanya untuk aset aktif.
- **Pulihkan** → `archived = false`, `archived_at = NULL`. Hanya untuk aset terarsip.
- **Hapus permanen** hanya bila aset `archived = true`, `last_service_at IS NULL`, dan
  tidak ada tiket yang menunjuk `tickets.asset_id` ke aset tersebut. `asset_history`
  ikut terhapus (CASCADE). Penolakan dibedakan pesannya: belum diarsipkan, punya
  riwayat servis, atau masih terkait tiket.

### Bentuk objek aset

```jsonc
{
  "id": "AST-AC-0312",
  "name": "AC Split 2 PK — Lab Komputer 3",
  "cat": "ac",
  "category": { "code": "ac", "label": "Kelistrikan & AC", "icon": "mode_fan" },
  "location": "Gedung F (Fakultas Teknik) • Lt. 2",
  "zone": "FT",
  "locationId": 10,
  "condition": "service",
  "teamId": "electrical",
  "lastServiceAt": "2026-10-20T04:00:00.000Z",
  "note": "Drainase kondensat tersumbat.",
  "archived": false,
  "archivedAt": null,
  "createdAt": "2026-08-01T03:00:00.000Z",
  "history": [
    { "id": 12, "at": "2026-11-15T01:00:00.000Z", "label": "Servis selesai",
      "actor": "Ir. Hendrawan", "note": "Kondisi aset divalidasi..." }
  ]
}
```

`history` diurutkan dari yang terbaru (`at DESC`). `location` adalah
`building • room`; bagian `room` dihilangkan bila kosong.

### Kode error khas aset

| Kode | Kondisi |
| --- | --- |
| `401` | Token tidak ada/tidak valid. |
| `403` | Bukan admin. |
| `404` | ID aset tidak valid atau tidak ditemukan. |
| `409` | Edit/servis pada aset terarsip, arsip/pulihkan ganda, atau hapus permanen yang tidak memenuhi syarat. |
| `422` | Validasi gagal (`errors` per field): `name`, `category`, `location`, `zone`, `teamId`, `condition`, `note`, atau query `status`/`limit`/`offset`. |

---

## Contoh cepat (curl)

```bash
# login → simpan token
TOKEN=$(curl -s -X POST localhost:3000/api/auth/login -H 'Content-Type: application/json' \
  -d '{"email":"217006120@student.unsil.ac.id","password":"CampusCare#2026"}' | jq -r .data.token)

# daftar pengaduan saya
curl -s localhost:3000/api/tickets -H "Authorization: Bearer $TOKEN"

# buat pengaduan
curl -s -X POST localhost:3000/api/tickets -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{"title":"Proyektor mati","category":"projector","building":"Gedung C (Fakultas Ilmu Komputer)","room":"R.201","priority":"Tinggi","description":"Proyektor tidak menyala sama sekali."}'
```

### Contoh aset (admin)

```bash
# login admin → simpan token
ADMIN_TOKEN=$(curl -s -X POST localhost:3000/api/auth/login -H 'Content-Type: application/json' \
  -d '{"email":"hendrawan@unsil.ac.id","password":"CampusCare#2026","role":"admin"}' | jq -r .data.token)

# daftar seluruh aset (termasuk arsip)
curl -s "localhost:3000/api/assets?status=all&limit=500" -H "Authorization: Bearer $ADMIN_TOKEN"

# tambah aset
curl -s -X POST localhost:3000/api/assets -H "Authorization: Bearer $ADMIN_TOKEN" -H 'Content-Type: application/json' \
  -d '{"name":"AC Split 2 PK — Lab Komputer 3","category":"ac","location":"Gedung F (Fakultas Teknik) • Lt. 2","zone":"FT","teamId":"electrical","condition":"service","note":"Drainase tersumbat."}'

# edit
curl -s -X PATCH localhost:3000/api/assets/AST-AC-0313 -H "Authorization: Bearer $ADMIN_TOKEN" -H 'Content-Type: application/json' \
  -d '{"name":"AC Split 2 PK — Lab Komputer 3","condition":"broken","note":"Kompresor perlu diganti."}'

# servis → arsip → pulihkan → hapus permanen
curl -s -X POST localhost:3000/api/assets/AST-AC-0313/service -H "Authorization: Bearer $ADMIN_TOKEN"
curl -s -X POST localhost:3000/api/assets/AST-AC-0313/archive -H "Authorization: Bearer $ADMIN_TOKEN"
curl -s -X POST localhost:3000/api/assets/AST-AC-0313/restore -H "Authorization: Bearer $ADMIN_TOKEN"
curl -s -X DELETE localhost:3000/api/assets/AST-AC-0313 -H "Authorization: Bearer $ADMIN_TOKEN"
```

## Memanggil dari frontend

```js
const API = "http://localhost:3000/api";           // ganti dengan URL backend saat deploy
const token = localStorage.getItem("cc-token");

const res = await fetch(`${API}/tickets`, { headers: { Authorization: `Bearer ${token}` } });
const { success, data, message, errors } = await res.json();
```

---

## Environment Variables

| Variable | Default | Keterangan |
| --- | --- | --- |
| `DATABASE_URL` | - | PostgreSQL connection URL |
| `DB_SSL` | `false` | Set `true` untuk database cloud yang mewajibkan SSL |
| `JWT_SECRET` | - | Kunci rahasia untuk tanda tangan JWT (min. 16 karakter) |
| `JWT_EXPIRES_IN` | `8h` | Masa berlaku token JWT |
| `PORT` | `3000` | Port server Express |
| `CORS_ORIGIN` | - | Domain frontend yang diizinkan (pisahkan koma) |
| `AUTH_RATE_LIMIT` | `50` | Batas percobaan auth per IP per 15 menit |
| `GOOGLE_CLIENT_ID` | - | Client ID OAuth 2.0 dari Google Cloud Console |
| `ALLOWED_EMAIL_DOMAINS` | `student.unsil.ac.id,unsil.ac.id` | Domain email resmi yang diizinkan login Google |

