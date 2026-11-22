-- Ethio Social one-to-one audio/video call signaling.
CREATE TABLE IF NOT EXISTS social_calls (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
 conversation_id UUID NOT NULL REFERENCES social_conversations(id) ON DELETE CASCADE,
 caller_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 callee_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 call_type VARCHAR(8) NOT NULL CHECK (call_type IN ('audio','video')),
 status VARCHAR(12) NOT NULL DEFAULT 'ringing' CHECK (status IN ('ringing','accepted','rejected','ended','missed')),
 created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 answered_at TIMESTAMPTZ,
 ended_at TIMESTAMPTZ,
 CHECK (caller_id <> callee_id)
);
CREATE INDEX IF NOT EXISTS social_calls_caller_idx ON social_calls(caller_id,created_at DESC);
CREATE INDEX IF NOT EXISTS social_calls_callee_idx ON social_calls(callee_id,created_at DESC);
CREATE INDEX IF NOT EXISTS social_calls_conversation_idx ON social_calls(conversation_id,created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS social_calls_one_active_per_conversation ON social_calls(conversation_id) WHERE status IN ('ringing','accepted');
CREATE TABLE IF NOT EXISTS social_call_signals (
 id BIGSERIAL PRIMARY KEY,
 call_id UUID NOT NULL REFERENCES social_calls(id) ON DELETE CASCADE,
 sender_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 signal_type VARCHAR(12) NOT NULL CHECK (signal_type IN ('offer','answer','ice')),
 payload JSONB NOT NULL,
 created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS social_call_signals_call_idx ON social_call_signals(call_id,id);
INSERT INTO schema_migrations(version) VALUES('016_ethio_social_calls') ON CONFLICT(version) DO NOTHING;
