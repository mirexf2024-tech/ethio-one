-- Ethio One initial database foundation.
-- This migration intentionally creates structural tables only; user authentication
-- and personal-data collection are added in reviewed, versioned migrations.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS platform_modules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  module_key VARCHAR(60) NOT NULL UNIQUE,
  display_name VARCHAR(100) NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'planned'
    CHECK (status IN ('planned', 'building', 'beta', 'active', 'paused')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO platform_modules (module_key, display_name, status) VALUES
  ('social', 'Ethio Social', 'planned'),
  ('tube', 'Ethio Tube', 'planned'),
  ('live', 'Ethio Live', 'planned'),
  ('chat', 'Ethio Chat', 'planned'),
  ('market', 'Ethio Market', 'planned'),
  ('news', 'Ethio News', 'planned'),
  ('learning', 'Ethio Learning', 'planned'),
  ('technology', 'Ethio Technology', 'planned'),
  ('wallet', 'Ethio Wallet', 'planned'),
  ('travel', 'Ethio Travel', 'planned'),
  ('assistant', 'Ethio Assistant', 'planned'),
  ('jobs', 'Ethio Jobs', 'planned'),
  ('access', 'Ethio Access', 'planned'),
  ('studio', 'Ethio Studio', 'planned'),
  ('religio', 'Ethio Religio', 'planned'),
  ('earn', 'Ethio Earn', 'planned')
ON CONFLICT (module_key) DO NOTHING;

CREATE TABLE IF NOT EXISTS schema_migrations (
  version VARCHAR(120) PRIMARY KEY,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO schema_migrations (version)
VALUES ('001_initial')
ON CONFLICT (version) DO NOTHING;
