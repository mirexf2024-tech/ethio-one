-- Profile privacy controls for Ethio Social.
ALTER TABLE user_profiles
  ADD COLUMN IF NOT EXISTS profile_visibility VARCHAR(16) NOT NULL DEFAULT 'public';
DO $$ BEGIN
  ALTER TABLE user_profiles ADD CONSTRAINT user_profiles_visibility_check
    CHECK (profile_visibility IN ('public','followers'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
INSERT INTO schema_migrations(version) VALUES('014_ethio_social_profile_privacy') ON CONFLICT(version) DO NOTHING;