-- AI Conversation Storage Schema for Supabase

-- Conversations table
CREATE TABLE IF NOT EXISTS ai_conversations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id VARCHAR(255) UNIQUE NOT NULL,
    user_id UUID,  -- Optional: link to your users table
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    expires_at TIMESTAMP WITH TIME ZONE DEFAULT (NOW() + INTERVAL '24 hours')
);

-- Conversation messages table
CREATE TABLE IF NOT EXISTS ai_conversation_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id VARCHAR(255) NOT NULL,
    role VARCHAR(50) NOT NULL CHECK (role IN ('user', 'assistant', 'system', 'tool')),
    content TEXT NOT NULL,
    metadata JSONB DEFAULT '{}',  -- Store tool calls, additional context, etc.
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

    CONSTRAINT fk_conversation
        FOREIGN KEY (conversation_id)
        REFERENCES ai_conversations(conversation_id)
        ON DELETE CASCADE
);

-- Indexes for performance
CREATE INDEX idx_conversations_id ON ai_conversations(conversation_id);
CREATE INDEX idx_conversations_expires ON ai_conversations(expires_at);
CREATE INDEX idx_conversations_user ON ai_conversations(user_id);
CREATE INDEX idx_messages_conversation ON ai_conversation_messages(conversation_id);
CREATE INDEX idx_messages_created ON ai_conversation_messages(created_at);

-- Function to auto-update updated_at timestamp
CREATE OR REPLACE FUNCTION update_ai_conversation_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE ai_conversations
    SET updated_at = NOW()
    WHERE conversation_id = NEW.conversation_id;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to update conversation timestamp when message added
CREATE TRIGGER update_conversation_on_message
    AFTER INSERT ON ai_conversation_messages
    FOR EACH ROW
    EXECUTE FUNCTION update_ai_conversation_timestamp();

-- Function to cleanup expired conversations
CREATE OR REPLACE FUNCTION cleanup_expired_conversations()
RETURNS INTEGER AS $$
DECLARE
    deleted_count INTEGER;
BEGIN
    DELETE FROM ai_conversations
    WHERE expires_at < NOW();

    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

-- Optional: Enable Row Level Security
ALTER TABLE ai_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_conversation_messages ENABLE ROW LEVEL SECURITY;

-- Policy: Allow service role to access all conversations (for AI microservice)
CREATE POLICY "Allow service role full access to conversations"
ON ai_conversations
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

CREATE POLICY "Allow service role full access to messages"
ON ai_conversation_messages
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

-- Policy: Users can only access their own conversations (if user_id is set)
CREATE POLICY "Users can access own conversations"
ON ai_conversations
FOR SELECT
TO authenticated
USING (user_id = auth.uid() OR user_id IS NULL);

CREATE POLICY "Users can access own messages"
ON ai_conversation_messages
FOR SELECT
TO authenticated
USING (
    conversation_id IN (
        SELECT conversation_id FROM ai_conversations
        WHERE user_id = auth.uid() OR user_id IS NULL
    )
);

-- Comments for documentation
COMMENT ON TABLE ai_conversations IS 'Stores AI conversation metadata and expiration';
COMMENT ON TABLE ai_conversation_messages IS 'Stores individual messages in AI conversations';
COMMENT ON COLUMN ai_conversations.conversation_id IS 'Unique identifier for the conversation';
COMMENT ON COLUMN ai_conversations.expires_at IS 'When this conversation should be deleted (default 24 hours)';
COMMENT ON COLUMN ai_conversation_messages.role IS 'Message role: user, assistant, system, or tool';
COMMENT ON COLUMN ai_conversation_messages.metadata IS 'Additional data like tool calls, timestamps, etc.';
