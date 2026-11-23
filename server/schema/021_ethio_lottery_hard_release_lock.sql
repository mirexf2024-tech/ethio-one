-- Ethio Lottery release lock: production activity remains impossible until a separately reviewed migration removes these checks.
-- This migration is additive and safe for the current empty raffle tables.
ALTER TABLE raffle_feature_control
  ADD CONSTRAINT raffle_feature_control_live_locked
  CHECK (sales_enabled = FALSE AND live_payments_enabled = FALSE AND live_draws_enabled = FALSE);
ALTER TABLE raffle_campaigns
  ADD CONSTRAINT raffle_campaigns_draft_only
  CHECK (status IN ('draft','planned','pending_approval'));
ALTER TABLE raffle_tickets
  ADD CONSTRAINT raffle_tickets_sandbox_only
  CHECK (status = 'sandbox');
ALTER TABLE raffle_payment_records
  ADD CONSTRAINT raffle_payment_records_sandbox_only
  CHECK (environment = 'sandbox' AND status = 'simulated');
ALTER TABLE raffle_draw_records
  ADD CONSTRAINT raffle_draw_records_sandbox_only
  CHECK (environment = 'sandbox' AND status = 'simulated');
INSERT INTO schema_migrations(version)
VALUES ('021_ethio_lottery_hard_release_lock')
ON CONFLICT (version) DO NOTHING;