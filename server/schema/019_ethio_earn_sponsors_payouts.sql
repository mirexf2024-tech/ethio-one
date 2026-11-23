-- Ethio Earn sponsor campaigns, view credits and manually reviewed payout requests.
-- The live database already contains these tables under migration 019_ethio_earn_sponsors_payouts.
-- This checked-in file restores the migration source for reproducible future database setup.
-- Do not run against production without checking schema_migrations first.

CREATE TABLE IF NOT EXISTS earn_sponsor_ads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title VARCHAR NOT NULL,
  advertiser_name VARCHAR NOT NULL,
  description VARCHAR NOT NULL,
  creative_url VARCHAR NOT NULL,
  landing_url VARCHAR NOT NULL,
  reward_per_view_minor BIGINT NOT NULL CHECK (reward_per_view_minor > 0),
  max_views INTEGER NOT NULL CHECK (max_views > 0),
  reward_pool_minor BIGINT NOT NULL CHECK (reward_pool_minor > 0),
  platform_fee_minor BIGINT NOT NULL CHECK (platform_fee_minor >= 0),
  gross_budget_minor BIGINT NOT NULL CHECK (gross_budget_minor >= reward_pool_minor + platform_fee_minor),
  platform_fee_bps INTEGER NOT NULL DEFAULT 1000 CHECK (platform_fee_bps BETWEEN 0 AND 3000),
  reserved_views INTEGER NOT NULL DEFAULT 0 CHECK (reserved_views >= 0 AND reserved_views <= max_views),
  completed_views INTEGER NOT NULL DEFAULT 0 CHECK (completed_views >= 0 AND completed_views <= max_views),
  funding_status VARCHAR NOT NULL DEFAULT 'unverified' CHECK (funding_status IN ('unverified','verified','rejected')),
  moderation_status VARCHAR NOT NULL DEFAULT 'pending' CHECK (moderation_status IN ('pending','approved','rejected','needs_changes')),
  status VARCHAR NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','published','paused','archived')),
  funding_reference VARCHAR,
  funding_verified_by UUID REFERENCES users(id) ON DELETE RESTRICT,
  funding_verified_at TIMESTAMPTZ,
  moderator_id UUID REFERENCES users(id) ON DELETE RESTRICT,
  moderated_at TIMESTAMPTZ,
  created_by UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  starts_at TIMESTAMPTZ,
  ends_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS earn_sponsor_ads_public_idx
  ON earn_sponsor_ads(status, funding_status, moderation_status, starts_at, ends_at, created_at DESC);

CREATE TABLE IF NOT EXISTS earn_sponsor_ad_views (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID NOT NULL REFERENCES earn_sponsor_ads(id) ON DELETE RESTRICT,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  status VARCHAR NOT NULL DEFAULT 'started' CHECK (status IN ('started','completed','expired')),
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (campaign_id, user_id)
);

CREATE INDEX IF NOT EXISTS earn_sponsor_ad_views_user_idx
  ON earn_sponsor_ad_views(user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS earn_sponsor_ad_credits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  view_id UUID NOT NULL UNIQUE REFERENCES earn_sponsor_ad_views(id) ON DELETE RESTRICT,
  campaign_id UUID NOT NULL REFERENCES earn_sponsor_ads(id) ON DELETE RESTRICT,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  amount_minor BIGINT NOT NULL CHECK (amount_minor > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS earn_sponsor_ad_credits_user_idx
  ON earn_sponsor_ad_credits(user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS earn_sponsor_ad_revenue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID NOT NULL UNIQUE REFERENCES earn_sponsor_ads(id) ON DELETE RESTRICT,
  gross_funding_minor BIGINT NOT NULL CHECK (gross_funding_minor > 0),
  reward_pool_minor BIGINT NOT NULL CHECK (reward_pool_minor >= 0),
  platform_fee_minor BIGINT NOT NULL CHECK (platform_fee_minor >= 0),
  platform_fee_bps INTEGER NOT NULL CHECK (platform_fee_bps BETWEEN 0 AND 3000),
  funding_reference VARCHAR NOT NULL,
  verified_by UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  funded_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  rewards_credited_minor BIGINT NOT NULL DEFAULT 0 CHECK (rewards_credited_minor >= 0 AND rewards_credited_minor <= reward_pool_minor),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (gross_funding_minor >= reward_pool_minor + platform_fee_minor)
);

CREATE TABLE IF NOT EXISTS earn_payout_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  amount_minor BIGINT NOT NULL CHECK (amount_minor >= 5000),
  payout_method VARCHAR NOT NULL CHECK (payout_method IN ('telebirr','cbe','awash','other')),
  account_ciphertext TEXT NOT NULL,
  account_iv VARCHAR NOT NULL,
  account_tag VARCHAR NOT NULL,
  account_hint VARCHAR NOT NULL,
  account_holder_name VARCHAR NOT NULL,
  status VARCHAR NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','processing','paid','rejected')),
  provider_reference VARCHAR,
  review_note VARCHAR NOT NULL DEFAULT '',
  reviewer_id UUID REFERENCES users(id) ON DELETE RESTRICT,
  reviewed_at TIMESTAMPTZ,
  paid_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS earn_payout_user_idx
  ON earn_payout_requests(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS earn_payout_queue_idx
  ON earn_payout_requests(status, created_at);

CREATE TABLE IF NOT EXISTS earn_payout_ledger (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  payout_request_id UUID NOT NULL UNIQUE REFERENCES earn_payout_requests(id) ON DELETE RESTRICT,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  amount_minor BIGINT NOT NULL CHECK (amount_minor > 0),
  provider_reference VARCHAR NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS earn_payout_ledger_user_idx
  ON earn_payout_ledger(user_id, created_at DESC);
