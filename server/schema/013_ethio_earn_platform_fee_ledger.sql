-- Transparent 10% Ethio Earn marketplace service fee and funded-reward accounting.
ALTER TABLE earn_campaigns
  ADD COLUMN IF NOT EXISTS reward_pool_minor BIGINT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS platform_fee_minor BIGINT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS platform_fee_bps INTEGER NOT NULL DEFAULT 1000;
UPDATE earn_campaigns
SET reward_pool_minor=reward_minor*max_completions,
    platform_fee_minor=GREATEST(0,budget_minor-(reward_minor*max_completions))
WHERE reward_pool_minor=0;
ALTER TABLE earn_task_requests
  ADD COLUMN IF NOT EXISTS reward_pool_minor BIGINT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS platform_fee_minor BIGINT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS platform_fee_bps INTEGER NOT NULL DEFAULT 1000;
UPDATE earn_task_requests
SET reward_pool_minor=reward_minor*max_completions,
    platform_fee_minor=GREATEST(0,budget_minor-(reward_minor*max_completions))
WHERE reward_pool_minor=0;
ALTER TABLE earn_campaigns ADD CONSTRAINT earn_campaign_finance_chk
  CHECK (reward_pool_minor>=reward_minor*max_completions AND platform_fee_minor>=0 AND platform_fee_bps BETWEEN 0 AND 3000 AND budget_minor>=reward_pool_minor+platform_fee_minor);
ALTER TABLE earn_task_requests ADD CONSTRAINT earn_request_finance_chk
  CHECK (reward_pool_minor>=reward_minor*max_completions AND platform_fee_minor>=0 AND platform_fee_bps BETWEEN 0 AND 3000 AND budget_minor>=reward_pool_minor+platform_fee_minor);
CREATE TABLE IF NOT EXISTS earn_platform_revenue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID NOT NULL UNIQUE REFERENCES earn_campaigns(id) ON DELETE RESTRICT,
  gross_funding_minor BIGINT NOT NULL CHECK (gross_funding_minor>0),
  reward_pool_minor BIGINT NOT NULL CHECK (reward_pool_minor>=0),
  platform_fee_minor BIGINT NOT NULL CHECK (platform_fee_minor>=0),
  platform_fee_bps INTEGER NOT NULL CHECK (platform_fee_bps BETWEEN 0 AND 3000),
  funding_reference VARCHAR(160) NOT NULL,
  verified_by UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  funded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  rewards_credited_minor BIGINT NOT NULL DEFAULT 0 CHECK (rewards_credited_minor>=0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (gross_funding_minor>=reward_pool_minor+platform_fee_minor),
  CHECK (rewards_credited_minor<=reward_pool_minor)
);
CREATE INDEX IF NOT EXISTS earn_platform_revenue_funded_idx ON earn_platform_revenue(funded_at DESC);
INSERT INTO schema_migrations(version) VALUES ('013_ethio_earn_platform_fee_ledger') ON CONFLICT(version) DO NOTHING;
