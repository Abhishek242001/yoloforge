-- ============================================================
-- GRF Annotation Platform — Neon Postgres Schema
-- ============================================================
-- Run via: psql "$DATABASE_URL" -f db/schema.sql
-- Safe to re-run: uses IF NOT EXISTS throughout.

CREATE EXTENSION IF NOT EXISTS "pgcrypto"; -- for gen_random_uuid()

-- ------------------------------------------------------------
-- NOTE ON QUOTA MODEL (v2 — BYO storage):
-- Users now connect their OWN Cloudflare R2 account (see
-- user_storage_connections below). YOLOForge no longer pays for or
-- enforces a storage ceiling — the user's own R2 bucket/billing is
-- the natural limit. The quota_tiers table from v1 is intentionally
-- removed; do not reintroduce platform-side storage limits here.
-- ------------------------------------------------------------

-- ------------------------------------------------------------
-- Users — v3 (credentials-based auth, replacing Google OAuth).
-- The 'accounts' table below becomes unused for new signups (no OAuth
-- provider linking needed) but is left in place rather than dropped,
-- per instruction to preserve the existing database as-is.
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS users (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name                TEXT,
    email               TEXT UNIQUE,
    "emailVerified"     TIMESTAMPTZ,
    image               TEXT,

    -- GRF-specific fields
    role                TEXT NOT NULL DEFAULT 'public' CHECK (role IN ('public', 'intern', 'researcher', 'admin')),
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Migration-safe additions for credentials-based auth. Run individually
-- against an existing database — each is a no-op if already applied.
ALTER TABLE users ADD COLUMN IF NOT EXISTS password_hash TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES users(id);

-- Simplify the role model to admin/user for the credentials system.
-- Existing rows with legacy roles ('public','intern','researcher') are
-- treated as 'user' going forward; 'admin' rows are preserved as-is.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'users' AND column_name = 'role'
  ) THEN
    ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;
    UPDATE users SET role = 'user' WHERE role NOT IN ('admin', 'user');
    ALTER TABLE users ADD CONSTRAINT users_role_check CHECK (role IN ('admin', 'user'));
    ALTER TABLE users ALTER COLUMN role SET DEFAULT 'user';
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS accounts (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    "userId"            UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    type                TEXT NOT NULL,
    provider            TEXT NOT NULL,
    "providerAccountId" TEXT NOT NULL,
    refresh_token       TEXT,
    access_token        TEXT,
    expires_at          BIGINT,
    token_type          TEXT,
    scope               TEXT,
    id_token            TEXT,
    session_state       TEXT,
    UNIQUE(provider, "providerAccountId")
);

-- Session expiry is enforced at the application layer (48-hour fixed
-- window from login, per product decision — not sliding/refreshing).
-- The 'expires' column here is the source of truth Auth.js checks on
-- every request; the app sets it to now() + 48h at login time.
CREATE TABLE IF NOT EXISTS sessions (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    "sessionToken"  TEXT NOT NULL UNIQUE,
    "userId"        UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    expires         TIMESTAMPTZ NOT NULL
);

CREATE TABLE IF NOT EXISTS verification_token (
    identifier  TEXT NOT NULL,
    token       TEXT NOT NULL,
    expires     TIMESTAMPTZ NOT NULL,
    PRIMARY KEY (identifier, token)
);

-- ------------------------------------------------------------
-- User storage connections — each user's OWN Cloudflare R2 credentials,
-- envelope-encrypted. This table alone, even fully dumped, decrypts
-- nothing: the DEK is wrapped by the yoloforge-keyvault Cloudflare Worker's
-- master key, which lives ONLY in that Worker's environment — fully
-- separate from this app's Netlify environment. Only a live call to the
-- Worker's /unwrap endpoint (authenticated with a shared token held in
-- Netlify env vars) can recover a DEK.
--
-- One connection per user for v1 (a user connects exactly one R2 bucket).
-- Secret material is NEVER stored in plaintext, NEVER returned to the
-- client after creation, and NEVER logged.
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS user_storage_connections (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id                 UUID NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,

    -- Non-secret, safe to display back to the user
    r2_account_id           TEXT NOT NULL,
    r2_bucket_name          TEXT NOT NULL,
    access_key_id_masked    TEXT NOT NULL,  -- e.g. "****************ab12", display only

    -- Envelope-encrypted secret access key
    encrypted_secret        BYTEA NOT NULL,     -- AES-256-GCM ciphertext of the R2 secret key
    encryption_iv           BYTEA NOT NULL,     -- 12-byte GCM IV, unique per encryption
    encryption_auth_tag     BYTEA NOT NULL,     -- GCM auth tag, detects any tampering on decrypt
    encrypted_dek           BYTEA NOT NULL,     -- the DEK itself, wrapped by the key vault Worker
    dek_iv                  BYTEA NOT NULL,     -- IV the Worker used when wrapping the DEK

    -- Also store the access_key_id encrypted (not just masked) since the
    -- app needs the full value to sign requests, but it should never sit
    -- in plaintext either, even though it's less sensitive than the secret.
    encrypted_access_key_id BYTEA NOT NULL,
    access_key_iv           BYTEA NOT NULL,
    access_key_auth_tag     BYTEA NOT NULL,

    -- Soft cap enforced by the app against the user's OWN bucket. Not a
    -- platform cost concern (their bucket, their bill) — a deliberate
    -- per-person ceiling for this personal-project deployment.
    quota_bytes             BIGINT NOT NULL DEFAULT 524288000, -- 500 MB

    status                  TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'invalid', 'disconnected')),
    last_verified_at        TIMESTAMPTZ,        -- last successful live test (PutObject+DeleteObject probe)
    created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ------------------------------------------------------------
-- Audit log — every credential decrypt, connect, disconnect, and
-- destructive file operation gets a row here. This is what makes a
-- credential-compromise event DETECTABLE rather than silent, and is
-- also what you'd show a security-conscious user who asks "can you
-- prove nobody read my key." Never store secret material here.
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS audit_log (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID REFERENCES users(id) ON DELETE SET NULL,
    actor           TEXT NOT NULL DEFAULT 'user',  -- 'user' | 'system' | 'admin'
    action          TEXT NOT NULL,                 -- e.g. 'storage.connected', 'storage.credential_decrypted', 'image.deleted'
    resource_type   TEXT,                          -- 'user_storage_connections' | 'images' | 'datasets'
    resource_id     UUID,
    metadata        JSONB NOT NULL DEFAULT '{}',   -- non-secret context only (IP, filename, bucket name — never key material)
    ip_address      TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_audit_log_user ON audit_log(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_log_action ON audit_log(action, created_at DESC);

-- ------------------------------------------------------------
-- Datasets — one per uploaded ZIP (or manually started labeling batch)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS datasets (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name            TEXT NOT NULL,
    mode            TEXT NOT NULL CHECK (mode IN ('verification', 'labeling')),
    class_map       JSONB NOT NULL DEFAULT '{}', -- { "0": "Bogie", "1": "Spring", ... }
    status          TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'archived')),
    total_bytes     BIGINT NOT NULL DEFAULT 0,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_datasets_user ON datasets(user_id);

-- ------------------------------------------------------------
-- Images — one row per image, points at its R2 object key.
-- Path convention: users/{user_id}/datasets/{dataset_id}/images/{filename}
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS images (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    dataset_id      UUID NOT NULL REFERENCES datasets(id) ON DELETE CASCADE,
    filename        TEXT NOT NULL,
    r2_key          TEXT NOT NULL UNIQUE,
    -- Allowlist enforced at DB level too, as a last line of defense behind
    -- the client-side and server-side (extension + magic-byte) checks.
    mime_type       TEXT NOT NULL CHECK (
        mime_type IN ('image/jpeg', 'image/png', 'image/bmp', 'image/tiff', 'text/plain')
    ),
    width           INTEGER,
    height          INTEGER,
    size_bytes      BIGINT NOT NULL DEFAULT 0,
    review_status   TEXT NOT NULL DEFAULT 'pending' CHECK (review_status IN ('pending', 'approved')),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(dataset_id, filename)
);

CREATE INDEX IF NOT EXISTS idx_images_dataset ON images(dataset_id);

-- ------------------------------------------------------------
-- Annotations — one row per bounding box (never one row per class;
-- a class can have any number of boxes on one image, matching the
-- original Colab tool's design).
-- Coordinates stored normalized (0-1), YOLO-style, same as source format.
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS annotations (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    image_id        UUID NOT NULL REFERENCES images(id) ON DELETE CASCADE,
    class_id        SMALLINT NOT NULL,
    x_center        REAL NOT NULL CHECK (x_center BETWEEN 0 AND 1),
    y_center        REAL NOT NULL CHECK (y_center BETWEEN 0 AND 1),
    box_width       REAL NOT NULL CHECK (box_width BETWEEN 0 AND 1),
    box_height      REAL NOT NULL CHECK (box_height BETWEEN 0 AND 1),
    created_by      UUID REFERENCES users(id),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_annotations_image ON annotations(image_id);

-- ------------------------------------------------------------
-- Storage usage summary — informational only now (no platform-side
-- ceiling to enforce against). Still useful for the dashboard so
-- users can see what they've uploaded to their own bucket.
-- ------------------------------------------------------------
CREATE OR REPLACE VIEW user_storage_summary AS
SELECT
    u.id AS user_id,
    u.email,
    sc.r2_bucket_name,
    sc.status AS connection_status,
    sc.quota_bytes,
    COALESCE(SUM(i.size_bytes), 0) AS used_bytes,
    GREATEST(sc.quota_bytes - COALESCE(SUM(i.size_bytes), 0), 0) AS remaining_bytes,
    COUNT(i.id) AS file_count
FROM users u
LEFT JOIN user_storage_connections sc ON sc.user_id = u.id
LEFT JOIN datasets d ON d.user_id = u.id
LEFT JOIN images i ON i.dataset_id = d.id
GROUP BY u.id, u.email, sc.r2_bucket_name, sc.status, sc.quota_bytes;
