-- Community-scoped posts are stored separately from the public Social feed.
-- Existing posts and community membership records are unchanged.
CREATE TABLE IF NOT EXISTS social_community_posts (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
 community_id UUID NOT NULL REFERENCES social_groups(id) ON DELETE CASCADE,
 user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 body TEXT NOT NULL DEFAULT '',
 media JSONB NOT NULL DEFAULT '[]'::jsonb,
 status VARCHAR(16) NOT NULL DEFAULT 'published' CHECK(status IN ('published','removed')),
 created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 CHECK(char_length(body)<=2000),
 CHECK(jsonb_typeof(media)='array')
);
CREATE INDEX IF NOT EXISTS social_community_posts_feed_idx
 ON social_community_posts(community_id,created_at DESC)
 WHERE status='published';
CREATE INDEX IF NOT EXISTS social_community_posts_author_idx
 ON social_community_posts(user_id,created_at DESC);
CREATE TABLE IF NOT EXISTS social_community_post_comments (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
 post_id UUID NOT NULL REFERENCES social_community_posts(id) ON DELETE CASCADE,
 user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 body VARCHAR(1000) NOT NULL CHECK(char_length(body) BETWEEN 1 AND 1000),
 status VARCHAR(16) NOT NULL DEFAULT 'published' CHECK(status IN ('published','removed')),
 created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS social_community_post_comments_idx
 ON social_community_post_comments(post_id,created_at ASC);
INSERT INTO schema_migrations(version) VALUES('022_ethio_social_community_posts')
 ON CONFLICT(version) DO NOTHING;
