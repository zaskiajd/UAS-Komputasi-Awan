-- ============================================================================
-- CampusCare — Migrasi 001: arsip aset + FK tiket RESTRICT
-- ----------------------------------------------------------------------------
-- Untuk database yang SUDAH berisi data (versi skema sebelum revisi).
-- Skrip ini idempotent dan aman dijalankan berulang kali:
--
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 \
--        -f db/migrations/001_asset_archive.sql
--
-- Isi:
--   1. assets.archived / assets.archived_at + constraint konsistensi.
--   2. Index idx_assets_archived.
--   3. tickets.asset_id: ON DELETE SET NULL -> ON DELETE RESTRICT.
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- 1. Kolom arsip pada assets
-- ----------------------------------------------------------------------------
ALTER TABLE assets
  ADD COLUMN IF NOT EXISTS archived BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE assets
  ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ;

-- Konstraint dibuat ulang agar database lama mendapat definisi terbaru.
ALTER TABLE assets DROP CONSTRAINT IF EXISTS chk_assets_archived_at;

ALTER TABLE assets
  ADD CONSTRAINT chk_assets_archived_at CHECK (
    (archived AND archived_at IS NOT NULL) OR
    (NOT archived AND archived_at IS NULL)
  );

COMMENT ON COLUMN assets.archived IS
  'true = diarsipkan; tidak tampil di daftar aktif, riwayat tetap utuh.';
COMMENT ON COLUMN assets.archived_at IS
  'Waktu aset diarsipkan; NULL bila archived = false, wajib terisi bila archived = true.';

-- ----------------------------------------------------------------------------
-- 2. Index daftar arsip
-- ----------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_assets_archived ON assets (archived);

-- ----------------------------------------------------------------------------
-- 3. Tiket yang masih menunjuk aset menahan penghapusan permanen
-- ----------------------------------------------------------------------------
ALTER TABLE tickets DROP CONSTRAINT IF EXISTS tickets_asset_id_fkey;

ALTER TABLE tickets
  ADD CONSTRAINT tickets_asset_id_fkey
  FOREIGN KEY (asset_id) REFERENCES assets(id) ON DELETE RESTRICT;

COMMIT;
