-- Ethio Social messenger attachments and post reactions.
ALTER TABLE social_messages
 ADD COLUMN IF NOT EXISTS media JSONB NOT NULL DEFAULT '[]'::jsonb;
DO $$ BEGIN
 IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='social_messages_media_check') THEN
  ALTER TABLE social_messages ADD CONSTRAINT social_messages_media_check CHECK (jsonb_typeof(media)='array');
 END IF;
END $$;
ALTER TABLE social_likes
 ADD COLUMN IF NOT EXISTS reaction VARCHAR(16) NOT NULL DEFAULT 'like';
DO $$ BEGIN
 IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='social_likes_reaction_check') THEN
  ALTER TABLE social_likes ADD CONSTRAINT social_likes_reaction_check CHECK (reaction IN ('like','love','care','haha','wow','sad','angry'));
 END IF;
END $$;
INSERT INTO schema_migrations(version) VALUES('017_ethio_social_messenger_media_reactions') ON CONFLICT(version) DO NOTHING;
