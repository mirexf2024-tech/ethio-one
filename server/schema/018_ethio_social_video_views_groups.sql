-- Ethio Social video insights and Telegram-style group conversations.
ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS show_video_views BOOLEAN NOT NULL DEFAULT TRUE;

CREATE TABLE IF NOT EXISTS social_post_views (
  post_id UUID NOT NULL REFERENCES social_posts(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  viewed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY(post_id,user_id)
);
CREATE INDEX IF NOT EXISTS social_post_views_user_idx ON social_post_views(user_id,viewed_at DESC);

CREATE TABLE IF NOT EXISTS social_groups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(80) NOT NULL,
  description VARCHAR(300) NOT NULL DEFAULT '',
  avatar_url TEXT,
  created_by UUID NOT NULL REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS social_group_members (
  group_id UUID NOT NULL REFERENCES social_groups(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role VARCHAR(16) NOT NULL DEFAULT 'member' CHECK(role IN ('admin','moderator','member')),
  joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY(group_id,user_id)
);
CREATE INDEX IF NOT EXISTS social_group_members_user_idx ON social_group_members(user_id,joined_at DESC);
CREATE TABLE IF NOT EXISTS social_group_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id UUID NOT NULL REFERENCES social_groups(id) ON DELETE CASCADE,
  sender_id UUID NOT NULL REFERENCES users(id),
  body VARCHAR(2000) NOT NULL DEFAULT '',
  media JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT social_group_messages_body_check CHECK (
    (char_length(body) BETWEEN 1 AND 2000) OR
    (char_length(body)=0 AND jsonb_array_length(media)>0)
  )
);
CREATE INDEX IF NOT EXISTS social_group_messages_recent_idx ON social_group_messages(group_id,created_at DESC);
INSERT INTO schema_migrations(version) VALUES('018_ethio_social_video_views_groups') ON CONFLICT(version) DO NOTHING;