-- Ethio One Free / Premium subscription foundation.
-- Additive only: does not activate paid services, charge users, or alter existing roles.
-- Payment provider callbacks and server-side entitlement enforcement are separate releases.

-- Complete the service registry without changing existing module status.
INSERT INTO platform_modules (module_key, display_name, status) VALUES
  ('cafe', 'Ethio Cafe', 'planned')
ON CONFLICT (module_key) DO NOTHING;

CREATE TABLE IF NOT EXISTS subscription_plans (
  plan_key VARCHAR(30) PRIMARY KEY,
  display_name VARCHAR(80) NOT NULL,
  description VARCHAR(500) NOT NULL DEFAULT '',
  currency CHAR(3) NOT NULL DEFAULT 'ETB',
  amount_minor BIGINT NOT NULL DEFAULT 0 CHECK (amount_minor >= 0),
  billing_interval VARCHAR(20) NOT NULL DEFAULT 'none'
    CHECK (billing_interval IN ('none','month','year')),
  status VARCHAR(20) NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft','active','retired')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (
    (plan_key = 'free' AND amount_minor = 0 AND billing_interval = 'none')
    OR plan_key <> 'free'
  )
);

INSERT INTO subscription_plans
  (plan_key, display_name, description, currency, amount_minor, billing_interval, status)
VALUES
  ('free', 'Ethio One Free', 'Access to services released for free use.', 'ETB', 0, 'none', 'active'),
  ('premium', 'Ethio One Premium', 'Premium benefits; availability and pricing will be announced.', 'ETB', 0, 'month', 'draft'),
  ('pro', 'Ethio One Pro', 'Advanced benefits for power users; availability and pricing will be announced.', 'ETB', 0, 'month', 'draft')
ON CONFLICT (plan_key) DO NOTHING;

-- Only explicitly configured rows grant plan-level module access.
-- An absent row means no plan grant; module status must also be active.
CREATE TABLE IF NOT EXISTS plan_module_access (
  plan_key VARCHAR(30) NOT NULL REFERENCES subscription_plans(plan_key) ON DELETE CASCADE,
  module_key VARCHAR(60) NOT NULL REFERENCES platform_modules(module_key) ON DELETE CASCADE,
  access_level VARCHAR(20) NOT NULL DEFAULT 'included'
    CHECK (access_level IN ('included','limited','locked')),
  limits JSONB NOT NULL DEFAULT '{}'::jsonb
    CHECK (jsonb_typeof(limits) = 'object'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (plan_key, module_key)
);

CREATE TABLE IF NOT EXISTS user_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  plan_key VARCHAR(30) NOT NULL REFERENCES subscription_plans(plan_key) ON DELETE RESTRICT,
  status VARCHAR(20) NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','trialing','active','past_due','cancelled','expired','failed')),
  starts_at TIMESTAMPTZ,
  current_period_start TIMESTAMPTZ,
  current_period_end TIMESTAMPTZ,
  cancel_at_period_end BOOLEAN NOT NULL DEFAULT FALSE,
  cancelled_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (current_period_end IS NULL OR current_period_start IS NULL OR current_period_end > current_period_start)
);
CREATE INDEX IF NOT EXISTS user_subscriptions_user_history_idx
  ON user_subscriptions (user_id, created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS user_subscriptions_one_current_idx
  ON user_subscriptions (user_id)
  WHERE status IN ('trialing','active','past_due');

CREATE TABLE IF NOT EXISTS payment_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  subscription_id UUID REFERENCES user_subscriptions(id) ON DELETE SET NULL,
  provider VARCHAR(40) NOT NULL,
  provider_reference VARCHAR(160),
  provider_event_id VARCHAR(180),
  amount_minor BIGINT NOT NULL CHECK (amount_minor >= 0),
  currency CHAR(3) NOT NULL DEFAULT 'ETB',
  status VARCHAR(20) NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','succeeded','failed','reversed')),
  description VARCHAR(240) NOT NULL DEFAULT '',
  verified_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS payment_transactions_provider_ref_idx
  ON payment_transactions (provider, provider_reference)
  WHERE provider_reference IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS payment_transactions_provider_event_idx
  ON payment_transactions (provider, provider_event_id)
  WHERE provider_event_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS payment_transactions_user_history_idx
  ON payment_transactions (user_id, created_at DESC);

INSERT INTO schema_migrations (version)
VALUES ('009_free_premium_access_foundation')
ON CONFLICT (version) DO NOTHING;
