-- Ethio Earn task marketplace foundation.
-- ETB amounts are stored in minor units. No real-money payouts are enabled by this migration.
CREATE TABLE IF NOT EXISTS earn_campaigns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title VARCHAR(140) NOT NULL,
  description VARCHAR(1200) NOT NULL,
  instructions TEXT NOT NULL,
  category VARCHAR(40) NOT NULL DEFAULT 'general',
  reward_minor BIGINT NOT NULL CHECK (reward_minor > 0),
  budget_minor BIGINT NOT NULL CHECK (budget_minor >= reward_minor),
  reserved_minor BIGINT NOT NULL DEFAULT 0 CHECK (reserved_minor >= 0),
  max_completions INTEGER NOT NULL CHECK (max_completions > 0),
  reserved_completions INTEGER NOT NULL DEFAULT 0 CHECK (reserved_completions >= 0),
  evidence_required BOOLEAN NOT NULL DEFAULT TRUE,
  evidence_hint VARCHAR(300) NOT NULL DEFAULT '',
  status VARCHAR(20) NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft','published','paused','completed','archived')),
  starts_at TIMESTAMPTZ,
  ends_at TIMESTAMPTZ,
  created_by UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (reserved_minor <= budget_minor),
  CHECK (reserved_completions <= max_completions),
  CHECK (ends_at IS NULL OR starts_at IS NULL OR ends_at > starts_at)
);
CREATE INDEX IF NOT EXISTS earn_campaigns_public_idx
  ON earn_campaigns(status, starts_at, ends_at, created_at DESC);

CREATE TABLE IF NOT EXISTS earn_submissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID NOT NULL REFERENCES earn_campaigns(id) ON DELETE RESTRICT,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  evidence_text VARCHAR(2000) NOT NULL DEFAULT '',
  evidence_url VARCHAR(1000),
  status VARCHAR(20) NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','approved','rejected')),
  reviewer_id UUID REFERENCES users(id) ON DELETE RESTRICT,
  review_note VARCHAR(500) NOT NULL DEFAULT '',
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(campaign_id,user_id)
);
CREATE INDEX IF NOT EXISTS earn_submissions_review_idx
  ON earn_submissions(status,created_at ASC);
CREATE INDEX IF NOT EXISTS earn_submissions_user_idx
  ON earn_submissions(user_id,created_at DESC);

-- Immutable credit entries are created only after an authorized reviewer approves a submission.
CREATE TABLE IF NOT EXISTS earn_ledger (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  submission_id UUID NOT NULL UNIQUE REFERENCES earn_submissions(id) ON DELETE RESTRICT,
  amount_minor BIGINT NOT NULL CHECK (amount_minor > 0),
  currency CHAR(3) NOT NULL DEFAULT 'ETB',
  entry_type VARCHAR(20) NOT NULL DEFAULT 'task_reward'
    CHECK (entry_type IN ('task_reward','adjustment_reversal')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS earn_ledger_user_idx
  ON earn_ledger(user_id,created_at DESC);

INSERT INTO schema_migrations(version)
VALUES ('010_ethio_earn_task_marketplace')
ON CONFLICT(version) DO NOTHING;
