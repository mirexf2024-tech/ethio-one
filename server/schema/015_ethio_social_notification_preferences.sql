-- Per-account Ethio Social notification preferences.
CREATE TABLE IF NOT EXISTS social_notification_preferences (
 user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
 likes BOOLEAN NOT NULL DEFAULT TRUE,
 comments BOOLEAN NOT NULL DEFAULT TRUE,
 followers BOOLEAN NOT NULL DEFAULT TRUE,
 messages BOOLEAN NOT NULL DEFAULT TRUE,
 updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
INSERT INTO schema_migrations(version) VALUES('015_ethio_social_notification_preferences') ON CONFLICT(version) DO NOTHING;