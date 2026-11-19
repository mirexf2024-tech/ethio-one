-- Ethio One authentication support tables.
-- Additive only. Review and apply to production as a separately approved migration.
-- OTP values and refresh tokens are stored only as keyed digests by the application.

CREATE TABLE IF NOT EXISTS auth_challenges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  channel VARCHAR(10) NOT NULL CHECK (channel IN ('email', 'sms')),
  purpose VARCHAR(24) NOT NULL
    CHECK (purpose IN ('verify_contact', 'password_reset')),
  code_digest TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  consumed_at TIMESTAMPTZ,
  failed_attempts SMALLINT NOT NULL DEFAULT 0 CHECK (failed_attempts BETWEEN 0 AND 5),
  max_attempts SMALLINT NOT NULL DEFAULT 5 CHECK (max_attempts BETWEEN 1 AND 5),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_sent_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS auth_challenges_lookup_idx
  ON auth_challenges (user_id, channel, purpose, created_at DESC);

CREATE INDEX IF NOT EXISTS auth_challenges_expiry_idx
  ON auth_challenges (expires_at)
  WHERE consumed_at IS NULL;

CREATE TABLE IF NOT EXISTS auth_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  family_id UUID NOT NULL,
  refresh_token_digest TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  revoked_at TIMESTAMPTZ,
  replaced_by_digest TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_used_at TIMESTAMPTZ,
  user_agent_digest TEXT,
  ip_digest TEXT
);

CREATE INDEX IF NOT EXISTS auth_sessions_user_idx
  ON auth_sessions (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS auth_sessions_family_idx
  ON auth_sessions (family_id);

CREATE INDEX IF NOT EXISTS auth_sessions_expiry_idx
  ON auth_sessions (expires_at)
  WHERE revoked_at IS NULL;

INSERT INTO schema_migrations (version)
VALUES ('004_auth_challenges_and_sessions')
ON CONFLICT (version) DO NOTHING;
