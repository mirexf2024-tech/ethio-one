-- Ethio One Digital ID verification state.
-- This is an internal platform verification status, not a government-issued identity.

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS identity_verification_status VARCHAR(32) NOT NULL DEFAULT 'unverified'
  CHECK (identity_verification_status IN ('unverified','pending_review','verified','needs_more_info','rejected'));

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS identity_verification_updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

INSERT INTO schema_migrations (version)
VALUES ('010_identity_verification_status')
ON CONFLICT (version) DO NOTHING;
