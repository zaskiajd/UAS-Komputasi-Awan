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
      '#CC-2026-0908',
      'Proyektor Mati Total Ruang Kuliah R.204 GKB',
      'Proyektor tidak menyala saat mata kuliah pagi. Kabel dan sumber listrik sudah dicek, tetapi lampu indikator tetap mati.',
      'Ahmad Rizki (Mhs • 217006120)', '217006120',
      'projector', 'GKB', 'GKB (Gedung Kuliah Bersama)', 'R.204', 'R.204 Lt. 2', 'AST-PRJ-0087',
      'progress', 'Sedang', false, 65, 'av',
      now() - INTERVAL '155 minutes', now() - INTERVAL '40 minutes', NULL
    ),
    (
      '#CC-2026-0899',
      'Kerusakan Pintu Geser & Saklar Toilet Pria Lt.1 Rektorat',
      'Pintu geser tidak bisa menutup rapat dan saklar lampu toilet kadang tidak merespons. Perbaikan menunggu suku cadang engsel.',
      'Siti Rahma (Tendik BAKPK)', NULL,
      'sanitation', 'Rektorat', 'Gedung A (Rektorat)', 'Lt. 1', 'Lt. 1', 'AST-SAN-0063',
      'waiting', 'Sedang', false, 45, 'civil',
      now() - INTERVAL '1680 minutes', now() - INTERVAL '120 minutes', NULL
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
    ('#CC-2026-0908', 'fajar',  'PIC',       'active', 140),
    ('#CC-2026-0908', 'yudi',   'Pendukung', 'active', 120),
    ('#CC-2026-0899', 'dadi',   'PIC',       'active', 1600),
    ('#CC-2026-0899', 'nanang', 'Pendukung', 'active', 1580),
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
    -- #CC-2026-0908
    ('#CC-2026-0908', 155, 'Pengaduan diterima', 'Ahmad Rizki', 'review',
     'Laporan masuk ke antrean verifikasi.'),
    ('#CC-2026-0908', 140, 'Disposisi ke Tim Multimedia & AV', 'Ir. Hendrawan', 'progress',
     'Prioritas sedang, target SLA 6 jam.'),
    ('#CC-2026-0908', 40, 'Teknisi mulai menangani', 'Fajar', 'progress',
     'Pemeriksaan unit dan jalur daya selesai.'),
    -- #CC-2026-0899
    ('#CC-2026-0899', 1680, 'Pengaduan diterima', 'Siti Rahma', 'review',
     'Laporan masuk ke antrean verifikasi.'),
    ('#CC-2026-0899', 1600, 'Disposisi ke Tim Sanitasi & Sipil', 'Ir. Hendrawan', 'progress',
     'Pemeriksaan awal oleh tim sipil.'),
    ('#CC-2026-0899', 120, 'Menunggu suku cadang', 'Dadi', 'waiting',
     'Perbaikan tertunda sampai engsel pengganti tiba.'),
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
      '#CC-2026-0908', 'instruction', 'hendrawan@unsil.ac.id', 'Ir. Hendrawan',
      'fajar',
      'Gunakan unit proyektor cadangan dari gudang AV dan uji HDMI sebelum kelas berikutnya.',
      false, 42
    ),
    (
      '#CC-2026-0908', 'note', NULL, 'Fajar',
      NULL,
      'Unit proyektor sudah dibuka. Ballast lampu terindikasi lemah, sedang disiapkan unit pengganti.',
      false, 38
    ),
    (
      '#CC-2026-0899', 'instruction', 'hendrawan@unsil.ac.id', 'Ir. Hendrawan',
      'dadi',
      'Koordinasikan dengan vendor engsel; bila tiba, pasang bersama Nanang dan uji buka-tutup 20 kali.',
      false, 125
    ),
    (
      '#CC-2026-0899', 'note', NULL, 'Dadi',
      NULL,
      'Engsel pintu tipe geser sudah dipesan ke vendor. Estimasi tiba 2 hari kerja.',
      false, 120
    ),
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
