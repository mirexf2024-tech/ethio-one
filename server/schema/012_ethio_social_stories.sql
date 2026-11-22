-- Ethio Social Stories: additive 24-hour stories and view tracking.
CREATE TABLE IF NOT EXISTS social_stories (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
 user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 media_public_id VARCHAR(255) NOT NULL,
 media_url TEXT NOT NULL,
 media_type VARCHAR(16) NOT NULL CHECK(media_type IN ('image','video')),
 caption VARCHAR(240) NOT NULL DEFAULT '',
 visibility VARCHAR(16) NOT NULL DEFAULT 'public' CHECK(visibility IN ('public','followers')),
 created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '24 hours'),
 CHECK(char_length(caption)<=240),
 CHECK(media_url LIKE 'https://res.cloudinary.com/%')
);
CREATE INDEX IF NOT EXISTS social_stories_active_idx ON social_stories(expires_at DESC,created_at DESC);
CREATE INDEX IF NOT EXISTS social_stories_user_idx ON social_stories(user_id,created_at DESC);
CREATE TABLE IF NOT EXISTS social_story_views (
 story_id UUID NOT NULL REFERENCES social_stories(id) ON DELETE CASCADE,
 viewer_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 viewed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 PRIMARY KEY(story_id,viewer_id)
);
CREATE INDEX IF NOT EXISTS social_story_views_viewer_idx ON social_story_views(viewer_id,viewed_at DESC);
INSERT INTO schema_migrations(version) VALUES('012_ethio_social_stories') ON CONFLICT(version) DO NOTHING;