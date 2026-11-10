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
{ "status": "progress", "progress": 60, "note": "Teknisi menuju lokasi." }
```
`progress` dan `note` opsional. `done` → progress 100, `completed_at` terisi, penugasan aktif ditutup.
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

## Memanggil dari frontend

```js
const API = "http://localhost:3000/api";           // ganti dengan URL backend saat deploy
const token = localStorage.getItem("cc-token");

const res = await fetch(`${API}/tickets`, { headers: { Authorization: `Bearer ${token}` } });
const { success, data, message, errors } = await res.json();
```
