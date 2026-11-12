# Kontrak Database CampusCare

Dokumen ini adalah kontrak antara lapisan database dan anggota backend yang
membuat Express/API. Sumber kebenaran skema ada di
[`backend/db/schema.sql`](../backend/db/schema.sql), seed di
[`backend/db/seed.sql`](../backend/db/seed.sql).

Ruang lingkup dokumen ini berfokus pada struktur dan kontrak database PostgreSQL, yang terhubung langsung dengan backend Express/API di folder `backend/`. Contoh query dan spesifikasi skema disediakan sebagai acuan implementasi.

---

## 1. Menjalankan database

### Prasyarat
- PostgreSQL **14+** (diuji dengan PostgreSQL 16.9).
- `psql` tersedia di PATH.
- Node.js 18+ hanya diperlukan jika backend memakai `pg`/`dotenv`.

### Langkah

```bash
cd backend
cp .env.example .env
# edit .env, isi DATABASE_URL yang benar
npm install
npm run db:reset
```

`npm run db:reset` menjalankan `db/reset.sh`, yang:
1. menghapus schema `public` (database development/demo),
2. mengimpor `db/campuscare_full.sql` lewat `psql`.

Alternatif import langsung ke server (tanpa Node):

```bash
psql -h <host> -U <user> -d campuscare -f db/campuscare_full.sql
```

Ulangi perintah yang sama untuk membuktikan file idempotent.

### Akun demo

| Role | Email | NIM | Password |
| --- | --- | --- | --- |
| student | `217006120@student.unsil.ac.id` | `217006120` | `CampusCare#2026` |
| admin | `hendrawan@unsil.ac.id` | `NULL` | `CampusCare#2026` |

> **Peringatan:** password di atas hanya untuk demo. Ganti sebelum rilis.
> Hash dibuat dengan `crypt('<password>', gen_salt('bf'))` (pgcrypto) sehingga
> kompatibel dengan `bcrypt.compare()` di Node.

### Environment

`backend/.env.example` adalah template. Salin menjadi `.env` lalu sesuaikan:

```env
DATABASE_URL=postgres://user:pass@localhost:5432/campuscare
DB_SSL=false
JWT_SECRET=ganti-dengan-secret-acak-minimal-32-karakter
PORT=3000
CORS_ORIGIN=http://localhost:8000
NODE_ENV=development
```

- `DB_SSL=true` → `pg.Pool` memakai SSL.
- `JWT_SECRET` wajib diganti dengan nilai acak; server production menolak
  secret lemah.
- `CORS_ORIGIN` boleh berisi beberapa URL dipisahkan koma.
- `.env` **tidak boleh di-commit**. `.gitignore` mengabaikan `.env`/`.env.*`
  tetapi tetap mengizinkan `.env.example`.
- `backend/src/config/db.js` mengekspor `pool`, `query(text, params)`, dan
  `withTransaction(callback)`.

---

## 2. Tabel dan kolom

Tipe `serial`/`bigserial` adalah integer auto-increment. Semua timestamp
memakai `timestamptz`.

### 2.1 `users`

| Kolom | Tipe | Null / default | Keterangan |
| --- | --- | --- | --- |
| `id` | serial | PK | |
| `nim` | text | nullable, unique | NIM mahasiswa; `NULL` untuk admin/tendik. |
| `name` | text | not null | Nama lengkap. |
| `email` | text | not null, unique | Wajib lowercase (`email = lower(email)`). |
| `password_hash` | text | nullable | Hash bcrypt (`NULL` untuk akun pihak ketiga seperti Google OAuth). |
| `role` | text | not null, default `student` | `student` / `admin`. |
| `faculty` | text | nullable | Fakultas/jurusan atau unit kerja. |
| `google_id` | text | nullable, unique | Subject ID unik dari Google OAuth (Google Identity Services). |
| `auth_provider` | text | not null, default `local` | `local` / `google`. Akun `local` wajib punya `password_hash`. |
| `created_at` | timestamptz | not null, default `now()` | |

### 2.2 `teams`

| Kolom | Tipe | Null / default | Keterangan |
| --- | --- | --- | --- |
| `id` | text | PK | `electrical`, `av`, `civil`, `network`. |
| `name` | text | not null | Nama lengkap tim. |
| `short_name` | text | nullable | Nama pendek untuk UI. |
| `icon` | text | nullable | Nama ikon Material Symbols. |
| `zone` | text | nullable | Zona kerja. |
| `coordinator_id` | text | nullable, FK `technicians.id` | **Deferrable initially deferred**, `ON DELETE SET NULL`. |

### 2.3 `technicians`

| Kolom | Tipe | Null / default | Keterangan |
| --- | --- | --- | --- |
| `id` | text | PK | Slug, mis. `hendra`. |
| `name` | text | not null | Nama pendek. |
| `title` | text | nullable | Sapaan/tampilan, mis. `Pak Hendra`. |
| `role` | text | not null, default `Teknisi` | `Koordinator` / `Teknisi`. |
| `team_id` | text | nullable, FK `teams.id` | `ON DELETE SET NULL`. |
| `active` | boolean | not null, default `true` | `true` bertugas, `false` standby. |
| `archived` | boolean | not null, default `false` | Arsip; riwayat tetap utuh. |
| `phone` | text | nullable | |
| `skills` | text[] | not null, default `{}` | Daftar keahlian. |
| `created_at` | timestamptz | not null, default `now()` | |

### 2.4 `categories`

| Kolom | Tipe | Null / default | Keterangan |
| --- | --- | --- | --- |
| `id` | serial | PK | |
| `code` | text | not null, unique | `ac`, `projector`, `network`, `sanitation`, `furniture`, `lift`, `electrical`. |
| `label` | text | not null | Label tampilan. |
| `icon` | text | nullable | Material Symbols. |
| `default_team_id` | text | nullable, FK `teams.id` | Tim default untuk disposisi. |
| `created_at` | timestamptz | not null, default `now()` | |

Kategori hanya **data referensi** pada revisi ini. CRUD kategori sengaja
dilewati kelompok; `code` tidak dibatasi CHECK agar data referensi tetap
fleksibel, cukup unique.

### 2.5 `locations`

| Kolom | Tipe | Null / default | Keterangan |
| --- | --- | --- | --- |
| `id` | serial | PK | |
| `zone` | text | not null | `FT`, `GKB`, `Perpustakaan`, `Rektorat`, `GOR`, `FIK`, dst. |
| `building` | text | not null | Nama gedung kanonik. |
| `room` | text | nullable | Ruang/lantai; `NULL` = level gedung. |
| `created_at` | timestamptz | not null, default `now()` | |

Constraint:
- `UNIQUE (building, room)`.
- Unique index `uq_locations_building_room_norm` pada
  `(building, COALESCE(room, ''))` supaya hanya ada satu baris level-gedung per
  gedung (PostgreSQL menganggap `NULL` berbeda pada unique biasa).

### 2.6 `assets`

| Kolom | Tipe | Null / default | Keterangan |
| --- | --- | --- | --- |
| `id` | text | PK | Mis. `AST-AC-0312`. |
| `name` | text | not null | |
| `location_id` | integer | not null, FK `locations.id` | `ON DELETE RESTRICT`. |
| `category_id` | integer | not null, FK `categories.id` | `ON DELETE RESTRICT`. |
| `condition` | text | not null, default `good` | `good` / `service` / `disrupted` / `broken`. |
| `team_id` | text | nullable, FK `teams.id` | `ON DELETE SET NULL`. |
| `last_service_at` | timestamptz | nullable | Waktu servis terakhir. |
| `note` | text | nullable | Catatan kondisi; frontend menyimpan `"Tidak ada catatan."` bila kosong. |
| `archived` | boolean | not null, default `false` | `true` = diarsipkan, tidak tampil di daftar aktif; riwayat tetap utuh. |
| `archived_at` | timestamptz | nullable | Waktu arsip. Wajib terisi saat `archived = true`, wajib `NULL` saat `false`. |
| `created_at` | timestamptz | not null, default `now()` | |

Constraint:
- `chk_assets_archived_at`:
  `(archived AND archived_at IS NOT NULL) OR (NOT archived AND archived_at IS NULL)`.
- Index `idx_assets_archived` pada `assets(archived)` untuk filter daftar
  aktif/arsip.
- `assets.id` **tidak** memakai default/sequence; ID dibuat backend (lihat §6.4).

### 2.7 `asset_history`

| Kolom | Tipe | Null / default | Keterangan |
| --- | --- | --- | --- |
| `id` | bigserial | PK | |
| `asset_id` | text | not null, FK `assets.id` | `ON DELETE CASCADE`. |
| `at` | timestamptz | not null, default `now()` | |
| `label` | text | not null | |
| `actor` | text | nullable | Nama pelaku. |
| `note` | text | nullable | |

### 2.8 `tickets`

| Kolom | Tipe | Null / default | Keterangan |
| --- | --- | --- | --- |
| `id` | serial | PK | |
| `ticket_code` | text | not null, unique, default `generate_ticket_code()` | Format `#CC-2026-0916`. |
| `title` | text | not null | |
| `description` | text | nullable | |
| `reporter_name` | text | not null | Teks pelapor dari frontend. |
| `owner_id` | integer | nullable, FK `users.id` | `ON DELETE SET NULL`; `NULL` untuk tendik/non-mahasiswa. |
| `category_id` | integer | not null, FK `categories.id` | `ON DELETE RESTRICT`. |
| `location_id` | integer | nullable, FK `locations.id` | `ON DELETE SET NULL`. |
| `location_detail` | text | nullable | Ruang yang diketik mahasiswa. |
| `asset_id` | text | nullable, FK `assets.id` | `ON DELETE RESTRICT`; tiket yang masih menunjuk aset menahan hapus permanen aset. |
| `status` | text | not null, default `review` | `review` / `progress` / `waiting` / `done` / `rejected`. |
| `priority` | text | not null, default `Sedang` | `Tinggi` / `Sedang` / `Rendah`. |
| `urgent` | boolean | not null, default `false` | |
| `progress` | integer | not null, default `0` | `0..100`. |
| `team_id` | text | nullable, FK `teams.id` | `ON DELETE SET NULL`. |
| `photo_url` | text | nullable | Untuk fitur upload foto nanti. |
| `sla_due_at` | timestamptz | nullable | Diisi trigger bila `NULL`. |
| `created_at` | timestamptz | not null, default `now()` | |
| `updated_at` | timestamptz | not null, default `now()` | Diisi trigger saat `UPDATE`. |
| `completed_at` | timestamptz | nullable | |
| `deleted_by_student_at` | timestamptz | nullable | Soft delete mahasiswa. |

### 2.9 `ticket_assignments`

| Kolom | Tipe | Null / default | Keterangan |
| --- | --- | --- | --- |
| `id` | bigserial | PK | |
| `ticket_id` | integer | not null, FK `tickets.id` | `ON DELETE CASCADE`. |
| `technician_id` | text | not null, FK `technicians.id` | `ON DELETE RESTRICT`. |
| `role` | text | not null | `PIC` / `Pendukung`. |
| `status` | text | not null, default `active` | `active` / `replaced` / `removed` / `done`. |
| `assigned_at` | timestamptz | not null, default `now()` | |
| `assigned_by` | integer | nullable, FK `users.id` | `ON DELETE SET NULL`. |

Index unik parsial:
- `uq_ticket_assignments_active_pic` → satu PIC `active` per tiket.
- `uq_ticket_assignments_active_tech` → satu penugasan `active` per
  tiket+teknisi.

### 2.10 `ticket_history`

| Kolom | Tipe | Null / default | Keterangan |
| --- | --- | --- | --- |
| `id` | bigserial | PK | |
| `ticket_id` | integer | not null, FK `tickets.id` | `ON DELETE CASCADE`. |
| `at` | timestamptz | not null, default `now()` | |
| `label` | text | not null | Judul langkah. |
| `actor` | text | nullable | Nama pelaku. |
| `status` | text | nullable | Status tiket saat entri dibuat; boleh `NULL`. |
| `note` | text | nullable | |

### 2.11 `ticket_comments`

| Kolom | Tipe | Null / default | Keterangan |
| --- | --- | --- | --- |
| `id` | bigserial | PK | |
| `ticket_id` | integer | not null, FK `tickets.id` | `ON DELETE CASCADE`. |
| `kind` | text | not null | `response` / `note` / `instruction`. |
| `author_id` | integer | nullable, FK `users.id` | `ON DELETE SET NULL`. |
| `author_name` | text | nullable | Nama tampilan. |
| `target_technician_id` | text | nullable, FK `technicians.id` | `ON DELETE SET NULL`. |
| `body` | text | not null | |
| `is_public` | boolean | not null, default `false` | `true` = boleh dilihat mahasiswa. |
| `read_at` | timestamptz | nullable | Ekstensi untuk `readAt` instruksi frontend. |
| `created_at` | timestamptz | not null, default `now()` | |

---

## 3. Nilai CHECK

| Tabel.kolom | Nilai yang diizinkan |
| --- | --- |
| `users.role` | `student`, `admin` |
| `technicians.role` | `Koordinator`, `Teknisi` |
| `assets.condition` | `good`, `service`, `disrupted`, `broken` |
| `assets.archived` + `assets.archived_at` | `chk_assets_archived_at`: keduanya terisi atau keduanya kosong |
| `tickets.status` | `review`, `progress`, `waiting`, `done`, `rejected` |
| `tickets.priority` | `Tinggi`, `Sedang`, `Rendah` |
| `tickets.progress` | integer `0..100` |
| `ticket_assignments.role` | `PIC`, `Pendukung` |
| `ticket_assignments.status` | `active`, `replaced`, `removed`, `done` |
| `ticket_history.status` | `NULL` atau salah satu status tiket |
| `ticket_comments.kind` | `response`, `note`, `instruction` |
| `users.email` | wajib `email = lower(email)` |
| `users.nim` | `NULL` atau 6–20 digit |
| `tickets.ticket_code` | regex `^#CC-[0-9]{4}-[0-9]{4,}$` |

---

## 4. Aturan bisnis yang ditegakkan DB

1. **Satu PIC aktif per tiket**
   `uq_ticket_assignments_active_pic` menolak insert/update kedua dengan
   `role='PIC'` dan `status='active'` pada tiket yang sama.
2. **Satu penugasan aktif per teknisi per tiket**
   `uq_ticket_assignments_active_tech` mencegah duplikasi teknisi aktif pada
   tiket yang sama.
3. **SLA otomatis**
   Trigger `trg_tickets_before_write` mengisi `sla_due_at` bila `NULL`:
   - `Tinggi` → `created_at + 2 jam`
   - `Sedang` → `created_at + 6 jam`
   - `Rendah` → `created_at + 24 jam`
4. **`updated_at` otomatis**
   Trigger yang sama mengisi `updated_at = now()` pada setiap `UPDATE`.
5. **Kode tiket otomatis**
   `ticket_code_seq` mulai dari 916. Default `generate_ticket_code()`
   menghasilkan `#CC-<tahun>-<sequence 4 digit>`. Seed menaikkan sequence ke
   kode tertinggi + 1.
6. **Soft delete**
   `deleted_by_student_at` hanya diisi saat mahasiswa menghapus riwayat. Baris
   tetap ada; query mahasiswa wajib menambahkan
   `deleted_by_student_at IS NULL`. Admin tidak memfilter kolom ini.
7. **Foreign key**
   Lihat tabel ON DELETE di [ERD.md](./ERD.md). Kategori/lokasi yang masih
   dipakai tidak bisa dihapus (`RESTRICT`).
8. **Teknisi arsip**
   Jangan hapus teknisi yang sudah punya riwayat. Set `archived = true` dan
   `active = false`. FK `ticket_assignments.technician_id` memakai `RESTRICT`.
9. **Email lowercase**
   Backend wajib `lower(trim(email))` sebelum insert/login. DB menolak email
   yang mengandung huruf besar.
10. **Progress**
    Nilai di luar 0–100 ditolak.
11. **Kategori/lokasi adalah data referensi**
    CRUD kategori dan lokasi sengaja dilewati pada revisi ini. Tabel
    `categories` dan `locations` tetap ada sebagai referensi aset/tiket.
    `DELETE` tetap ditolak FK `RESTRICT` bila baris masih dipakai.
12. **Arsip aset**
    `archived` dan `archived_at` harus konsisten (`chk_assets_archived_at`).
    Aset terarsip tidak ditampilkan di daftar aktif, tetapi baris dan
    `asset_history`-nya tetap ada. Pulihkan dengan `archived = false` dan
    `archived_at = NULL`.
13. **Aset yang punya tiket tidak boleh dihapus**
    FK `tickets.asset_id` memakai `ON DELETE RESTRICT`. Hapus permanen hanya
    boleh untuk aset `archived = true`, `last_service_at IS NULL`, dan tanpa
    baris `tickets` yang menunjuk `asset_id` tersebut. `asset_history` memakai
    `ON DELETE CASCADE`, jadi riwayat aset ikut terhapus saat aset benar-benar
    dihapus.
14. **ID aset tidak dibuat database**
    `assets.id` berupa TEXT tanpa default. Backend wajib membuat ID mengikuti
    pola frontend (lihat §6.4.1).

---

## 5. Pemetaan field frontend → kolom DB

### 5.1 Objek `report` (tiket)

| Field frontend | Kolom / sumber DB |
| --- | --- |
| `id` | `tickets.ticket_code` |
| `title` | `tickets.title` |
| `description` | `tickets.description` |
| `reporter` | `tickets.reporter_name` |
| `owner` | `users.nim` lewat `tickets.owner_id` |
| `location` | `v_ticket_summary.location_label` (`locations.building` + `tickets.location_detail`/`locations.room`) |
| `cat` | `categories.code` lewat `tickets.category_id` |
| `status` | `tickets.status` |
| `urgent` | `tickets.urgent` |
| `priority` | `tickets.priority` |
| `date` | turunan `tickets.created_at` (format di frontend) |
| `team` | `teams.name` lewat `tickets.team_id` |
| `teamId` | `tickets.team_id` |
| `assignee` | `ticket_assignments.technician_id` dengan `role='PIC'` dan `status IN ('active','done')` |
| `assignedAt` | `ticket_assignments.assigned_at` milik PIC |
| `assignments[]` | baris `ticket_assignments` |
| `instructions[]` | `ticket_comments` dengan `kind='instruction'` |
| `notes[]` | `ticket_comments` dengan `kind='note'` |
| `history[]` | baris `ticket_history` |
| `progress` | `tickets.progress` |
| `createdAt` | `tickets.created_at` |
| `updatedAt` | `tickets.updated_at` |
| `completedAt` | `tickets.completed_at` |
| `slaDueAt` | `tickets.sla_due_at` |
| `photoUrl` | `tickets.photo_url` |
| `deletedByStudentAt` | `tickets.deleted_by_student_at` |

### 5.2 `assignments[]`

| Field frontend | Kolom DB |
| --- | --- |
| `techId` | `ticket_assignments.technician_id` |
| `role` | `ticket_assignments.role` |
| `assignedAt` | `ticket_assignments.assigned_at` |
| `assignedBy` | `users.name` lewat `ticket_assignments.assigned_by` |
| `status` | `ticket_assignments.status` |

### 5.3 `instructions[]`

| Field frontend | Kolom DB |
| --- | --- |
| `id` | `ticket_comments.id` (numerik; ID tampilan `INS-...` tidak disimpan) |
| `at` | `ticket_comments.created_at` |
| `from` | `ticket_comments.author_name` |
| `toTechId` | `ticket_comments.target_technician_id` |
| `text` | `ticket_comments.body` |
| `readAt` | `ticket_comments.read_at` |

### 5.4 `notes[]`

| Field frontend | Kolom DB |
| --- | --- |
| `at` | `ticket_comments.created_at` |
| `author` | `ticket_comments.author_name` |
| `text` | `ticket_comments.body` |

### 5.5 Teknisi

| Field frontend | Kolom DB |
| --- | --- |
| `id` | `technicians.id` |
| `name` | `technicians.name` |
| `title` | `technicians.title` |
| `role` | `technicians.role` |
| `teamId` | `technicians.team_id` |
| `active` | `technicians.active` |
| `archived` | `technicians.archived` |
| `phone` | `technicians.phone` |
| `skills` | `technicians.skills` |

### 5.6 Tim

| Field frontend | Kolom DB |
| --- | --- |
| `id` | `teams.id` |
| `name` | `teams.name` |
| `short` | `teams.short_name` |
| `icon` | `teams.icon` |
| `accent` | **UI-only**, tidak disimpan |
| `zone` | `teams.zone` |
| `coordinator` | `teams.coordinator_id` |

### 5.7 Aset

| Field frontend | Kolom DB |
| --- | --- |
| `id` | `assets.id` |
| `name` | `assets.name` |
| `location` | `v_ticket_summary.location_label`-style join `locations` |
| `zone` | `locations.zone` |
| `cat` | `categories.code` lewat `assets.category_id` |
| `condition` | `assets.condition` |
| `teamId` | `assets.team_id` |
| `lastServiceAt` | `assets.last_service_at` |
| `note` | `assets.note` |
| `archived` | `assets.archived` |
| `archivedAt` | `assets.archived_at` |
| `history[]` | `asset_history` |

### 5.8 Auth / registrasi

| Field frontend | Kolom DB |
| --- | --- |
| `reg-name` | `users.name` |
| `reg-nim` | `users.nim` |
| `reg-fakultas` | `users.faculty` |
| `reg-email` | `users.email` (lowercase) |
| `reg-password` | `users.password_hash` (hash bcrypt di backend) |
| `login-email` | `users.email` |
| `login-password` | dibandingkan dengan `users.password_hash` |
| role login | `users.role` |

### 5.9 Form pengaduan

| Field frontend | Kolom DB |
| --- | --- |
| `complaint-title` | `tickets.title` |
| `complaint-category` | `categories.code` (lihat pemetaan di bawah) |
| `complaint-building` | `locations.building` |
| `complaint-room` | `tickets.location_detail` (dan/atau `locations.room`) |
| `complaint-priority` | `tickets.priority` |
| `complaint-desc` | `tickets.description` |
| lampiran foto | `tickets.photo_url` |

### 5.10 Metadata UI

| Frontend | DB |
| --- | --- |
| `CATEGORY_META` | tabel `categories` (`code`, `label`, `icon`) |
| `STATUS_META` | CHECK `tickets.status`; label/chip tetap di frontend |
| `PRIORITY_META` | CHECK `tickets.priority`; chip tetap di frontend |
| `SLA_HOURS` | trigger `tickets_before_write` |
| `ASSET_CONDITION` | CHECK `assets.condition`; label/chip tetap di frontend |

---

## 6. Keputusan penyatuan data frontend

### 6.1 Kategori

Sumber: `CATEGORY_META` (7 kategori). Form pengaduan hanya menawarkan 6 opsi
dengan label berbeda dan **tidak** menawarkan `electrical`.

| Label form pengaduan | `categories.code` | Catatan |
| --- | --- | --- |
| `Kelistrikan & AC` | `ac` | Termasuk AC. |
| `Proyektor & Audio` | `projector` | |
| `Jaringan Wi-Fi` | `network` | |
| `Sanitasi / Toilet` | `sanitation` | Label DB: `Sanitasi & Sipil`. |
| `Meja / Kursi Kuliah` | `furniture` | Label DB: `Meubel & Ruang Kuliah`. |
| `Lift / Akses Gedung` | `lift` | |
| — (tidak ada di form) | `electrical` | Tetap disimpan karena dipakai aset/tiket seed dan `CATEGORY_META`. |

Keputusan:
- Pakai **7 kategori** dari `CATEGORY_META` sebagai sumber.
- Form mahasiswa tetap 6 opsi; `electrical` dapat dipilih admin/disposisi atau
  ditambahkan ke form nanti tanpa mengubah skema.
- `default_team_id` mengikuti `TEAM_FOR_CATEGORY` di `features/dispatch.js`:
  `ac`/`electrical` → `electrical`, `projector` → `av`, `network` → `network`,
  `sanitation`/`furniture`/`lift` → `civil`.

### 6.2 Lokasi

Form pengaduan memakai gedung `Gedung A`–`Gedung F` + ruangan bebas. Seed aset
memakai zona `FT`, `GKB`, `Perpustakaan`, `Rektorat`, `GOR`. Keduanya disatukan
di `locations(zone, building, room)`:

| Asal | Contoh | `zone` | `building` | `room` |
| --- | --- | --- | --- | --- |
| Form | Gedung A (Rektorat) | `Rektorat` | `Gedung A (Rektorat)` | `NULL` / bebas |
| Form | Gedung F (Fakultas Teknik) | `FT` | `Gedung F (Fakultas Teknik)` | `NULL` / bebas |
| Aset | Gedung F • Lt. 2 | `FT` | `Gedung F (Fakultas Teknik)` | `Lt. 2` |
| Aset | GKB • R.204 | `GKB` | `GKB (Gedung Kuliah Bersama)` | `R.204` |
| Aset | Perpustakaan • Lt. 2 | `Perpustakaan` | `Gedung D (Perpustakaan Pusat)` | `Lt. 2` |
| Aset | Rektorat • Gedung A | `Rektorat` | `Gedung A (Rektorat)` | `NULL` |
| Aset | Gelanggang Olahraga | `GOR` | `Gelanggang Olahraga` | `NULL` |
| Tiket | Aula Serbaguna • Lt. 1 | `Rektorat` | `Aula Serbaguna` | `Lt. 1` |

Keputusan:
- `zone` menyimpan zona operasional; `building` menyimpan nama gedung kanonik;
  `room` menyimpan ruang/lantai spesifik.
- `tickets.location_detail` tetap menyimpan teks ruang yang diketik mahasiswa.
  View menggabungkan `building` + `location_detail`/`room` menjadi
  `location_label`.
- Tambahan zona `FIK` untuk `Gedung C (Fakultas Ilmu Komputer)`; gedung B/E/F
  masuk `FT`.
- Tambahan `GKB (Gedung Kuliah Bersama)`, `Gelanggang Olahraga`, dan
  `Aula Serbaguna` karena muncul di seed aset/tiket tetapi tidak ada di form.
- `UNIQUE (building, room)` + unique index `COALESCE(room, '')` mencegah
  duplikasi, termasuk saat `room` NULL.

### 6.3 Ketidakcocokan lain dan keputusan

1. **Status frontend 4 vs dokumen proyek 5**
   Frontend memakai `review`, `progress`, `waiting`, `done`. DB menambahkan
   `rejected` sesuai dokumen proyek. UI boleh mengabaikan `rejected` sampai
   fitur penolakan dibuat.
2. **`owner` berupa NIM**
   Frontend menyimpan NIM, DB menyimpan `owner_id` FK ke `users.id`. Backend
   harus resolve NIM → `users.id`.
3. **Tiket `#CC-2026-0871`**
   Pemilik NIM `217008812` (Nabila Putri) tidak punya akun seed. Keputusan:
   `owner_id = NULL`, identitas tetap di `reporter_name`. Jika akun Nabila
   dibuat, backend dapat meng-update `owner_id`.
4. **`report.team` dan `report.assignee` denormalisasi**
   Frontend menyimpan nama tim/teknisi langsung. DB menormalkan lewat
   `team_id` dan `ticket_assignments`. Backend harus join untuk mengisi field
   tampilan.
5. **`report.date`**
   Frontend menyimpan label tanggal yang sudah diformat. DB hanya menyimpan
   `created_at`; format dilakukan di backend/frontend.
6. **Field UI-only**
   `CATEGORY_META.badge`, `STATUS_META.chip/dot/pulse`, `PRIORITY_META.chip`,
   `teams.accent`, dan `ASSET_CONDITION.chip/weight` tidak disimpan.
7. **ID instruksi**
   Frontend memakai string `INS-0908-01`. DB memakai `ticket_comments.id`
   numerik. ID tampilan bisa dibuat backend atau diabaikan.
8. **`readAt` instruksi**
   Ditambahkan kolom `ticket_comments.read_at` sebagai ekstensi agar field
   frontend tetap terpetakan.
9. **`report.notes` vs `report.history`**
   `notes` → `ticket_comments` (`kind='note'`), `history` → `ticket_history`.
   Keduanya sengaja dipisah: notes untuk diskusi operasional, history untuk
   audit status.
10. **Foto**
    `photo_url` sudah disiapkan, tetapi fitur upload belum diimplementasikan di
    frontend. Backend tinggal mengisi URL object storage.
11. **Soft delete**
    Frontend menghapus dari array in-memory. DB memakai
    `deleted_by_student_at`; tiket tetap terlihat admin.
12. **Aset dan tiket**
    `tickets.asset_id` nullable. Seed hanya menautkan tiket ke aset jika
    kecocokannya jelas (AC, proyektor, Wi-Fi, lift, pintu toilet, lampu GOR).

### 6.4 Alur CRUD inventaris aset (admin)

Ruang lingkup revisi ini hanya database + dokumentasi. Backend saat ini baru
memiliki endpoint auth dan tiket; **endpoint aset belum ada**. CRUD kategori dan
lokasi juga sengaja dilewati; `categories`/`locations` hanya data referensi.

#### 6.4.1 Pembuatan ID aset

Database tidak membuat ID otomatis. Backend harus meniru `nextAssetId` di
`js/data/assets.js`:

- Format: `AST-<PREFIX>-<nomor 4 digit>`.
- Nomor = nomor tertinggi yang sudah ada untuk prefix itu + 1, diisi nol di
  depan (`lpad(..., 4, '0')`).
- Prefix per `categories.code`:

| `categories.code` | Prefix |
| --- | --- |
| `ac` | `AC` |
| `projector` | `PRJ` |
| `network` | `WIFI` |
| `sanitation` | `SAN` |
| `furniture` | `MJR` |
| `lift` | `LFT` |
| `electrical` | `LMP` |

Contoh query yang sudah diuji (setelah seed, `$1 = 'ac'` menghasilkan
`AST-AC-0313`):

```sql
WITH target AS (
  SELECT
    c.id AS category_id,
    CASE c.code
      WHEN 'ac'         THEN 'AC'
      WHEN 'projector'  THEN 'PRJ'
      WHEN 'network'    THEN 'WIFI'
      WHEN 'sanitation' THEN 'SAN'
      WHEN 'furniture'  THEN 'MJR'
      WHEN 'lift'       THEN 'LFT'
      WHEN 'electrical' THEN 'LMP'
    END AS prefix
  FROM categories c
  WHERE c.code = $1
)
SELECT 'AST-' || t.prefix || '-' ||
       lpad((
         COALESCE(MAX(
           substring(a.id FROM '^AST-' || t.prefix || '-([0-9]+)$')::int
         ), 0) + 1
       )::text, 4, '0') AS next_asset_id
FROM target t
LEFT JOIN assets a ON a.category_id = t.category_id
GROUP BY t.prefix;
```

Agar dua admin yang menambah aset bersamaan tidak mendapat ID kembar, jalankan
pencarian nomor dan `INSERT` dalam **satu transaksi** dengan advisory lock per
kategori:

```sql
BEGIN;
SELECT pg_advisory_xact_lock(hashtext('assets:' || $1)); -- $1 = categories.code
-- SELECT next_asset_id ... lalu INSERT INTO assets ...
COMMIT;
```

#### 6.4.2 Lokasi dari form aset (find-or-create)

Form aset menyimpan lokasi sebagai teks bebas (contoh `"Gedung F • Lt. 2"`) dan
zona sebagai teks bebas (contoh `"FT"`), sedangkan `assets.location_id` wajib
NOT NULL. Aturan:

1. Pisahkan teks lokasi pada tanda `•`: bagian pertama menjadi `building`,
   bagian kedua menjadi `room`. `room = NULL` bila tidak ada tanda `•` atau
   bagian ruang kosong.
2. `zone` diisi dari field zona form.
3. Cari baris `locations` dengan `building` + `room`; buat bila belum ada.
4. Unique index `uq_locations_building_room_norm` memakai ekspresi
   `(building, COALESCE(room, ''))`, jadi `ON CONFLICT` **wajib** memakai
   ekspresi yang sama (bukan `ON CONFLICT (building, room)`).

Contoh query yang sudah diuji (input `$1 = 'FT'`,
`$2 = 'Gedung F • Lt. 2'`; dijalankan dua kali tetap menghasilkan baris yang
sama):

```sql
INSERT INTO locations (zone, building, room)
VALUES (
  $1,
  btrim(split_part($2, '•', 1)),
  NULLIF(btrim(split_part($2, '•', 2)), '')
)
ON CONFLICT (building, (COALESCE(room, ''))) DO UPDATE
  SET zone = locations.zone
RETURNING id, zone, building, room;
```

#### 6.4.3 Aturan hapus aset permanen

Hapus permanen hanya boleh bila **semua** syarat berikut terpenuhi:

- `assets.archived = true`;
- `assets.last_service_at IS NULL`;
- tidak ada baris `tickets` dengan `asset_id` = ID aset tersebut.

Database tetap menolak `DELETE` bila masih ada tiket lewat FK RESTRICT
(`tickets_asset_id_fkey`, kode error `23503`). `asset_history` ikut terhapus
lewat `ON DELETE CASCADE`.

Catatan penting: `relatedTickets` di frontend mencocokkan tiket lewat
**kategori** (`report.cat === asset.cat`, status bukan `done`), bukan lewat
`tickets.asset_id`. Backend wajib memakai `tickets.asset_id` sebagai sumber
kebenaran saat memeriksa relasi tiket–aset.

#### 6.4.4 Aturan tambahan dari frontend inventaris

- **Tandai selesai servis** mengubah `condition` menjadi `good`, mengisi
  `last_service_at = now()`, dan mengganti `note` (frontend memakai
  `"Servis selesai dan aset dinyatakan kembali dalam kondisi baik."`). Catat
  juga `asset_history` berlabel `"Servis selesai"`.
- **Edit** dan **servis** hanya boleh pada aset aktif (`archived = false`).
- **Arsip** hanya untuk aset aktif; **pulihkan** hanya untuk aset terarsip.
- **Note kosong** disimpan frontend sebagai `"Tidak ada catatan."`; backend
  sebaiknya melakukan normalisasi yang sama.
- Penolakan hapus oleh FK RESTRICT (kode PostgreSQL `23503`) harus
  diterjemahkan backend menjadi pesan yang jelas, misalnya
  `"Aset masih memiliki tiket terkait dan tidak dapat dihapus permanen."`,
  bukan pesan generik.

---

## 7. Contoh query untuk backend

### 7.1 Login — cari user by email

```sql
SELECT id, nim, name, email, role, faculty, password_hash
FROM users
WHERE email = lower($1);
```

Di Node:

```js
const { rows } = await query(
  `SELECT id, nim, name, email, role, faculty, password_hash
     FROM users
    WHERE email = lower($1)`,
  [email]
);
const user = rows[0];
const ok = user ? await bcrypt.compare(password, user.password_hash) : false;
```

### 7.2 Daftar tiket milik mahasiswa (belum soft-deleted)

```sql
SELECT ticket_code, title, status, priority, category_label, location_label,
       team_name, pic_name, progress, sla_due_at, created_at, completed_at
FROM v_ticket_summary
WHERE owner_nim = $1
  AND deleted_by_student_at IS NULL
ORDER BY created_at DESC;
```

### 7.3 Daftar semua tiket admin + filter status

```sql
SELECT ticket_code, title, status, priority, category_label, location_label,
       team_name, pic_name, is_overdue, deleted_by_student_at, created_at
FROM v_ticket_summary
WHERE ($1::text IS NULL OR status = $1)
ORDER BY created_at DESC;
```

`$1 = NULL` → semua tiket; `$1 = 'review'` → hanya tiket review. Admin tetap
melihat tiket yang sudah di-soft-delete mahasiswa.

### 7.4 Buat tiket + history awal

```sql
WITH created AS (
  INSERT INTO tickets (
    title, description, reporter_name, owner_id,
    category_id, location_id, location_detail,
    priority, urgent, photo_url
  )
  VALUES (
    $1,                                      -- title
    $2,                                      -- description
    $3,                                      -- reporter_name
    (SELECT id FROM users WHERE nim = $4),   -- owner_id (NULL untuk tendik)
    (SELECT id FROM categories WHERE code = $5),
    (SELECT id FROM locations WHERE id = $6),
    $7,                                      -- location_detail
    $8,                                      -- priority
    $9,                                      -- urgent
    $10                                      -- photo_url
  )
  RETURNING id, ticket_code, reporter_name, status, sla_due_at, created_at
), logged AS (
  INSERT INTO ticket_history (ticket_id, label, actor, status, note)
  SELECT id, 'Pengaduan diterima', reporter_name, 'review',
         'Laporan masuk ke antrean verifikasi Biro Sarpras.'
  FROM created
)
SELECT * FROM created;
```

`sla_due_at` diisi otomatis oleh trigger. `ticket_code` juga otomatis.

### 7.5 Ubah status + catat ke `ticket_history`

```sql
BEGIN;

UPDATE tickets
SET status = $2,
    progress = $3,
    completed_at = CASE WHEN $2 = 'done' THEN now() ELSE NULL END
WHERE id = $1
RETURNING id, ticket_code, status, progress, completed_at, updated_at;

INSERT INTO ticket_history (ticket_id, label, actor, status, note)
VALUES ($1, $4, $5, $2, $6);

-- Saat tiket selesai, tutup penugasan aktif.
UPDATE ticket_assignments
SET status = 'done'
WHERE ticket_id = $1
  AND status = 'active'
  AND $2 = 'done';

COMMIT;
```

Untuk reopen, backend perlu membuat penugasan PIC `active` baru (atau
mengaktifkan kembali penugasan yang sesuai) tanpa melanggar unique index PIC.

### 7.6 Hapus riwayat mahasiswa (soft delete)

```sql
UPDATE tickets
SET deleted_by_student_at = now()
WHERE id = ANY($1::int[])
  AND owner_id = $2
  AND deleted_by_student_at IS NULL
RETURNING id, ticket_code;
```

Alternatif memakai NIM:

```sql
UPDATE tickets
SET deleted_by_student_at = now()
WHERE id = ANY($1::int[])
  AND owner_id = (SELECT id FROM users WHERE nim = $2)
  AND deleted_by_student_at IS NULL
RETURNING id, ticket_code;
```

### 7.7 Referensi kategori

CRUD kategori tidak diimplementasikan pada revisi ini. Backend hanya membaca
data referensi:

```sql
SELECT id, code, label, icon, default_team_id
FROM categories
ORDER BY label;
```

### 7.8 Referensi lokasi + find-or-create

CRUD lokasi tidak diimplementasikan. Lokasi baru hanya dibuat otomatis dari form
aset memakai query find-or-create di §6.4.2. Untuk membaca daftar:

```sql
SELECT id, zone, building, room
FROM locations
ORDER BY zone, building, room NULLS FIRST;
```

### 7.9 Daftar teknisi dengan beban kerja

```sql
SELECT technician_id, name, title, role, team_id, team_name,
       active_ticket_count, done_ticket_count, total_ticket_count
FROM v_technician_workload
WHERE archived = false
  AND ($1::text IS NULL OR team_id = $1)
ORDER BY active_ticket_count DESC, name;
```

Pilih teknisi paling ringan untuk disposisi:

```sql
SELECT technician_id, name, title, active_ticket_count
FROM v_technician_workload
WHERE team_id = $1
  AND active = true
  AND archived = false
ORDER BY active_ticket_count ASC, name ASC
LIMIT 1;
```

### 7.10 Detail PIC aktif tiket

```sql
SELECT ta.id, ta.technician_id, tech.name, tech.title,
       ta.role, ta.status, ta.assigned_at,
       u.name AS assigned_by_name
FROM ticket_assignments ta
JOIN technicians tech ON tech.id = ta.technician_id
LEFT JOIN users u ON u.id = ta.assigned_by
WHERE ta.ticket_id = $1
  AND ta.role = 'PIC'
  AND ta.status IN ('active', 'done')
ORDER BY
  CASE ta.status WHEN 'active' THEN 0 ELSE 1 END,
  ta.assigned_at DESC
LIMIT 1;
```

### 7.11 Daftar aset aktif

```sql
SELECT
  a.id,
  a.name,
  c.code  AS category_code,
  c.label AS category_label,
  l.zone,
  concat_ws(' • ', l.building, l.room) AS location,
  a.condition,
  a.team_id,
  a.last_service_at,
  a.note,
  a.archived,
  a.archived_at,
  a.created_at
FROM assets a
JOIN categories c ON c.id = a.category_id
JOIN locations  l ON l.id = a.location_id
WHERE a.archived = false
ORDER BY a.id;
```

### 7.12 Daftar aset diarsipkan

```sql
SELECT
  a.id,
  a.name,
  c.code  AS category_code,
  l.zone,
  concat_ws(' • ', l.building, l.room) AS location,
  a.condition,
  a.archived,
  a.archived_at
FROM assets a
JOIN categories c ON c.id = a.category_id
JOIN locations  l ON l.id = a.location_id
WHERE a.archived = true
ORDER BY a.archived_at DESC, a.id;
```

### 7.13 Tambah aset + catat `asset_history`

`$3` adalah `locations.id` hasil find-or-create (§6.4.2); `$4` adalah
`categories.id` dari kode kategori. ID `$1` berasal dari query §6.4.1.

```sql
WITH created AS (
  INSERT INTO assets (
    id, name, location_id, category_id, condition, team_id, note, archived
  )
  VALUES (
    $1, $2, $3, $4, $5, $6,
    COALESCE(NULLIF($7, ''), 'Tidak ada catatan.'),
    false
  )
  RETURNING id
), logged AS (
  INSERT INTO asset_history (asset_id, label, actor, note)
  SELECT id, 'Aset terdaftar', $8,
         'Aset baru ditambahkan ke inventaris Sarpras.'
  FROM created
)
SELECT * FROM created;
```

### 7.14 Edit aset + catat riwayat

Hanya aset aktif yang boleh diedit (`archived = false`).

```sql
WITH updated AS (
  UPDATE assets
  SET name        = $2,
      location_id = $3,
      category_id = $4,
      condition   = $5,
      team_id     = $6,
      note        = COALESCE(NULLIF($7, ''), 'Tidak ada catatan.')
  WHERE id = $1
    AND archived = false
  RETURNING id
), logged AS (
  INSERT INTO asset_history (asset_id, label, actor, note)
  SELECT id, 'Data aset diperbarui', $8, $9
  FROM updated
)
SELECT * FROM updated;
```

### 7.15 Arsipkan aset

Hanya aset aktif; `archived_at` wajib diisi bersamaan dengan `archived = true`.

```sql
WITH updated AS (
  UPDATE assets
  SET archived = true,
      archived_at = now()
  WHERE id = $1
    AND archived = false
  RETURNING id
), logged AS (
  INSERT INTO asset_history (asset_id, label, actor, note)
  SELECT id, 'Aset diarsipkan', $2,
         'Aset dikeluarkan dari daftar aktif tanpa menghapus riwayat.'
  FROM updated
)
SELECT * FROM updated;
```

### 7.16 Pulihkan aset

Hanya aset terarsip; `archived_at` wajib dikosongkan bersamaan dengan
`archived = false`.

```sql
WITH updated AS (
  UPDATE assets
  SET archived = false,
      archived_at = NULL
  WHERE id = $1
    AND archived = true
  RETURNING id
), logged AS (
  INSERT INTO asset_history (asset_id, label, actor, note)
  SELECT id, 'Aset dipulihkan', $2,
         'Aset dikembalikan ke daftar inventaris aktif.'
  FROM updated
)
SELECT * FROM updated;
```

### 7.17 Tandai selesai servis

Hanya aset aktif. Mengubah `condition`, `last_service_at`, `note`, dan mencatat
riwayat.

```sql
WITH updated AS (
  UPDATE assets
  SET condition       = 'good',
      last_service_at = now(),
      note            = 'Servis selesai dan aset dinyatakan kembali dalam kondisi baik.'
  WHERE id = $1
    AND archived = false
  RETURNING id
), logged AS (
  INSERT INTO asset_history (asset_id, label, actor, note)
  SELECT id, 'Servis selesai', $2,
         'Kondisi aset divalidasi dan dikembalikan ke status baik.'
  FROM updated
)
SELECT * FROM updated;
```

### 7.18 Hapus permanen aset

Syarat lengkap ada di §6.4.3. Query ini sudah memeriksa semua syarat; FK
`RESTRICT` tetap menjadi pengaman terakhir bila ada tiket yang lolos.

```sql
DELETE FROM assets a
WHERE a.id = $1
  AND a.archived = true
  AND a.last_service_at IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM tickets t WHERE t.asset_id = a.id
  )
RETURNING a.id;
```

Jika `DELETE` mengenai aset yang masih punya tiket (mis. backend melewati
pemeriksaan), PostgreSQL mengembalikan error `23503` pada constraint
`tickets_asset_id_fkey`.

---

## 8. Seed dan hasil verifikasi

### 8.1 Jumlah baris seed

| Tabel | Jumlah | Sumber frontend |
| --- | ---: | --- |
| `users` | 2 | 2 akun demo (mahasiswa + admin) |
| `teams` | 4 | `TEAMS` (4) |
| `technicians` | 15 | `seedTechnicians()` (15) |
| `categories` | 7 | `CATEGORY_META` (7) |
| `locations` | 21 | gabungan gedung form + zona aset + lokasi tiket |
| `assets` | 7 | `seedAssets()` (7) |
| `asset_history` | 11 | total `history` aset (11) |
| `tickets` | 12 | seluruh `report({...})` (12) |
| `ticket_assignments` | 11 | turunan `assignments`/`assignee` (2 + 2 + 7) |
| `ticket_history` | 30 | history tiket seed (3 tiket default × 1 + 9 tiket × 3) |
| `ticket_comments` | 5 | `notes` + `instructions` seed (2 + 2 + 1) |

### 8.2 Data yang tidak terbawa / berubah bentuk

- **NIM `217008812` (Nabila Putri)** pada tiket `#CC-2026-0871` tidak punya akun
  seed → `owner_id = NULL`; nama tetap di `reporter_name`.
- **Kategori `electrical`** tidak ada di form pengaduan, tetapi tetap dibuat
  karena ada di `CATEGORY_META`, aset, dan tiket seed.
- **Field UI-only** (`badge`, `chip`, `dot`, `pulse`, `accent`, `weight`) tidak
  disimpan.
- **`report.location`** berupa string gabungan → dinormalisasi ke
  `locations` + `location_detail`; view mengembalikan `location_label`.
- **`report.team`** dan **`report.assignee`** berupa nilai denormalisasi →
  dihitung dari `team_id` dan `ticket_assignments`.
- **`report.date`** berupa label terformat → diturunkan dari `created_at`.
- **ID instruksi** `INS-...` → `ticket_comments.id` numerik.
- **`readAt`** → `ticket_comments.read_at` (kolom ekstensi).
- **`assets.zone`** → `locations.zone`.
- **`assets.history`** → tabel `asset_history`.
- **`assets.lastServiceAt`** → `assets.last_service_at`.

### 8.3 Bukti import dan constraint

Diuji pada PostgreSQL 16.9:

1. `campuscare_full.sql` diimpor **dua kali** ke database kosong
   `campuscare_verify` memakai:
   ```bash
   psql -h 127.0.0.1 -p 55432 -U postgres -d campuscare_verify \
        -v ON_ERROR_STOP=1 -f db/campuscare_full.sql
   ```
   Keduanya selesai dengan exit code `0`.
2. Jumlah baris setelah import dua kali tetap sama dengan tabel 8.1
   (tidak ada duplikasi).
3. `ticket_code_seq` berada di `last_value = 915`, sehingga tiket baru
   berikutnya adalah `#CC-2026-0916`.
4. Constraint diuji dan **ditolak** sesuai harapan:
   - status `invalid` → `tickets_status_check`
   - PIC aktif kedua pada tiket yang sama →
     `uq_ticket_assignments_active_pic`
   - prioritas `Urgent` → `tickets_priority_check`
5. Trigger SLA diuji: tiket `Tinggi` mendapat `sla_due_at - created_at =
   02:00:00`; tiket `Rendah` mendapat `1 day`.
6. Trigger `updated_at` diuji pada `UPDATE` terpisah: `updated_at >
   created_at` bernilai `true`.
7. Soft delete diuji: setelah `deleted_by_student_at` diisi, query mahasiswa
   mengembalikan 2 tiket, sedangkan query admin tetap 3 tiket untuk pemilik
   yang sama.
8. Password demo diverifikasi dengan
   `password_hash = crypt('CampusCare#2026', password_hash)` → `true` untuk
   kedua akun.

### 8.4 Bukti revisi arsip aset

Diuji ulang pada PostgreSQL 18.6 (target tetap 14+):

1. `campuscare_full.sql` hasil regenerasi diimpor **dua kali** ke database
   kosong `campuscare_verify` dengan `psql -v ON_ERROR_STOP=1`; keduanya
   selesai tanpa error. Jumlah baris tetap: 4 tim, 15 teknisi, 7 kategori,
   21 lokasi, 7 aset (`asset_history` 11), 12 tiket, dan 2 pengguna. Kedua view
   (`v_ticket_summary`, `v_technician_workload`) tetap berjalan.
2. Database `campuscare_legacy` dibuat dari `campuscare_full.sql` **versi
   sebelum revisi**, lalu `migrations/001_asset_archive.sql` dijalankan **dua
   kali**. Keduanya selesai tanpa error dan jumlah baris seluruh tabel tidak
   berubah.
3. Constraint diuji:
   - `UPDATE assets SET archived = true` tanpa `archived_at` → ditolak
     `chk_assets_archived_at`.
   - `UPDATE assets SET archived = true, archived_at = now()` → berhasil.
   - `UPDATE assets SET archived = false, archived_at = now()` → ditolak
     `chk_assets_archived_at`.
   - `DELETE FROM assets` untuk `AST-AC-0312` (punya tiket) → ditolak
     `tickets_asset_id_fkey` dengan `ON DELETE RESTRICT` (SQLSTATE `23503`).
   - `DELETE FROM assets` untuk `AST-MJR-0210` (tanpa tiket) → `DELETE 1`, dan
     `asset_history` aset tersebut ikut terhapus (`CASCADE`).
4. Query pembuatan ID §6.4.1 dengan kategori `ac` mengembalikan
   `AST-AC-0313` setelah seed.
5. Query find-or-create §6.4.2 dijalankan dua kali dengan input `FT` dan
   `Gedung F • Lt. 2`: menghasilkan `locations.id` yang sama dan hanya satu
   baris. Input tanpa `•` juga hanya membuat satu baris dengan `room = NULL`.
6. Contoh query §7.13–§7.18 (tambah, edit, servis, arsip, pulihkan, hapus
   permanen + riwayat) dijalankan dan berhasil sesuai aturan.
7. `npm test` di `backend/` terhadap database `campuscare_test` hasil impor
   revisi: **42 tes lulus, 0 gagal**.

---

## 9. Asumsi

1. Database target PostgreSQL 14+; `pgcrypto` tersedia sebagai trusted
   extension. Tidak perlu superuser.
2. `now()` mengikuti timezone server. Semua timestamp memakai `timestamptz`.
3. Kode tiket memakai tahun saat insert (`to_char(now(), 'YYYY')`), bukan tahun
   `created_at` eksplisit.
4. `ticket_code_seq` mulai 916 agar tiket pertama baru menjadi
   `#CC-2026-0916` setelah seed `#CC-2026-0915`.
5. Soft delete hanya untuk mahasiswa. Admin tidak memfilter
   `deleted_by_student_at`.
6. CRUD kategori/lokasi sengaja dilewati. Tabel `categories` dan `locations`
   hanya data referensi; `DELETE` tetap ditolak FK bila baris masih dipakai.
   Lokasi baru dibuat otomatis lewat find-or-create saat menambah aset.
7. Teknisi yang sudah punya riwayat harus diarsipkan (`archived = true`), bukan
   dihapus.
8. `tickets.asset_id` opsional dan hanya diisi saat hubungan tiket–aset jelas.
   FK-nya `ON DELETE RESTRICT`: aset yang punya tiket tidak boleh dihapus
   permanen, cukup diarsipkan.
9. `ticket_comments.read_at` adalah ekstensi kecil di luar daftar kolom wajib,
   untuk memetakan `readAt` frontend.
10. `tickets.photo_url` hanya disiapkan; upload file/object storage bukan
    bagian dari tugas database ini.
11. `rejected` tersedia di CHECK tetapi belum dipakai UI.
12. Password demo `CampusCare#2026` **wajib diganti** sebelum rilis.
13. Backend saat ini hanya memiliki endpoint auth dan tiket; **endpoint aset
    belum ada**. Perubahan skema ini menyiapkan kontraknya agar endpoint aset
    dapat ditambahkan tanpa migrasi baru.
14. `db/reset.sh` bersifat destruktif (drop schema `public`) dan hanya untuk
    database development/demo.
15. Aset diarsipkan, bukan dihapus. Hapus permanen hanya untuk aset terarsip
    tanpa riwayat servis (`last_service_at IS NULL`) dan tanpa tiket terkait.
16. ID aset dibuat backend (bukan database) dan find-or-create lokasi dilakukan
    backend memakai ekspresi unik `(building, COALESCE(room, ''))`.
17. `.env.example` hanya berisi nilai contoh; tidak ada secret asli di file yang
    di-commit.
