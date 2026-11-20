-- Ethio One minimized security audit trail.
-- Additive only. Do not apply to production without explicit approval.
CREATE TABLE IF NOT EXISTS security_events (
  id BIGSERIAL PRIMARY KEY,
  event_type VARCHAR(80) NOT NULL,
  severity VARCHAR(12) NOT NULL CHECK (severity IN ('info','warning','high','critical')),
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  ip_digest CHAR(64),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS security_events_created_idx
  ON security_events (created_at DESC);
CREATE INDEX IF NOT EXISTS security_events_type_created_idx
  ON security_events (event_type, created_at DESC);
CREATE INDEX IF NOT EXISTS security_events_severity_created_idx
  ON security_events (severity, created_at DESC);
INSERT INTO schema_migrations (version)
VALUES ('005_security_events')
ON CONFLICT (version) DO NOTHING;
