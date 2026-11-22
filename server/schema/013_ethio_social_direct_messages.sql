-- Ethio Social direct messages: private one-to-one conversations.
CREATE TABLE IF NOT EXISTS social_conversations (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
 participant_one_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 participant_two_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 last_message_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 CHECK (participant_one_id < participant_two_id),
 UNIQUE (participant_one_id, participant_two_id)
);
CREATE INDEX IF NOT EXISTS social_conversations_one_idx ON social_conversations(participant_one_id,last_message_at DESC);
CREATE INDEX IF NOT EXISTS social_conversations_two_idx ON social_conversations(participant_two_id,last_message_at DESC);
CREATE TABLE IF NOT EXISTS social_messages (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
 conversation_id UUID NOT NULL REFERENCES social_conversations(id) ON DELETE CASCADE,
 sender_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 body VARCHAR(2000) NOT NULL CHECK (char_length(body) BETWEEN 1 AND 2000),
 read_at TIMESTAMPTZ,
 created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS social_messages_conversation_idx ON social_messages(conversation_id,created_at DESC);
CREATE INDEX IF NOT EXISTS social_messages_unread_idx ON social_messages(conversation_id,read_at) WHERE read_at IS NULL;
INSERT INTO schema_migrations(version) VALUES('013_ethio_social_direct_messages') ON CONFLICT(version) DO NOTHING;