-- ============================================================================
-- CampusCare — Migrasi 003: tabel ticket_photos
-- ----------------------------------------------------------------------------
-- Untuk database yang SUDAH berjalan.
-- Skrip ini idempotent dan aman dijalankan berulang kali:
--
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 \
--        -f db/migrations/003_ticket_photos.sql
--
-- Isi:
--   1. Tabel ticket_photos (metadata foto pengaduan, maks. 3 per tiket di app).
--   2. Index idx_ticket_photos_ticket.
--   3. Komentar tickets.photo_url sebagai foto utama hasil sinkronisasi.
--
-- Berkas fisik foto TIDAK disimpan di database; kolom file_name menunjuk ke
-- berkas di UPLOAD_DIR (default: backend/uploads).
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- 1. Tabel metadata foto
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS ticket_photos (
  id            BIGSERIAL PRIMARY KEY,
  ticket_id     INTEGER NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
  file_name     TEXT NOT NULL UNIQUE,
  original_name TEXT,
  mime_type     TEXT NOT NULL
                  CHECK (mime_type IN ('image/jpeg', 'image/png', 'image/webp')),
  size_bytes    BIGINT NOT NULL CHECK (size_bytes > 0),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON COLUMN ticket_photos.file_name IS
  'Nama berkas UUID + ekstensi di UPLOAD_DIR; dipakai untuk URL /uploads/<file_name>.';
COMMENT ON COLUMN ticket_photos.original_name IS
  'Nama asli dari klien setelah sanitasi (hanya untuk informasi).';

COMMENT ON COLUMN tickets.photo_url IS
  'URL foto utama (foto pertama). Disinkronkan dari ticket_photos; NULL bila belum ada foto.';

-- ----------------------------------------------------------------------------
-- 2. Index daftar foto per tiket
-- ----------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_ticket_photos_ticket
  ON ticket_photos (ticket_id, created_at);

COMMIT;
