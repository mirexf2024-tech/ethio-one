-- Worker appeal and fair resubmission workflow for Ethio Earn.
CREATE TABLE IF NOT EXISTS earn_submission_appeals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  submission_id UUID NOT NULL UNIQUE REFERENCES earn_submissions(id) ON DELETE RESTRICT,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  reason VARCHAR(1000) NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','accepted','rejected','reopened')),
  reviewer_id UUID REFERENCES users(id) ON DELETE RESTRICT,
  review_note VARCHAR(500) NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  reviewed_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS earn_appeals_queue_idx ON earn_submission_appeals(status,created_at ASC);
CREATE INDEX IF NOT EXISTS earn_appeals_user_idx ON earn_submission_appeals(user_id,created_at DESC);
INSERT INTO schema_migrations(version) VALUES ('012_ethio_earn_worker_appeals') ON CONFLICT(version) DO NOTHING;
