-- Creator analytics foundations: deduplicated daily impressions and share events.
CREATE TABLE IF NOT EXISTS social_post_impressions (
 id BIGSERIAL PRIMARY KEY,
 post_id UUID NOT NULL REFERENCES social_posts(id) ON DELETE CASCADE,
 user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 impression_day DATE NOT NULL DEFAULT CURRENT_DATE,
 created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 UNIQUE(post_id,user_id,impression_day)
);
CREATE INDEX IF NOT EXISTS social_post_impressions_post_day_idx ON social_post_impressions(post_id,impression_day DESC);
CREATE INDEX IF NOT EXISTS social_post_impressions_user_day_idx ON social_post_impressions(user_id,impression_day DESC);
CREATE TABLE IF NOT EXISTS social_post_shares (
 id BIGSERIAL PRIMARY KEY,
 post_id UUID NOT NULL REFERENCES social_posts(id) ON DELETE CASCADE,
 user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 shared_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS social_post_shares_post_idx ON social_post_shares(post_id,shared_at DESC);
INSERT INTO schema_migrations(version) VALUES('018_ethio_social_creator_analytics') ON CONFLICT(version) DO NOTHING;
