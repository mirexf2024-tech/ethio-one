-- Telegram account linking. Additive migration; does not change existing email/SMS auth.
CREATE TABLE IF NOT EXISTS telegram_accounts (
  user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  chat_id TEXT NOT NULL UNIQUE,
  linked_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS telegram_link_challenges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_digest TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  consumed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS telegram_link_challenges_expiry_idx
  ON telegram_link_challenges (expires_at) WHERE consumed_at IS NULL;

INSERT INTO schema_migrations (version)
VALUES ('006_telegram_account_linking')
ON CONFLICT (version) DO NOTHING;
