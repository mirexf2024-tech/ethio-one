-- Ethio One identity foundation (additive migration).
-- Authentication endpoints are not enabled until secret management and
-- verification flows are configured. Passwords must be Argon2id/bcrypt hashes only.

CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name VARCHAR(120) NOT NULL,
  username VARCHAR(30) NOT NULL,
  email VARCHAR(254) NOT NULL,
  phone VARCHAR(32),
  password_hash TEXT NOT NULL,
  account_type VARCHAR(20) NOT NULL DEFAULT 'member'
    CHECK (account_type IN ('member', 'all_service')),
  status VARCHAR(30) NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'suspended', 'pending_verification')),
  terms_accepted_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS users_email_lower_uq
  ON users (LOWER(email));

CREATE UNIQUE INDEX IF NOT EXISTS users_username_lower_uq
  ON users (LOWER(username));

CREATE UNIQUE INDEX IF NOT EXISTS users_phone_uq
  ON users (phone) WHERE phone IS NOT NULL;

INSERT INTO schema_migrations (version)
VALUES ('002_identity_foundation')
ON CONFLICT (version) DO NOTHING;
