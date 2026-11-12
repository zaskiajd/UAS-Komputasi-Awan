-- ============================================================================
-- CampusCare — Migrasi 002: Google OAuth support pada tabel users
-- ----------------------------------------------------------------------------
-- Untuk database yang SUDAH berjalan.
-- Skrip ini idempotent dan aman dijalankan berulang kali:
--
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 \
--        -f db/migrations/002_google_auth.sql
--
-- Perubahan:
--   1. users.password_hash menjadi boleh NULL (untuk akun login pihak ketiga).
--   2. users.google_id TEXT UNIQUE.
--   3. users.auth_provider TEXT NOT NULL DEFAULT 'local' ('local' | 'google').
--   4. CONSTRAINT users_auth_local_password_chk: akun 'local' wajib ber-password.
-- ============================================================================

BEGIN;

-- 1. password_hash boleh NULL
ALTER TABLE users
  ALTER COLUMN password_hash DROP NOT NULL;

-- 2. google_id
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS google_id TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'users_google_id_key'
  ) THEN
    ALTER TABLE users
      ADD CONSTRAINT users_google_id_key UNIQUE (google_id);
  END IF;
END
$$;

COMMENT ON COLUMN users.google_id IS
  'Subject ID unik dari Google OAuth (Google Identity Services).';

-- 3. auth_provider
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS auth_provider TEXT NOT NULL DEFAULT 'local';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'users_auth_provider_chk'
  ) THEN
    ALTER TABLE users
      ADD CONSTRAINT users_auth_provider_chk
      CHECK (auth_provider IN ('local', 'google'));
  END IF;
END
$$;

COMMENT ON COLUMN users.auth_provider IS
  'Penyedia autentikasi: local (email + sandi bcrypt) atau google (Google OAuth).';

-- 4. Akun local wajib punya password_hash
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'users_auth_local_password_chk'
  ) THEN
    ALTER TABLE users
      ADD CONSTRAINT users_auth_local_password_chk
      CHECK (auth_provider <> 'local' OR password_hash IS NOT NULL);
  END IF;
END
$$;

COMMIT;
