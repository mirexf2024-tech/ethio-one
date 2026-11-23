-- Ethio Lottery: private planning and sandbox foundation only.
-- This migration intentionally does NOT create live ticket, payment, or draw tables.
-- All production release switches are database-enforced OFF until a separately
-- reviewed legal/provider approval migration is prepared and explicitly deployed.

INSERT INTO platform_modules (module_key, display_name, status)
VALUES ('lottery', 'Ethio Lottery', 'planned')
ON CONFLICT (module_key) DO NOTHING;

CREATE TABLE IF NOT EXISTS lottery_control (
  singleton BOOLEAN PRIMARY KEY DEFAULT TRUE CHECK (singleton = TRUE),
  release_state VARCHAR(20) NOT NULL DEFAULT 'planned'
    CHECK (release_state IN ('planned','internal_test','approved_for_release')),
  licence_status VARCHAR(24) NOT NULL DEFAULT 'not_started'
    CHECK (licence_status IN ('not_started','draft_ready','submitted','approved','rejected','expired')),
  sales_enabled BOOLEAN NOT NULL DEFAULT FALSE CHECK (sales_enabled = FALSE),
  public_enabled BOOLEAN NOT NULL DEFAULT FALSE CHECK (public_enabled = FALSE),
  live_payments_enabled BOOLEAN NOT NULL DEFAULT FALSE CHECK (live_payments_enabled = FALSE),
  live_draws_enabled BOOLEAN NOT NULL DEFAULT FALSE CHECK (live_draws_enabled = FALSE),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO lottery_control(singleton) VALUES(TRUE) ON CONFLICT(singleton) DO NOTHING;

CREATE TABLE IF NOT EXISTS lottery_approvals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  scope_key VARCHAR(24) NOT NULL UNIQUE
    CHECK (scope_key IN ('els','cbe','telebirr','mpesa')),
  status VARCHAR(24) NOT NULL DEFAULT 'not_started'
    CHECK (status IN ('not_started','draft_ready','submitted','approved','rejected','expired')),
  reference_code VARCHAR(120),
  evidence_note VARCHAR(1000),
  checked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO lottery_approvals(scope_key) VALUES
 ('els'),('cbe'),('telebirr'),('mpesa')
ON CONFLICT(scope_key) DO NOTHING;

CREATE TABLE IF NOT EXISTS lottery_raffle_campaigns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title VARCHAR(120) NOT NULL,
  description VARCHAR(1200) NOT NULL DEFAULT '',
  prize_summary VARCHAR(1200) NOT NULL DEFAULT '',
  rules TEXT NOT NULL,
  ticket_price_minor BIGINT CHECK (ticket_price_minor IS NULL OR ticket_price_minor >= 0),
  currency CHAR(3) NOT NULL DEFAULT 'ETB' CHECK(currency='ETB'),
  status VARCHAR(16) NOT NULL DEFAULT 'draft'
    CHECK(status IN ('draft','prepared','archived')),
  sales_enabled BOOLEAN NOT NULL DEFAULT FALSE CHECK(sales_enabled=FALSE),
  public_visible BOOLEAN NOT NULL DEFAULT FALSE CHECK(public_visible=FALSE),
  created_by UUID NOT NULL REFERENCES users(id),
  updated_by UUID NOT NULL REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS lottery_campaigns_recent_idx
  ON lottery_raffle_campaigns(updated_at DESC);

CREATE TABLE IF NOT EXISTS lottery_sandbox_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  simulation_ref VARCHAR(40) NOT NULL UNIQUE,
  simulation_kind VARCHAR(24) NOT NULL
    CHECK(simulation_kind IN ('payment','ticket_preview','draw_preview')),
  provider_key VARCHAR(24)
    CHECK(provider_key IS NULL OR provider_key IN ('cbe','telebirr','mpesa')),
  simulated_result VARCHAR(20) NOT NULL
    CHECK(simulated_result IN ('simulated_success','simulated_failure')),
  simulation_only BOOLEAN NOT NULL DEFAULT TRUE CHECK(simulation_only=TRUE),
  created_by UUID NOT NULL REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS lottery_sandbox_runs_recent_idx
  ON lottery_sandbox_runs(created_at DESC);

CREATE TABLE IF NOT EXISTS lottery_audit_logs (
  id BIGSERIAL PRIMARY KEY,
  actor_id UUID NOT NULL REFERENCES users(id),
  action VARCHAR(60) NOT NULL,
  target_type VARCHAR(40) NOT NULL,
  target_id UUID,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS lottery_audit_recent_idx
  ON lottery_audit_logs(created_at DESC);

COMMENT ON TABLE lottery_control IS
  'Planning-only release gate. All live flags have CHECK constraints requiring FALSE.';
COMMENT ON TABLE lottery_approvals IS
  'Tracks external ELS and payment-provider approvals; records are not proof of approval.';
COMMENT ON TABLE lottery_raffle_campaigns IS
  'Private draft configuration only. Public visibility and sales are database-locked OFF.';
COMMENT ON TABLE lottery_sandbox_runs IS
  'Fake simulations only. No external payment calls, real tickets, prizes, or draw results.';
COMMENT ON TABLE lottery_audit_logs IS
  'Append-only audit trail for private lottery planning actions.';

INSERT INTO schema_migrations(version)
VALUES('019_ethio_lottery_planned_raffle')
ON CONFLICT(version) DO NOTHING;
