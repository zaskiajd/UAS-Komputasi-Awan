-- ============================================================================
-- CampusCare — campuscare_full.sql
-- Gabungan schema.sql + seed.sql untuk import satu file di server.
--
-- Import:
--   psql -h <host> -U <user> -d campuscare -f db/campuscare_full.sql
--
-- File ini idempotent dan boleh dijalankan ulang.
-- ============================================================================

-- ============================================================================
-- CampusCare — Skema database PostgreSQL
-- Proyek : Pengaduan & Pemeliharaan Fasilitas Kampus UNSIL
-- Stack   : PostgreSQL 14+
--
-- File ini aman dijalankan berulang kali (idempotent):
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f db/schema.sql
--
-- Catatan desain:
--   * Semua nama tabel/kolom memakai snake_case.
--   * Status, prioritas, role, dan kondisi memakai TEXT + CHECK (bukan ENUM)
--     supaya mudah diubah tanpa migrasi tipe.
--   * teams.coordinator_id sengaja DEFERRABLE INITIALLY DEFERRED karena
--     berelasi melingkar dengan technicians.team_id.
-- ============================================================================

BEGIN;

-- Diperlukan oleh seed.sql untuk crypt()/gen_salt() (bcrypt kompatibel Node).
-- pgcrypto adalah trusted extension, jadi tidak wajib superuser.
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ----------------------------------------------------------------------------
-- 1. users
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS users (
  id            SERIAL PRIMARY KEY,
  nim           TEXT UNIQUE,
  name          TEXT NOT NULL,
  email         TEXT NOT NULL UNIQUE,
  password_hash TEXT,
  role          TEXT NOT NULL DEFAULT 'student'
                  CHECK (role IN ('student', 'admin')),
  faculty       TEXT,
  google_id     TEXT UNIQUE,
  auth_provider TEXT NOT NULL DEFAULT 'local'
                  CHECK (auth_provider IN ('local', 'google')),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT users_email_lowercase_chk CHECK (email = lower(email)),
  CONSTRAINT users_nim_format_chk
    CHECK (nim IS NULL OR nim ~ '^[0-9]{6,20}$'),
  CONSTRAINT users_auth_local_password_chk
    CHECK (auth_provider <> 'local' OR password_hash IS NOT NULL)
);

COMMENT ON COLUMN users.nim IS 'NIM mahasiswa; NULL untuk admin/tendik.';
COMMENT ON COLUMN users.password_hash IS 'Hash bcrypt (pgcrypto crypt/bf atau bcrypt Node); NULL untuk akun Google OAuth.';
COMMENT ON COLUMN users.google_id IS 'Subject ID unik Google OAuth (Google Identity Services).';
COMMENT ON COLUMN users.auth_provider IS 'Penyedia autentikasi: local (email + sandi) atau google (Google OAuth).';

-- ----------------------------------------------------------------------------
-- 2. teams
--    coordinator_id ditambahkan sebagai FK setelah tabel technicians dibuat.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS teams (
  id             TEXT PRIMARY KEY,
  name           TEXT NOT NULL,
  short_name     TEXT,
  icon           TEXT,
  zone           TEXT,
  coordinator_id TEXT
);

COMMENT ON COLUMN teams.coordinator_id IS
  'Koordinator tim; FK ke technicians(id), DEFERRABLE karena relasi melingkar.';

-- ----------------------------------------------------------------------------
-- 3. technicians
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS technicians (
  id         TEXT PRIMARY KEY,
  name       TEXT NOT NULL,
  title      TEXT,
  role       TEXT NOT NULL DEFAULT 'Teknisi'
               CHECK (role IN ('Koordinator', 'Teknisi')),
  team_id    TEXT REFERENCES teams(id) ON DELETE SET NULL,
  active     BOOLEAN NOT NULL DEFAULT true,
  archived   BOOLEAN NOT NULL DEFAULT false,
  phone      TEXT,
  skills     TEXT[] NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON COLUMN technicians.active   IS 'true = bertugas, false = standby.';
COMMENT ON COLUMN technicians.archived IS
  'true = diarsipkan; riwayat tiket tetap utuh dan tidak tampil di roster aktif.';

-- FK melingkar teams.coordinator_id -> technicians.id.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'teams_coordinator_id_fkey'
  ) THEN
    ALTER TABLE teams
      ADD CONSTRAINT teams_coordinator_id_fkey
      FOREIGN KEY (coordinator_id) REFERENCES technicians(id)
      ON DELETE SET NULL
      DEFERRABLE INITIALLY DEFERRED;
  END IF;
END
$$;

-- ----------------------------------------------------------------------------
-- 4. categories
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS categories (
  id              SERIAL PRIMARY KEY,
  code            TEXT NOT NULL UNIQUE,
  label           TEXT NOT NULL,
  icon            TEXT,
  default_team_id TEXT REFERENCES teams(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ----------------------------------------------------------------------------
-- 5. locations
--    Menggabungkan gedung formulir (A–F) dengan zona aset (FT, GKB, dst.).
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS locations (
  id         SERIAL PRIMARY KEY,
  zone       TEXT NOT NULL,
  building   TEXT NOT NULL,
  room       TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Unik secara literal; NULL room tidak dianggap duplikat oleh PostgreSQL.
  CONSTRAINT locations_building_room_key UNIQUE (building, room)
);

-- Versi NULL-safe dari unique(building, room) untuk PostgreSQL 14+.
-- Dengan ini hanya boleh ada satu baris "building + room NULL" per gedung.
CREATE UNIQUE INDEX IF NOT EXISTS uq_locations_building_room_norm
  ON locations (building, COALESCE(room, ''));

-- ----------------------------------------------------------------------------
-- 6. assets
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS assets (
  id              TEXT PRIMARY KEY,
  name            TEXT NOT NULL,
  location_id     INTEGER NOT NULL REFERENCES locations(id) ON DELETE RESTRICT,
  category_id     INTEGER NOT NULL REFERENCES categories(id) ON DELETE RESTRICT,
  condition       TEXT NOT NULL DEFAULT 'good'
                    CHECK (condition IN ('good', 'service', 'disrupted', 'broken')),
  team_id         TEXT REFERENCES teams(id) ON DELETE SET NULL,
  last_service_at TIMESTAMPTZ,
  note            TEXT,
  archived        BOOLEAN NOT NULL DEFAULT false,
  archived_at     TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Arsip dan waktu arsip harus konsisten: keduanya terisi atau keduanya kosong.
  CONSTRAINT chk_assets_archived_at CHECK (
    (archived AND archived_at IS NOT NULL) OR
    (NOT archived AND archived_at IS NULL)
  )
);

-- Untuk database lama yang tabel assets-nya sudah dibuat sebelum revisi ini.
ALTER TABLE assets ADD COLUMN IF NOT EXISTS archived BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE assets ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_assets_archived_at'
  ) THEN
    ALTER TABLE assets
      ADD CONSTRAINT chk_assets_archived_at CHECK (
        (archived AND archived_at IS NOT NULL) OR
        (NOT archived AND archived_at IS NULL)
      );
  END IF;
END
$$;

COMMENT ON COLUMN assets.archived IS
  'true = diarsipkan; tidak tampil di daftar aktif, riwayat tetap utuh.';
COMMENT ON COLUMN assets.archived_at IS
  'Waktu aset diarsipkan; NULL bila archived = false, wajib terisi bila archived = true.';

-- ----------------------------------------------------------------------------
-- 7. asset_history
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS asset_history (
  id       BIGSERIAL PRIMARY KEY,
  asset_id TEXT NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
  at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  label    TEXT NOT NULL,
  actor    TEXT,
  note     TEXT
);

-- ----------------------------------------------------------------------------
-- 8. tickets
-- ----------------------------------------------------------------------------
CREATE SEQUENCE IF NOT EXISTS ticket_code_seq START WITH 916 INCREMENT BY 1;

CREATE OR REPLACE FUNCTION generate_ticket_code()
RETURNS TEXT
LANGUAGE sql
VOLATILE
AS $$
  SELECT '#CC-' || to_char(now(), 'YYYY') || '-' ||
         lpad(nextval('ticket_code_seq')::text, 4, '0');
$$;

CREATE TABLE IF NOT EXISTS tickets (
  id                     SERIAL PRIMARY KEY,
  ticket_code            TEXT NOT NULL UNIQUE DEFAULT generate_ticket_code(),
  title                  TEXT NOT NULL,
  description            TEXT,
  reporter_name          TEXT NOT NULL,
  owner_id               INTEGER REFERENCES users(id) ON DELETE SET NULL,
  category_id            INTEGER NOT NULL REFERENCES categories(id) ON DELETE RESTRICT,
  location_id            INTEGER REFERENCES locations(id) ON DELETE SET NULL,
  location_detail        TEXT,
  asset_id               TEXT REFERENCES assets(id) ON DELETE RESTRICT,
  status                 TEXT NOT NULL DEFAULT 'review'
                           CHECK (status IN ('review', 'progress', 'waiting', 'done', 'rejected')),
  priority               TEXT NOT NULL DEFAULT 'Sedang'
                           CHECK (priority IN ('Tinggi', 'Sedang', 'Rendah')),
  urgent                 BOOLEAN NOT NULL DEFAULT false,
  progress               INTEGER NOT NULL DEFAULT 0
                           CHECK (progress BETWEEN 0 AND 100),
  team_id                TEXT REFERENCES teams(id) ON DELETE SET NULL,
  photo_url              TEXT,
  sla_due_at             TIMESTAMPTZ,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at           TIMESTAMPTZ,
  deleted_by_student_at  TIMESTAMPTZ,

  CONSTRAINT tickets_code_format_chk
    CHECK (ticket_code ~ '^#CC-[0-9]{4}-[0-9]{4,}$')
);

-- Aset yang masih dirujuk tiket tidak boleh dihapus permanen. RESTRICT menjaga
-- integritas relasi; aset cukup diarsipkan (archived = true).
ALTER TABLE tickets DROP CONSTRAINT IF EXISTS tickets_asset_id_fkey;
ALTER TABLE tickets
  ADD CONSTRAINT tickets_asset_id_fkey
  FOREIGN KEY (asset_id) REFERENCES assets(id) ON DELETE RESTRICT;

COMMENT ON COLUMN tickets.deleted_by_student_at IS
  'Soft delete dari fitur "hapus riwayat" mahasiswa. NULL = masih tampil bagi mahasiswa.';
COMMENT ON COLUMN tickets.photo_url IS
  'URL object storage untuk fitur unggah foto (belum diimplementasikan di frontend).';

-- Trigger:
--   1) updated_at selalu diisi now() saat UPDATE.
--   2) sla_due_at dihitung dari priority bila masih NULL
--      (Tinggi 2 jam, Sedang 6 jam, Rendah 24 jam) berdasarkan created_at.
CREATE OR REPLACE FUNCTION tickets_before_write()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.sla_due_at IS NULL THEN
    NEW.sla_due_at := COALESCE(NEW.created_at, now()) +
      CASE NEW.priority
        WHEN 'Tinggi' THEN INTERVAL '2 hours'
        WHEN 'Sedang' THEN INTERVAL '6 hours'
        WHEN 'Rendah' THEN INTERVAL '24 hours'
        ELSE INTERVAL '6 hours'
      END;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    NEW.updated_at := now();
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_tickets_before_write ON tickets;
CREATE TRIGGER trg_tickets_before_write
  BEFORE INSERT OR UPDATE ON tickets
  FOR EACH ROW
  EXECUTE FUNCTION tickets_before_write();

-- ----------------------------------------------------------------------------
-- 9. ticket_assignments
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS ticket_assignments (
  id            BIGSERIAL PRIMARY KEY,
  ticket_id     INTEGER NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
  technician_id TEXT NOT NULL REFERENCES technicians(id) ON DELETE RESTRICT,
  role          TEXT NOT NULL CHECK (role IN ('PIC', 'Pendukung')),
  status        TEXT NOT NULL DEFAULT 'active'
                  CHECK (status IN ('active', 'replaced', 'removed', 'done')),
  assigned_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  assigned_by   INTEGER REFERENCES users(id) ON DELETE SET NULL
);

-- Maksimal satu PIC berstatus active per tiket.
CREATE UNIQUE INDEX IF NOT EXISTS uq_ticket_assignments_active_pic
  ON ticket_assignments (ticket_id)
  WHERE role = 'PIC' AND status = 'active';

-- Seorang teknisi tidak boleh punya dua penugasan active pada tiket yang sama.
CREATE UNIQUE INDEX IF NOT EXISTS uq_ticket_assignments_active_tech
  ON ticket_assignments (ticket_id, technician_id)
  WHERE status = 'active';

-- ----------------------------------------------------------------------------
-- 10. ticket_history (audit log + timeline)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS ticket_history (
  id        BIGSERIAL PRIMARY KEY,
  ticket_id INTEGER NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
  at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  label     TEXT NOT NULL,
  actor     TEXT,
  status    TEXT CHECK (
              status IS NULL OR
              status IN ('review', 'progress', 'waiting', 'done', 'rejected')
            ),
  note      TEXT
);

-- ----------------------------------------------------------------------------
-- 11. ticket_comments
--     kind='instruction' -> instruksi terarah admin ke teknisi
--     kind='note'        -> catatan operasional
--     kind='response'    -> tanggapan yang boleh dilihat mahasiswa (is_public)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS ticket_comments (
  id                    BIGSERIAL PRIMARY KEY,
  ticket_id             INTEGER NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
  kind                  TEXT NOT NULL
                          CHECK (kind IN ('response', 'note', 'instruction')),
  author_id             INTEGER REFERENCES users(id) ON DELETE SET NULL,
  author_name           TEXT,
  target_technician_id  TEXT REFERENCES technicians(id) ON DELETE SET NULL,
  body                  TEXT NOT NULL,
  is_public             BOOLEAN NOT NULL DEFAULT false,
  -- Ekstensi kecil untuk memetakan field `readAt` pada instruksi frontend.
  read_at               TIMESTAMPTZ,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ----------------------------------------------------------------------------
-- Indexes
-- ----------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_tickets_owner_id        ON tickets (owner_id);
CREATE INDEX IF NOT EXISTS idx_tickets_status          ON tickets (status);
CREATE INDEX IF NOT EXISTS idx_tickets_category_id     ON tickets (category_id);
CREATE INDEX IF NOT EXISTS idx_tickets_created_at_desc ON tickets (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_tickets_team_id         ON tickets (team_id);
CREATE INDEX IF NOT EXISTS idx_tickets_sla_due_at      ON tickets (sla_due_at);
CREATE INDEX IF NOT EXISTS idx_tickets_student_visible
  ON tickets (owner_id, created_at DESC)
  WHERE deleted_by_student_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_ticket_assignments_ticket     ON ticket_assignments (ticket_id);
CREATE INDEX IF NOT EXISTS idx_ticket_assignments_technician ON ticket_assignments (technician_id);
CREATE INDEX IF NOT EXISTS idx_ticket_history_ticket         ON ticket_history (ticket_id, at DESC);
CREATE INDEX IF NOT EXISTS idx_ticket_comments_ticket        ON ticket_comments (ticket_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_technicians_team_id           ON technicians (team_id);
CREATE INDEX IF NOT EXISTS idx_assets_category_id            ON assets (category_id);
CREATE INDEX IF NOT EXISTS idx_assets_location_id            ON assets (location_id);
CREATE INDEX IF NOT EXISTS idx_assets_archived               ON assets (archived);
CREATE INDEX IF NOT EXISTS idx_asset_history_asset           ON asset_history (asset_id, at DESC);

-- ----------------------------------------------------------------------------
-- Views
-- DROP + CREATE (bukan hanya REPLACE) agar perubahan daftar kolom view tetap
-- aman saat schema.sql dijalankan ulang.
-- ----------------------------------------------------------------------------
DROP VIEW IF EXISTS v_ticket_summary;
DROP VIEW IF EXISTS v_technician_workload;

CREATE OR REPLACE VIEW v_ticket_summary AS
SELECT
  t.id,
  t.ticket_code,
  t.title,
  t.description,
  t.reporter_name,
  t.owner_id,
  u.nim  AS owner_nim,
  u.name AS owner_name,
  t.category_id,
  c.code  AS category_code,
  c.label AS category_label,
  c.icon  AS category_icon,
  t.location_id,
  l.zone     AS location_zone,
  l.building AS location_building,
  l.room     AS location_room,
  t.location_detail,
  COALESCE(
    NULLIF(concat_ws(' • ', l.building,
                     COALESCE(NULLIF(t.location_detail, ''), l.room)), ''),
    NULLIF(t.location_detail, ''),
    l.building,
    'Lokasi belum ditentukan'
  ) AS location_label,
  t.asset_id,
  t.status,
  t.priority,
  t.urgent,
  t.progress,
  t.team_id,
  tm.name       AS team_name,
  tm.short_name AS team_short_name,
  pic.technician_id AS pic_technician_id,
  pic.name          AS pic_name,
  pic.title         AS pic_title,
  pic.status        AS pic_assignment_status,
  t.photo_url,
  t.sla_due_at,
  t.created_at,
  t.updated_at,
  t.completed_at,
  t.deleted_by_student_at,
  (
    t.status NOT IN ('done', 'rejected')
    AND t.sla_due_at IS NOT NULL
    AND t.sla_due_at < now()
  ) AS is_overdue
FROM tickets t
JOIN categories c ON c.id = t.category_id
LEFT JOIN users u ON u.id = t.owner_id
LEFT JOIN locations l ON l.id = t.location_id
LEFT JOIN teams tm ON tm.id = t.team_id
LEFT JOIN LATERAL (
  SELECT ta.technician_id, tech.name, tech.title, ta.status
  FROM ticket_assignments ta
  JOIN technicians tech ON tech.id = ta.technician_id
  WHERE ta.ticket_id = t.id
    AND ta.role = 'PIC'
    AND ta.status IN ('active', 'done')
  ORDER BY
    CASE ta.status WHEN 'active' THEN 0 ELSE 1 END,
    ta.assigned_at DESC,
    ta.id DESC
  LIMIT 1
) pic ON true;

CREATE OR REPLACE VIEW v_technician_workload AS
SELECT
  tech.id     AS technician_id,
  tech.name,
  tech.title,
  tech.role,
  tech.team_id,
  tm.name       AS team_name,
  tm.short_name AS team_short_name,
  tech.active,
  tech.archived,
  tech.phone,
  tech.skills,
  COUNT(DISTINCT ta.ticket_id) FILTER (
    WHERE t.status NOT IN ('done', 'rejected')
  ) AS active_ticket_count,
  COUNT(DISTINCT ta.ticket_id) FILTER (
    WHERE t.status = 'done'
  ) AS done_ticket_count,
  COUNT(DISTINCT ta.ticket_id) AS total_ticket_count
FROM technicians tech
LEFT JOIN teams tm ON tm.id = tech.team_id
LEFT JOIN ticket_assignments ta
  ON ta.technician_id = tech.id
 AND ta.status IN ('active', 'done')
LEFT JOIN tickets t ON t.id = ta.ticket_id
GROUP BY
  tech.id, tech.name, tech.title, tech.role, tech.team_id,
  tm.name, tm.short_name, tech.active, tech.archived, tech.phone, tech.skills;

COMMIT;

-- ============================================================================
-- CampusCare — Seed data
-- Sumber data: js/data/reports.js, js/data/technicians.js,
--              js/data/assets.js, js/data/assignments.js,
--              js/features/complaint.js, views/auth.html
--
-- Jalankan setelah schema.sql:
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f db/seed.sql
--
-- Sifat: idempotent, satu transaksi, PostgreSQL 14+.
--
-- PERINGATAN KEAMANAN:
--   Dua akun di bawah adalah akun DEMO. Password harus diganti sebelum rilis.
--   Password demo: CampusCare#2026
--   Hash dibuat dengan pgcrypto crypt(..., gen_salt('bf')) sehingga kompatibel
--   dengan bcrypt di Node.js.
-- ============================================================================

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ----------------------------------------------------------------------------
-- Akun demo
-- ----------------------------------------------------------------------------
INSERT INTO users (nim, name, email, password_hash, role, faculty)
VALUES
  (
    '217006120',
    'Ahmad Rizki',
    '217006120@student.unsil.ac.id',
    crypt('CampusCare#2026', gen_salt('bf')),
    'student',
    'Teknik Informatika'
  ),
  (
    NULL,
    'Ir. Hendrawan',
    'hendrawan@unsil.ac.id',
    crypt('CampusCare#2026', gen_salt('bf')),
    'admin',
    'Biro Sarana & Prasarana'
  )
ON CONFLICT (email) DO UPDATE SET
  nim           = EXCLUDED.nim,
  name          = EXCLUDED.name,
  role          = EXCLUDED.role,
  faculty       = EXCLUDED.faculty,
  password_hash = EXCLUDED.password_hash;

-- ----------------------------------------------------------------------------
-- Tim (4)
-- coordinator_id diisi setelah teknisi masuk karena FK melingkar.
-- ----------------------------------------------------------------------------
INSERT INTO teams (id, name, short_name, icon, zone, coordinator_id)
VALUES
  ('electrical', 'Tim Kelistrikan & Tata Udara', 'Kelistrikan & AC', 'hvac',   'Rektorat • FT • GKB', NULL),
  ('av',         'Tim Multimedia & AV',          'Multimedia & AV',  'videocam', 'GKB • Perpustakaan',  NULL),
  ('civil',      'Tim Sanitasi & Sipil',          'Sanitasi & Sipil', 'plumbing', 'Rektorat • GOR • Taman', NULL),
  ('network',    'Tim Jaringan & IT',             'Jaringan & IT',    'router',   'Seluruh kampus',      NULL)
ON CONFLICT (id) DO UPDATE SET
  name       = EXCLUDED.name,
  short_name = EXCLUDED.short_name,
  icon       = EXCLUDED.icon,
  zone       = EXCLUDED.zone;

-- ----------------------------------------------------------------------------
-- Teknisi (15)
-- ----------------------------------------------------------------------------
INSERT INTO technicians (id, name, title, role, team_id, active, archived, phone, skills)
VALUES
  ('hendra', 'Hendra', 'Pak Hendra', 'Koordinator', 'electrical', true,  false, '+62 812-1100-001', ARRAY['AC', 'Panel listrik', 'Genset']),
  ('rian',   'Rian',   'Rian',       'Teknisi',     'electrical', true,  false, '+62 812-1100-002', ARRAY['AC split', 'Kelistrikan']),
  ('agus',   'Agus',   'Agus',       'Teknisi',     'electrical', true,  false, '+62 812-1100-003', ARRAY['Lampu', 'Instalasi daya']),
  ('dedi',   'Dedi',   'Dedi',       'Teknisi',     'electrical', true,  false, '+62 812-1100-004', ARRAY['AC sentral', 'Cold storage']),
  ('wawan',  'Wawan',  'Wawan',      'Teknisi',     'electrical', false, false, '+62 812-1100-005', ARRAY['Kelistrikan', 'Genset']),

  ('yudi',   'Yudi',   'Pak Yudi',   'Koordinator', 'av',         true,  false, '+62 812-2200-001', ARRAY['Proyektor', 'Sound system']),
  ('fajar',  'Fajar',  'Fajar',      'Teknisi',     'av',         true,  false, '+62 812-2200-002', ARRAY['Proyektor', 'Kabel HDMI']),
  ('gilang', 'Gilang', 'Gilang',     'Teknisi',     'av',         false, false, '+62 812-2200-003', ARRAY['Audio', 'Live streaming']),

  ('dadi',   'Dadi',   'Pak Dadi',   'Koordinator', 'civil',      true,  false, '+62 812-3300-001', ARRAY['Sipil', 'Sanitasi']),
  ('nanang', 'Nanang', 'Pak Nanang', 'Teknisi',     'civil',      true,  false, '+62 812-3300-002', ARRAY['Lift', 'Struktur']),
  ('iwan',   'Iwan',   'Pak Iwan',   'Teknisi',     'civil',      true,  false, '+62 812-3300-003', ARRAY['Meubel', 'Kayu']),
  ('asep',   'Asep',   'Asep',       'Teknisi',     'civil',      false, false, '+62 812-3300-004', ARRAY['Drainase', 'Batu']),

  ('rina',   'Rina',   'Bu Rina',    'Koordinator', 'network',    true,  false, '+62 812-4400-001', ARRAY['Jaringan', 'Wi-Fi']),
  ('bayu',   'Bayu',   'Bayu',       'Teknisi',     'network',    true,  false, '+62 812-4400-002', ARRAY['Access point', 'Fiber optik']),
  ('tegar',  'Tegar',  'Tegar',      'Teknisi',     'network',    true,  false, '+62 812-4400-003', ARRAY['Router', 'Kabel LAN'])
ON CONFLICT (id) DO UPDATE SET
  name     = EXCLUDED.name,
  title    = EXCLUDED.title,
  role     = EXCLUDED.role,
  team_id  = EXCLUDED.team_id,
  active   = EXCLUDED.active,
  archived = EXCLUDED.archived,
  phone    = EXCLUDED.phone,
  skills   = EXCLUDED.skills;

UPDATE teams SET coordinator_id = 'hendra' WHERE id = 'electrical';
UPDATE teams SET coordinator_id = 'yudi'   WHERE id = 'av';
UPDATE teams SET coordinator_id = 'dadi'   WHERE id = 'civil';
UPDATE teams SET coordinator_id = 'rina'   WHERE id = 'network';

-- ----------------------------------------------------------------------------
-- Kategori (7) — sumber: CATEGORY_META
-- default_team_id mengikuti pemetaan TEAM_FOR_CATEGORY di features/dispatch.js.
-- ----------------------------------------------------------------------------
INSERT INTO categories (code, label, icon, default_team_id)
VALUES
  ('ac',         'Kelistrikan & AC',      'mode_fan',     'electrical'),
  ('projector',  'Proyektor & Audio',     'videocam_off', 'av'),
  ('network',    'Jaringan Wi-Fi',        'wifi_off',     'network'),
  ('sanitation', 'Sanitasi & Sipil',      'plumbing',     'civil'),
  ('furniture',  'Meubel & Ruang Kuliah', 'chair',        'civil'),
  ('lift',       'Lift & Akses Gedung',   'elevator',     'civil'),
  ('electrical', 'Kelistrikan',           'lightbulb',    'electrical')
ON CONFLICT (code) DO UPDATE SET
  label           = EXCLUDED.label,
  icon            = EXCLUDED.icon,
  default_team_id = EXCLUDED.default_team_id;

-- ----------------------------------------------------------------------------
-- Lokasi
-- Menggabungkan:
--   * gedung formulir pengaduan: Gedung A–F
--   * zona seed aset: FT, GKB, Perpustakaan, Rektorat, GOR
--   * lokasi tambahan yang muncul di tiket seed: Aula Serbaguna, GKB, GOR
-- room NULL = lokasi level gedung; room terisi = ruang/lantai spesifik.
-- ----------------------------------------------------------------------------
INSERT INTO locations (zone, building, room)
VALUES
  ('Rektorat',     'Gedung A (Rektorat)',                 NULL),
  ('Rektorat',     'Gedung A (Rektorat)',                 'Lt. 1'),
  ('Rektorat',     'Gedung A (Rektorat)',                 'Lift Utama'),
  ('Rektorat',     'Aula Serbaguna',                      'Lt. 1'),

  ('FT',           'Gedung B (Teknik Sipil)',             NULL),
  ('FT',           'Gedung B (Teknik Sipil)',             'Lift Penumpang'),
  ('FIK',          'Gedung C (Fakultas Ilmu Komputer)',   NULL),
  ('FT',           'Gedung E (Laboratorium Bersama)',     NULL),
  ('FT',           'Gedung F (Fakultas Teknik)',          NULL),
  ('FT',           'Gedung F (Fakultas Teknik)',          'Lt. 2'),
  ('FT',           'Gedung F (Fakultas Teknik)',          'R.301'),
  ('FT',           'Gedung F (Fakultas Teknik)',          'Lab Komputer 3 (Lt. 2)'),
  ('FT',           'Gedung F (Fakultas Teknik)',          'Lab Basis Data'),
  ('FT',           'Gedung F (Fakultas Teknik)',          'Koridor Lt. 1'),

  ('GKB',          'GKB (Gedung Kuliah Bersama)',         NULL),
  ('GKB',          'GKB (Gedung Kuliah Bersama)',         'R.204'),

  ('Perpustakaan', 'Gedung D (Perpustakaan Pusat)',       NULL),
  ('Perpustakaan', 'Gedung D (Perpustakaan Pusat)',       'Lt. 1'),
  ('Perpustakaan', 'Gedung D (Perpustakaan Pusat)',       'Lt. 2'),

  ('GOR',          'Gelanggang Olahraga',                 NULL),
  ('GOR',          'Gelanggang Olahraga',                 'Lapangan Basket')
ON CONFLICT DO NOTHING;

-- ----------------------------------------------------------------------------
-- Aset (7) + riwayat
-- ----------------------------------------------------------------------------
INSERT INTO assets (id, name, location_id, category_id, condition, team_id, last_service_at, note, archived, archived_at)
VALUES
  (
    'AST-AC-0312',
    'AC Split 2 PK — Lab Komputer 3',
    (SELECT id FROM locations WHERE building = 'Gedung F (Fakultas Teknik)' AND room = 'Lt. 2'),
    (SELECT id FROM categories WHERE code = 'ac'),
    'service', 'electrical', now() - INTERVAL '26 days',
    'Drainase kondensat tersumbat dan unit mengeluarkan tetesan air.',
    false, NULL
  ),
  (
    'AST-PRJ-0087',
    'Proyektor Laser 5000 Lumens',
    (SELECT id FROM locations WHERE building = 'GKB (Gedung Kuliah Bersama)' AND room = 'R.204'),
    (SELECT id FROM categories WHERE code = 'projector'),
    'broken', 'av', now() - INTERVAL '66 days',
    'Lampu indikator mati total, ballast terindikasi lemah.',
    false, NULL
  ),
  (
    'AST-WIFI-0145',
    'Access Point Wi-Fi 6',
    (SELECT id FROM locations WHERE building = 'Gedung D (Perpustakaan Pusat)' AND room = 'Lt. 2'),
    (SELECT id FROM categories WHERE code = 'network'),
    'disrupted', 'network', now() - INTERVAL '20 days',
    'Koneksi terputus berkala, perlu audit jalur uplink.',
    false, NULL
  ),
  (
    'AST-LFT-0004',
    'Lift Penumpang 8 Orang',
    (SELECT id FROM locations WHERE building = 'Gedung A (Rektorat)' AND room IS NULL),
    (SELECT id FROM categories WHERE code = 'lift'),
    'good', 'civil', now() - INTERVAL '10 days',
    'Inspeksi bulanan selesai, seluruh sensor berfungsi normal.',
    false, NULL
  ),
  (
    'AST-MJR-0210',
    'Meja Dosen Ergonomis',
    (SELECT id FROM locations WHERE building = 'Gedung F (Fakultas Teknik)' AND room = 'R.301'),
    (SELECT id FROM categories WHERE code = 'furniture'),
    'good', 'civil', now() - INTERVAL '33 days',
    'Kondisi stabil, tidak ada keluhan aktif.',
    false, NULL
  ),
  (
    'AST-SAN-0063',
    'Pintu Geser Otomatis Toilet',
    (SELECT id FROM locations WHERE building = 'Gedung A (Rektorat)' AND room = 'Lt. 1'),
    (SELECT id FROM categories WHERE code = 'sanitation'),
    'service', 'civil', now() - INTERVAL '47 days',
    'Engsel pengganti masih dalam pengiriman vendor.',
    false, NULL
  ),
  (
    'AST-LMP-0455',
    'Lampu Sorot LED 200W',
    (SELECT id FROM locations WHERE building = 'Gelanggang Olahraga' AND room IS NULL),
    (SELECT id FROM categories WHERE code = 'electrical'),
    'good', 'electrical', now() - INTERVAL '3 days',
    'Penggantian lampu selesai dan lolos uji nyala.',
    false, NULL
  )
ON CONFLICT (id) DO UPDATE SET
  name            = EXCLUDED.name,
  location_id     = EXCLUDED.location_id,
  category_id     = EXCLUDED.category_id,
  condition       = EXCLUDED.condition,
  team_id         = EXCLUDED.team_id,
  last_service_at = EXCLUDED.last_service_at,
  note            = EXCLUDED.note,
  archived        = EXCLUDED.archived,
  archived_at     = EXCLUDED.archived_at;

WITH seed_asset_history (asset_id, days_ago, label, actor, note) AS (
  VALUES
    ('AST-AC-0312',   26, 'Servis rutin',        'Rian',         'Pembersihan filter dan pengecekan freon.'),
    ('AST-AC-0312',    2, 'Laporan gangguan',    'Ahmad Rizki',  'Air menetes di atas meja komputer.'),
    ('AST-PRJ-0087',  66, 'Servis terakhir',     'Yudi',         'Pembersihan lensa dan pengecekan kipas.'),
    ('AST-PRJ-0087',   1, 'Laporan gangguan',    'Ahmad Rizki',  'Proyektor tidak menyala saat mata kuliah pagi.'),
    ('AST-WIFI-0145', 20, 'Servis terakhir',     'Bayu',         'Restart perangkat dan pembaruan firmware.'),
    ('AST-WIFI-0145',  0, 'Laporan gangguan',    'Nabila Putri', 'Wi-Fi terputus setiap beberapa menit.'),
    ('AST-LFT-0004',  10, 'Inspeksi bulanan',    'Nanang',       'Uji pintu, sensor beban, dan rem darurat.'),
    ('AST-MJR-0210',  33, 'Pemeriksaan meubel',  'Iwan',         'Pengencangan baut dan pelumasan rel laci.'),
    ('AST-SAN-0063',  47, 'Servis terakhir',     'Dadi',         'Penyetelan rel pintu geser.'),
    ('AST-SAN-0063',   1, 'Menunggu suku cadang','Dadi',         'Engsel tipe geser dipesan ke vendor.'),
    ('AST-LMP-0455',   3, 'Penggantian lampu',   'Agus',         'Lampu LED 200W diganti dan diuji 30 menit.')
)
INSERT INTO asset_history (asset_id, at, label, actor, note)
SELECT
  sah.asset_id,
  now() - make_interval(days => sah.days_ago),
  sah.label,
  sah.actor,
  sah.note
FROM seed_asset_history sah
WHERE NOT EXISTS (
  SELECT 1
  FROM asset_history ah
  WHERE ah.asset_id = sah.asset_id
    AND ah.label = sah.label
    AND ah.actor IS NOT DISTINCT FROM sah.actor
    AND ah.note IS NOT DISTINCT FROM sah.note
);

-- ----------------------------------------------------------------------------
-- Tiket (12) — seluruh objek report({...}) pada js/data/reports.js
--
-- owner_id di-resolve dari NIM. Tiket #CC-2026-0871 memiliki owner NIM
-- 217008812 (Nabila Putri) yang tidak punya akun seed, sehingga owner_id NULL
-- dan identitas tetap tersimpan di reporter_name.
-- sla_due_at sengaja tidak diisi agar trigger menghitung dari priority.
-- ----------------------------------------------------------------------------
WITH seed_tickets (
  ticket_code, title, description, reporter_name, owner_nim,
  category_code, zone, building, room, location_detail, asset_id,
  status, priority, urgent, progress, team_id,
  created_at, updated_at, completed_at
) AS (
  VALUES
    (
      '#CC-2026-0915',
      'Lift Rektorat Macet dengan Penumpang di Lt. 2',
      'Lift berhenti mendadak di lantai 2 dan pintu tidak terbuka. Dua orang sempat terjebak sebelum petugas datang.',
      'Rina Kartika (Tendik BAKPK)', NULL,
      'lift', 'Rektorat', 'Gedung A (Rektorat)', 'Lift Utama', 'Lift Utama', 'AST-LFT-0004',
      'review', 'Tinggi', true, 0, NULL,
      now() - INTERVAL '12 minutes', now() - INTERVAL '12 minutes', NULL
    ),
    (
      '#CC-2026-0912',
      'AC Bocor & Air Menetes di Lab Komputer 3 Gedung F',
      'Air dari unit AC menetes tepat di atas meja komputer sehingga praktikum harus dipindahkan. Bau apek juga muncul di ruangan.',
      'Ahmad Rizki (Mhs • 217006120)', '217006120',
      'ac', 'FT', 'Gedung F (Fakultas Teknik)', 'Lab Komputer 3 (Lt. 2)', 'Lab Komp 3 (Lt. 2)', 'AST-AC-0312',
      'review', 'Tinggi', true, 0, NULL,
      now() - INTERVAL '18 minutes', now() - INTERVAL '18 minutes', NULL
    ),
    (
      '#CC-2026-0885',
      'Lampu Sorot Lapangan Basket Sarpras Olahraga Putus',
      'Satu unit lampu sorot padam sehingga sebagian lapangan gelap saat latihan malam. Penggantian sudah selesai dan diuji.',
      'BEM Mahasiswa (Ormawa)', NULL,
      'electrical', 'GOR', 'Gelanggang Olahraga', 'Lapangan Basket', 'Lapangan Basket', 'AST-LMP-0455',
      'done', 'Rendah', false, 100, 'electrical',
      now() - INTERVAL '4320 minutes', now() - INTERVAL '2880 minutes', now() - INTERVAL '2880 minutes'
    ),
    (
      '#CC-2026-0871',
      'Wi-Fi Perpustakaan Lt. 2 Sering Terputus',
      'Koneksi terputus setiap beberapa menit di area meja baca lantai 2. Perangkat terhubung ke SSID kampus tetapi tidak ada internet.',
      'Nabila Putri (Mhs • 217008812)', '217008812',
      'network', 'Perpustakaan', 'Gedung D (Perpustakaan Pusat)', 'Lt. 2', 'Lt. 2', 'AST-WIFI-0145',
      'review', 'Sedang', false, 0, NULL,
      now() - INTERVAL '40 minutes', now() - INTERVAL '40 minutes', NULL
    ),
    (
      '#CC-2026-0864',
      'Kursi Kuliah R.301 Banyak yang Patah',
      'Lima kursi kuliah memiliki rangka patah dan sandaran longgar. Penggantian kursi sudah dilakukan sebelum ujian tengah semester.',
      'Ahmad Rizki (Mhs • 217006120)', '217006120',
      'furniture', 'FT', 'Gedung F (Fakultas Teknik)', 'R.301', 'R.301', NULL,
      'done', 'Sedang', false, 100, 'civil',
      now() - INTERVAL '7200 minutes', now() - INTERVAL '5760 minutes', now() - INTERVAL '5760 minutes'
    ),
    (
      '#CC-2026-0845',
      'Perbaikan Lift Gedung B Setelah Pemadaman',
      'Lift berhenti di lantai dasar setelah pemadaman listrik. Reset panel dan pemeriksaan darurat sudah dilakukan.',
      'Satpam Gedung B', NULL,
      'lift', 'FT', 'Gedung B (Teknik Sipil)', 'Lift Penumpang', 'Lift Penumpang', NULL,
      'done', 'Tinggi', false, 100, 'civil',
      now() - INTERVAL '43200 minutes', now() - INTERVAL '43110 minutes', now() - INTERVAL '43110 minutes'
    ),
    (
      '#CC-2026-0812',
      'Proyektor Aula Serbaguna Bergaris',
      'Gambar proyektor bergaris saat presentasi. Kabel HDMI diganti dan unit dibersihkan.',
      'Bagian Akademik', NULL,
      'projector', 'Rektorat', 'Aula Serbaguna', 'Lt. 1', 'Lt. 1', NULL,
      'done', 'Sedang', false, 100, 'av',
      now() - INTERVAL '86400 minutes', now() - INTERVAL '86280 minutes', now() - INTERVAL '86280 minutes'
    ),
    (
      '#CC-2026-0788',
      'Saluran Air Hujan Tersumbat di Koridor FT',
      'Air menggenang di koridor saat hujan. Saluran dibersihkan dan penutup drainase diperbaiki.',
      'Cleaning Service FT', NULL,
      'sanitation', 'FT', 'Gedung F (Fakultas Teknik)', 'Koridor Lt. 1', 'Koridor Lt. 1', NULL,
      'done', 'Sedang', false, 100, 'civil',
      now() - INTERVAL '129600 minutes', now() - INTERVAL '129300 minutes', now() - INTERVAL '129300 minutes'
    ),
    (
      '#CC-2026-0742',
      'Access Point Perpustakaan Lt. 1 Mati',
      'Access point mati total sehingga area lobi perpustakaan tidak mendapat Wi-Fi. Adaptor daya diganti.',
      'Pustakawan Shift Pagi', NULL,
      'network', 'Perpustakaan', 'Gedung D (Perpustakaan Pusat)', 'Lt. 1', 'Lt. 1', NULL,
      'done', 'Sedang', false, 100, 'network',
      now() - INTERVAL '172800 minutes', now() - INTERVAL '172740 minutes', now() - INTERVAL '172740 minutes'
    ),
    (
      '#CC-2026-0701',
      'Panel Listrik Lab Basis Data Sering Trip',
      'MCB panel lab sering trip saat komputer digunakan bersamaan. Beban dibagi ulang dan MCB diganti.',
      'Dosen Lab Basis Data', NULL,
      'electrical', 'FT', 'Gedung F (Fakultas Teknik)', 'Lab Basis Data', 'Lab Basis Data', NULL,
      'done', 'Tinggi', true, 100, 'electrical',
      now() - INTERVAL '216000 minutes', now() - INTERVAL '215820 minutes', now() - INTERVAL '215820 minutes'
    )
)
INSERT INTO tickets (
  ticket_code, title, description, reporter_name, owner_id,
  category_id, location_id, location_detail, asset_id,
  status, priority, urgent, progress, team_id,
  created_at, updated_at, completed_at
)
SELECT
  st.ticket_code,
  st.title,
  st.description,
  st.reporter_name,
  u.id,
  c.id,
  l.id,
  st.location_detail,
  st.asset_id,
  st.status,
  st.priority,
  st.urgent,
  st.progress,
  st.team_id,
  st.created_at,
  st.updated_at,
  st.completed_at
FROM seed_tickets st
JOIN categories c ON c.code = st.category_code
LEFT JOIN users u ON u.nim = st.owner_nim
LEFT JOIN locations l
  ON l.zone = st.zone
 AND l.building = st.building
 AND l.room IS NOT DISTINCT FROM st.room
ON CONFLICT (ticket_code) DO NOTHING;

-- ----------------------------------------------------------------------------
-- Penugasan (11 baris; PIC + pendukung)
-- ----------------------------------------------------------------------------
WITH seed_assignments (ticket_code, technician_id, role, status, assigned_minutes_ago) AS (
  VALUES
    ('#CC-2026-0885', 'agus',   'PIC',       'done',   2880),
    ('#CC-2026-0864', 'iwan',   'PIC',       'done',   5760),
    ('#CC-2026-0845', 'nanang', 'PIC',       'done',   43110),
    ('#CC-2026-0812', 'yudi',   'PIC',       'done',   86280),
    ('#CC-2026-0788', 'asep',   'PIC',       'done',   129300),
    ('#CC-2026-0742', 'bayu',   'PIC',       'done',   172740),
    ('#CC-2026-0701', 'hendra', 'PIC',       'done',   215820)
)
INSERT INTO ticket_assignments (
  ticket_id, technician_id, role, status, assigned_at, assigned_by
)
SELECT
  t.id,
  sa.technician_id,
  sa.role,
  sa.status,
  now() - make_interval(mins => sa.assigned_minutes_ago),
  (SELECT id FROM users WHERE email = 'hendrawan@unsil.ac.id')
FROM seed_assignments sa
JOIN tickets t ON t.ticket_code = sa.ticket_code
WHERE NOT EXISTS (
  SELECT 1
  FROM ticket_assignments ta
  WHERE ta.ticket_id = t.id
    AND ta.technician_id = sa.technician_id
    AND ta.role = sa.role
);

-- ----------------------------------------------------------------------------
-- Riwayat tiket / audit log (30 baris)
-- ----------------------------------------------------------------------------
WITH seed_history (ticket_code, minutes_ago, label, actor, status, note) AS (
  VALUES
    -- #CC-2026-0915
    ('#CC-2026-0915', 12, 'Pengaduan diterima', 'Rina Kartika (Tendik BAKPK)', 'review',
     'Laporan masuk ke antrean verifikasi Biro Sarpras.'),
    -- #CC-2026-0912
    ('#CC-2026-0912', 18, 'Pengaduan diterima', 'Ahmad Rizki (Mhs • 217006120)', 'review',
     'Laporan masuk ke antrean verifikasi Biro Sarpras.'),
    -- #CC-2026-0885
    ('#CC-2026-0885', 4320, 'Pengaduan diterima', 'BEM Mahasiswa', 'review',
     'Laporan masuk ke antrean verifikasi.'),
    ('#CC-2026-0885', 4200, 'Disposisi ke Tim Kelistrikan & Tata Udara', 'Ir. Hendrawan', 'progress',
     'Target SLA 24 jam.'),
    ('#CC-2026-0885', 2880, 'Pekerjaan selesai & divalidasi', 'Agus', 'done',
     'Penggantian lampu sorot selesai dan lolos uji nyala.'),
    -- #CC-2026-0871
    ('#CC-2026-0871', 40, 'Pengaduan diterima', 'Nabila Putri (Mhs • 217008812)', 'review',
     'Laporan masuk ke antrean verifikasi Biro Sarpras.'),
    -- #CC-2026-0864
    ('#CC-2026-0864', 7200, 'Pengaduan diterima', 'Ahmad Rizki', 'review',
     'Laporan masuk ke antrean verifikasi.'),
    ('#CC-2026-0864', 7100, 'Disposisi ke Tim Sanitasi & Sipil', 'Ir. Hendrawan', 'progress',
     'Target SLA 6 jam.'),
    ('#CC-2026-0864', 5760, 'Pekerjaan selesai & divalidasi', 'Iwan', 'done',
     'Lima kursi diganti dan area kelas dibersihkan.'),
    -- #CC-2026-0845
    ('#CC-2026-0845', 43200, 'Pengaduan diterima', 'Satpam Gedung B', 'review',
     'Laporan masuk ke antrean verifikasi.'),
    ('#CC-2026-0845', 43190, 'Disposisi ke Tim Sanitasi & Sipil', 'Ir. Hendrawan', 'progress',
     'Prioritas tinggi, target SLA 2 jam.'),
    ('#CC-2026-0845', 43110, 'Pekerjaan selesai & divalidasi', 'Nanang', 'done',
     'Reset panel dan uji operasi lift selesai.'),
    -- #CC-2026-0812
    ('#CC-2026-0812', 86400, 'Pengaduan diterima', 'Bagian Akademik', 'review',
     'Laporan masuk ke antrean verifikasi.'),
    ('#CC-2026-0812', 86380, 'Disposisi ke Tim Multimedia & AV', 'Ir. Hendrawan', 'progress',
     'Target SLA 6 jam.'),
    ('#CC-2026-0812', 86280, 'Pekerjaan selesai & divalidasi', 'Yudi', 'done',
     'Kabel HDMI diganti, gambar kembali normal.'),
    -- #CC-2026-0788
    ('#CC-2026-0788', 129600, 'Pengaduan diterima', 'Cleaning Service FT', 'review',
     'Laporan masuk ke antrean verifikasi.'),
    ('#CC-2026-0788', 129560, 'Disposisi ke Tim Sanitasi & Sipil', 'Ir. Hendrawan', 'progress',
     'Target SLA 6 jam.'),
    ('#CC-2026-0788', 129300, 'Pekerjaan selesai & divalidasi', 'Asep', 'done',
     'Saluran air dan penutup drainase sudah normal.'),
    -- #CC-2026-0742
    ('#CC-2026-0742', 172800, 'Pengaduan diterima', 'Pustakawan Shift Pagi', 'review',
     'Laporan masuk ke antrean verifikasi.'),
    ('#CC-2026-0742', 172780, 'Disposisi ke Tim Jaringan & IT', 'Ir. Hendrawan', 'progress',
     'Target SLA 6 jam.'),
    ('#CC-2026-0742', 172740, 'Pekerjaan selesai & divalidasi', 'Bayu', 'done',
     'Adaptor daya AP diganti dan koneksi diuji.'),
    -- #CC-2026-0701
    ('#CC-2026-0701', 216000, 'Pengaduan diterima', 'Dosen Lab Basis Data', 'review',
     'Laporan masuk ke antrean verifikasi.'),
    ('#CC-2026-0701', 215990, 'Disposisi ke Tim Kelistrikan & Tata Udara', 'Ir. Hendrawan', 'progress',
     'Prioritas tinggi, target SLA 2 jam.'),
    ('#CC-2026-0701', 215820, 'Pekerjaan selesai & divalidasi', 'Hendra', 'done',
     'MCB diganti dan beban panel dibagi ulang.')
)
INSERT INTO ticket_history (ticket_id, at, label, actor, status, note)
SELECT
  t.id,
  now() - make_interval(mins => sh.minutes_ago),
  sh.label,
  sh.actor,
  sh.status,
  sh.note
FROM seed_history sh
JOIN tickets t ON t.ticket_code = sh.ticket_code
WHERE NOT EXISTS (
  SELECT 1
  FROM ticket_history th
  WHERE th.ticket_id = t.id
    AND th.label = sh.label
    AND th.actor IS NOT DISTINCT FROM sh.actor
    AND th.note IS NOT DISTINCT FROM sh.note
);

-- ----------------------------------------------------------------------------
-- Catatan & instruksi tiket (5 baris) -> ticket_comments
-- notes frontend  -> kind='note'
-- instructions    -> kind='instruction'
-- ----------------------------------------------------------------------------
WITH seed_comments (
  ticket_code, kind, author_email, author_name,
  target_technician_id, body, is_public, minutes_ago
) AS (
  VALUES
    (
      '#CC-2026-0885', 'note', NULL, 'Agus',
      NULL,
      'Lampu LED 200W diganti dan diuji nyala selama 30 menit. BAP sudah ditandatangani.',
      false, 2890
    )
)
INSERT INTO ticket_comments (
  ticket_id, kind, author_id, author_name,
  target_technician_id, body, is_public, created_at
)
SELECT
  t.id,
  sc.kind,
  u.id,
  sc.author_name,
  sc.target_technician_id,
  sc.body,
  sc.is_public,
  now() - make_interval(mins => sc.minutes_ago)
FROM seed_comments sc
JOIN tickets t ON t.ticket_code = sc.ticket_code
LEFT JOIN users u ON u.email = sc.author_email
WHERE NOT EXISTS (
  SELECT 1
  FROM ticket_comments tc
  WHERE tc.ticket_id = t.id
    AND tc.kind = sc.kind
    AND tc.author_name IS NOT DISTINCT FROM sc.author_name
    AND tc.body = sc.body
);

-- ----------------------------------------------------------------------------
-- Selaraskan sequence kode tiket dengan kode tertinggi yang sudah ada.
-- Setelah seed, tiket baru akan memakai #CC-<tahun>-0916.
-- ----------------------------------------------------------------------------
SELECT setval(
  'ticket_code_seq',
  GREATEST(
    915,
    COALESCE((
      SELECT MAX((regexp_replace(ticket_code, '^#CC-[0-9]{4}-', ''))::INTEGER)
      FROM tickets
    ), 915)
  ),
  true
);

COMMIT;
