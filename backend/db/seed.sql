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
-- TIKET DUMMY TIDAK DI-SEED LAGI
-- Database mulai bersih (tanpa tiket, penugasan, riwayat, atau komentar)
-- agar hasil pengetesan fitur — notifikasi real-time, SLA, dan statistik
-- publik — mencerminkan aktivitas nyata, bukan data demo lama.
-- Sequence kode tiket di-reset supaya tiket pertama memakai
-- #CC-<tahun>-0001.
-- ----------------------------------------------------------------------------
SELECT setval('ticket_code_seq', 1, false);

COMMIT;
