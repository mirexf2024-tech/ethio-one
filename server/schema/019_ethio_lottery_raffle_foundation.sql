-- Ethio One Ethio Lottery: own-raffle foundation.
-- Additive only. All public sales and live payment capability remain disabled.
CREATE TABLE IF NOT EXISTS raffle_feature_control (
  id SMALLINT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  public_status VARCHAR(20) NOT NULL DEFAULT 'planned'
    CHECK (public_status IN ('planned','building','paused','active')),
  sales_enabled BOOLEAN NOT NULL DEFAULT FALSE CHECK (sales_enabled = FALSE),
  live_payments_enabled BOOLEAN NOT NULL DEFAULT FALSE CHECK (live_payments_enabled = FALSE),
  live_draws_enabled BOOLEAN NOT NULL DEFAULT FALSE CHECK (live_draws_enabled = FALSE),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
INSERT INTO raffle_feature_control (id, public_status, sales_enabled, live_payments_enabled, live_draws_enabled)
VALUES (1, 'planned', FALSE, FALSE, FALSE)
ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS raffle_licence_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  authority VARCHAR(120) NOT NULL DEFAULT 'Ethiopian Lottery Service',
  licence_type VARCHAR(80) NOT NULL DEFAULT 'own_raffle',
  reference_number VARCHAR(120),
  status VARCHAR(24) NOT NULL DEFAULT 'not_applied'
    CHECK (status IN ('not_applied','preparing','submitted','under_review','approved','rejected','expired')),
  valid_from DATE,
  valid_until DATE,
  document_url TEXT,
  verified_by UUID REFERENCES users(id) ON DELETE SET NULL,
  verified_at TIMESTAMPTZ,
  notes TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS raffle_provider_approvals (
  provider_key VARCHAR(20) PRIMARY KEY CHECK (provider_key IN ('cbe','telebirr','mpesa')),
  provider_name VARCHAR(100) NOT NULL,
  status VARCHAR(24) NOT NULL DEFAULT 'not_requested'
    CHECK (status IN ('not_requested','requested','under_review','approved','rejected','suspended')),
  merchant_reference VARCHAR(120),
  approval_document_url TEXT,
  verified_by UUID REFERENCES users(id) ON DELETE SET NULL,
  verified_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
INSERT INTO raffle_provider_approvals (provider_key, provider_name) VALUES
 ('cbe','Commercial Bank of Ethiopia'),
 ('telebirr','Telebirr / Ethio telecom'),
 ('mpesa','M-PESA / Safaricom Ethiopia')
ON CONFLICT (provider_key) DO NOTHING;

CREATE TABLE IF NOT EXISTS raffle_campaigns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_name VARCHAR(160) NOT NULL,
  campaign_type VARCHAR(30) NOT NULL DEFAULT 'raffle'
    CHECK (campaign_type = 'raffle'),
  status VARCHAR(24) NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft','planned','pending_approval','approved','scheduled','closed','cancelled')),
  currency CHAR(3) NOT NULL DEFAULT 'ETB',
  ticket_price_minor BIGINT CHECK (ticket_price_minor IS NULL OR ticket_price_minor >= 0),
  prize_description TEXT NOT NULL DEFAULT '',
  rules_text TEXT NOT NULL DEFAULT '',
  starts_at TIMESTAMPTZ,
  ends_at TIMESTAMPTZ,
  draw_at TIMESTAMPTZ,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  approved_by UUID REFERENCES users(id) ON DELETE SET NULL,
  approved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (status NOT IN ('approved','scheduled','closed') OR approved_at IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS raffle_campaigns_status_created_idx
  ON raffle_campaigns (status, created_at DESC);

CREATE TABLE IF NOT EXISTS raffle_tickets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID NOT NULL REFERENCES raffle_campaigns(id) ON DELETE RESTRICT,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  ticket_code VARCHAR(40) NOT NULL UNIQUE,
  qr_payload_hash CHAR(64) NOT NULL UNIQUE,
  status VARCHAR(20) NOT NULL DEFAULT 'sandbox'
    CHECK (status IN ('sandbox','issued','voided')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS raffle_tickets_user_created_idx ON raffle_tickets (user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS raffle_payment_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID NOT NULL REFERENCES raffle_campaigns(id) ON DELETE RESTRICT,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  provider_key VARCHAR(20) NOT NULL REFERENCES raffle_provider_approvals(provider_key),
  merchant_reference VARCHAR(120),
  amount_minor BIGINT NOT NULL CHECK (amount_minor > 0),
  currency CHAR(3) NOT NULL DEFAULT 'ETB',
  environment VARCHAR(12) NOT NULL DEFAULT 'sandbox' CHECK (environment = 'sandbox'),
  status VARCHAR(20) NOT NULL DEFAULT 'simulated'
    CHECK (status IN ('simulated','failed','reversed')),
  idempotency_key VARCHAR(120) NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS raffle_draw_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID NOT NULL UNIQUE REFERENCES raffle_campaigns(id) ON DELETE RESTRICT,
  environment VARCHAR(12) NOT NULL DEFAULT 'sandbox' CHECK (environment = 'sandbox'),
  algorithm_version VARCHAR(40),
  seed_commitment CHAR(64),
  result_hash CHAR(64),
  status VARCHAR(20) NOT NULL DEFAULT 'not_started'
    CHECK (status IN ('not_started','simulated','awaiting_audit','verified','cancelled')),
  conducted_at TIMESTAMPTZ,
  verified_by UUID REFERENCES users(id) ON DELETE SET NULL,
  verified_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS raffle_audit_events (
  id BIGSERIAL PRIMARY KEY,
  actor_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  event_key VARCHAR(80) NOT NULL,
  entity_type VARCHAR(40) NOT NULL,
  entity_id UUID,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS raffle_audit_events_created_idx ON raffle_audit_events (created_at DESC);

INSERT INTO platform_modules (module_key, display_name, status)
VALUES ('lottery','Ethio Lottery','planned')
ON CONFLICT (module_key) DO UPDATE SET status='planned', updated_at=NOW();

INSERT INTO schema_migrations (version)
VALUES ('019_ethio_lottery_raffle_foundation')
ON CONFLICT (version) DO NOTHING;
