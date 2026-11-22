-- Ethio Social MVP: additive tables only; existing Ethio One identity data is unchanged.
CREATE TABLE IF NOT EXISTS social_posts (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
 user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 body TEXT NOT NULL DEFAULT '',
 media JSONB NOT NULL DEFAULT '[]'::jsonb,
 visibility VARCHAR(16) NOT NULL DEFAULT 'public' CHECK (visibility IN ('public','followers')),
 status VARCHAR(16) NOT NULL DEFAULT 'published' CHECK (status IN ('published','removed')),
 created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 CHECK (char_length(body)<=2000), CHECK (jsonb_typeof(media)='array')
);
CREATE INDEX IF NOT EXISTS social_posts_feed_idx ON social_posts(created_at DESC) WHERE status='published';
CREATE INDEX IF NOT EXISTS social_posts_user_idx ON social_posts(user_id,created_at DESC);
CREATE TABLE IF NOT EXISTS social_follows (
 follower_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 following_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 PRIMARY KEY(follower_id,following_id), CHECK(follower_id<>following_id)
);
CREATE INDEX IF NOT EXISTS social_follows_following_idx ON social_follows(following_id,created_at DESC);
CREATE TABLE IF NOT EXISTS social_likes (
 post_id UUID NOT NULL REFERENCES social_posts(id) ON DELETE CASCADE,
 user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), PRIMARY KEY(post_id,user_id)
);
CREATE TABLE IF NOT EXISTS social_comments (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
 post_id UUID NOT NULL REFERENCES social_posts(id) ON DELETE CASCADE,
 user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 body VARCHAR(1000) NOT NULL CHECK(char_length(body) BETWEEN 1 AND 1000),
 status VARCHAR(16) NOT NULL DEFAULT 'published' CHECK(status IN ('published','removed')),
 created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS social_comments_post_idx ON social_comments(post_id,created_at ASC);
CREATE TABLE IF NOT EXISTS social_bookmarks (
 user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 post_id UUID NOT NULL REFERENCES social_posts(id) ON DELETE CASCADE,
 created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), PRIMARY KEY(user_id,post_id)
);
CREATE TABLE IF NOT EXISTS social_blocks (
 blocker_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 blocked_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), PRIMARY KEY(blocker_id,blocked_id), CHECK(blocker_id<>blocked_id)
);
CREATE TABLE IF NOT EXISTS social_reports (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
 reporter_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 target_type VARCHAR(16) NOT NULL CHECK(target_type IN ('post','comment','user')),
 target_id UUID NOT NULL,
 reason VARCHAR(40) NOT NULL CHECK(reason IN ('spam','harassment','hate','violence','nudity','misinformation','impersonation','other')),
 details VARCHAR(500),
 status VARCHAR(16) NOT NULL DEFAULT 'open' CHECK(status IN ('open','reviewing','actioned','dismissed')),
 created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), reviewed_at TIMESTAMPTZ,
 reviewed_by UUID REFERENCES users(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS social_reports_queue_idx ON social_reports(status,created_at DESC);
INSERT INTO schema_migrations(version) VALUES('011_ethio_social_mvp') ON CONFLICT(version) DO NOTHING;