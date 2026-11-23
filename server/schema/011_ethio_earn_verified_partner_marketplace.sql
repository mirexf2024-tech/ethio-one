-- Verified partner-funded Ethio Earn marketplace.
-- This migration is additive. Existing campaigns become unverified until staff review funding and content.
ALTER TABLE earn_campaigns
  ADD COLUMN IF NOT EXISTS task_type VARCHAR(40) NOT NULL DEFAULT 'microtask',
  ADD COLUMN IF NOT EXISTS delivery_mode VARCHAR(24) NOT NULL DEFAULT 'ethio_one',
  ADD COLUMN IF NOT EXISTS provider_name VARCHAR(160) NOT NULL DEFAULT 'Ethio One',
  ADD COLUMN IF NOT EXISTS provider_url VARCHAR(1000),
  ADD COLUMN IF NOT EXISTS estimated_minutes INTEGER NOT NULL DEFAULT 10,
  ADD COLUMN IF NOT EXISTS skill_level VARCHAR(20) NOT NULL DEFAULT 'beginner',
  ADD COLUMN IF NOT EXISTS language_codes TEXT[] NOT NULL DEFAULT ARRAY['om','am','en']::text[],
  ADD COLUMN IF NOT EXISTS quality_criteria TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS funding_status VARCHAR(20) NOT NULL DEFAULT 'unverified',
  ADD COLUMN IF NOT EXISTS funding_reference VARCHAR(160),
  ADD COLUMN IF NOT EXISTS funding_verified_by UUID REFERENCES users(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS funding_verified_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS moderation_status VARCHAR(20) NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS moderator_id UUID REFERENCES users(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS moderated_at TIMESTAMPTZ;

ALTER TABLE earn_campaigns ADD CONSTRAINT earn_campaign_task_type_chk
  CHECK (task_type IN ('data_labeling','transcription','translation','survey','research','data_entry','content_review','qa_testing','design','video_audio','local_data','other'));
ALTER TABLE earn_campaigns ADD CONSTRAINT earn_campaign_delivery_mode_chk
  CHECK (delivery_mode IN ('ethio_one','partner_link'));
ALTER TABLE earn_campaigns ADD CONSTRAINT earn_campaign_skill_level_chk
  CHECK (skill_level IN ('beginner','intermediate','advanced'));
ALTER TABLE earn_campaigns ADD CONSTRAINT earn_campaign_funding_status_chk
  CHECK (funding_status IN ('unverified','verified','rejected'));
ALTER TABLE earn_campaigns ADD CONSTRAINT earn_campaign_moderation_status_chk
  CHECK (moderation_status IN ('pending','approved','rejected','needs_changes'));
ALTER TABLE earn_campaigns ADD CONSTRAINT earn_campaign_estimated_minutes_chk
  CHECK (estimated_minutes BETWEEN 1 AND 1440);

CREATE INDEX IF NOT EXISTS earn_campaign_marketplace_filter_idx
  ON earn_campaigns(status,funding_status,moderation_status,task_type,created_at DESC);

CREATE TABLE IF NOT EXISTS earn_task_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  requester_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  organization_name VARCHAR(160) NOT NULL,
  organization_website VARCHAR(1000) NOT NULL,
  contact_email VARCHAR(254) NOT NULL,
  task_title VARCHAR(140) NOT NULL,
  task_description VARCHAR(1200) NOT NULL,
  task_instructions TEXT NOT NULL,
  task_type VARCHAR(40) NOT NULL CHECK (task_type IN ('data_labeling','transcription','translation','survey','research','data_entry','content_review','qa_testing','design','video_audio','local_data','other')),
  provider_name VARCHAR(160) NOT NULL,
  provider_url VARCHAR(1000) NOT NULL,
  reward_minor BIGINT NOT NULL CHECK (reward_minor > 0),
  budget_minor BIGINT NOT NULL CHECK (budget_minor >= reward_minor),
  max_completions INTEGER NOT NULL CHECK (max_completions BETWEEN 1 AND 100000),
  estimated_minutes INTEGER NOT NULL CHECK (estimated_minutes BETWEEN 1 AND 1440),
  skill_level VARCHAR(20) NOT NULL CHECK (skill_level IN ('beginner','intermediate','advanced')),
  language_codes TEXT[] NOT NULL DEFAULT ARRAY['om','am','en']::text[],
  evidence_hint VARCHAR(300) NOT NULL DEFAULT '',
  quality_criteria TEXT NOT NULL DEFAULT '',
  status VARCHAR(24) NOT NULL DEFAULT 'submitted'
    CHECK (status IN ('submitted','needs_changes','moderator_approved','rejected','published')),
  funding_status VARCHAR(20) NOT NULL DEFAULT 'unverified'
    CHECK (funding_status IN ('unverified','verified','rejected')),
  funding_reference VARCHAR(160),
  funding_verified_by UUID REFERENCES users(id) ON DELETE RESTRICT,
  funding_verified_at TIMESTAMPTZ,
  moderator_id UUID REFERENCES users(id) ON DELETE RESTRICT,
  moderated_at TIMESTAMPTZ,
  review_note VARCHAR(500) NOT NULL DEFAULT '',
  campaign_id UUID UNIQUE REFERENCES earn_campaigns(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (budget_minor >= reward_minor * max_completions)
);
CREATE INDEX IF NOT EXISTS earn_task_requests_queue_idx
  ON earn_task_requests(status,funding_status,created_at ASC);
CREATE INDEX IF NOT EXISTS earn_task_requests_requester_idx
  ON earn_task_requests(requester_id,created_at DESC);

INSERT INTO schema_migrations(version)
VALUES ('011_ethio_earn_verified_partner_marketplace')
ON CONFLICT(version) DO NOTHING;
