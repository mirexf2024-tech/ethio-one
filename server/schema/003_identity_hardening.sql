-- Ethio One identity hardening (additive migration).
-- Tested on a temporary Neon branch before production approval.
-- Authentication endpoints remain disabled until verification delivery and
-- secret management are configured.

ALTER TABLE users
  ALTER COLUMN email DROP NOT NULL,
  ALTER COLUMN status SET DEFAULT 'pending_verification';

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS email_verified_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS phone_verified_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS terms_version VARCHAR(40) NOT NULL DEFAULT 'terms-v1';

ALTER TABLE users
  ADD CONSTRAINT users_contact_method_required
  CHECK (email IS NOT NULL OR phone IS NOT NULL);

COMMENT ON COLUMN users.status IS
  'New accounts remain pending_verification until the configured verification workflow confirms ownership.';
COMMENT ON COLUMN users.terms_version IS
  'Version of the Terms and Privacy notice accepted at registration.';
COMMENT ON COLUMN users.email_verified_at IS
  'Timestamp when email ownership was verified. NULL means unverified.';
COMMENT ON COLUMN users.phone_verified_at IS
  'Timestamp when phone ownership was verified. NULL means unverified.';

INSERT INTO schema_migrations (version)
VALUES ('003_identity_hardening')
ON CONFLICT (version) DO NOTHING;
