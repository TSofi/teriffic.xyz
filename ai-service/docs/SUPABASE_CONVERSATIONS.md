# Supabase Conversation Storage Guide

## Overview

The AI microservice now stores conversation history directly in Supabase PostgreSQL tables, providing:

- **Persistence**: Conversations survive service restarts
- **Scalability**: Share conversations across multiple service instances
- **Multi-user**: Support for user-specific conversations
- **Analytics**: Query conversation history for insights
- **Backup**: Automatic Supabase backups

## Database Schema

### Tables

#### `ai_conversations`
Stores conversation metadata and expiration info.

```sql
CREATE TABLE ai_conversations (
    id UUID PRIMARY KEY,
    conversation_id VARCHAR(255) UNIQUE NOT NULL,
    user_id UUID,  -- Optional: link to users
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE,
    updated_at TIMESTAMP WITH TIME ZONE,
    expires_at TIMESTAMP WITH TIME ZONE  -- Auto-expires after 24h
);
```

#### `ai_conversation_messages`
Stores individual messages in conversations.

```sql
CREATE TABLE ai_conversation_messages (
    id UUID PRIMARY KEY,
    conversation_id VARCHAR(255) NOT NULL,
    role VARCHAR(50) NOT NULL,  -- user, assistant, system, tool
    content TEXT NOT NULL,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE
);
```

## Setup

### 1. Run SQL Schema

In Supabase SQL Editor, run the schema from:
```bash
ai-service/docs/schema/conversations.sql
```

This creates:
- Tables with proper indexes
- Auto-update trigger for `updated_at`
- Cleanup function for expired conversations
- Row Level Security policies

### 2. Verify Tables

```sql
-- Check tables exist
SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name LIKE 'ai_%';

-- Should show:
-- ai_conversations
-- ai_conversation_messages
```

## Usage

### Basic Conversation Flow

```python
# 1. Start conversation (auto-creates entry)
response = await client.post("/chat", json={
    "message": "How is line 999?"
})

conversation_id = response.json()["conversation_id"]

# 2. Continue conversation with history
response = await client.post("/chat", json={
    "message": "Are there alternatives?",
    "conversation_id": conversation_id,
    "include_history": True
})

# 3. Get conversation history
response = await client.get(f"/conversations/{conversation_id}")

# 4. Clear conversation
await client.post(f"/conversations/{conversation_id}/clear")
```

### User-Specific Conversations

Link conversations to your app's users:

```python
# When creating conversation, pass user_id
conv_manager = ConversationManager(db_service)
conversation_id = await conv_manager.create_conversation(
    user_id="user-uuid-123"
)

# Get all conversations for a user
conversations = await conv_manager.get_user_conversations(
    user_id="user-uuid-123",
    limit=10
)
```

### Extend Conversation TTL

Keep important conversations longer:

```python
# Extend by 24 more hours
await conv_manager.extend_ttl(
    conversation_id="conv-uuid",
    hours=24
)
```

## Features

### 1. Automatic Expiration

Conversations automatically delete after TTL (default 24 hours):

```sql
-- Conversations with expires_at < NOW() are auto-cleaned hourly
SELECT * FROM ai_conversations
WHERE expires_at > NOW();  -- Only active conversations
```

### 2. Message Metadata

Store additional data with messages:

```python
await conv_manager.add_message(
    conversation_id="conv-uuid",
    role="assistant",
    content="Response text",
    metadata={
        "tool_calls": [{"tool": "get_bus_line_status", "args": {...}}],
        "model": "gemma-2-27b-it",
        "tokens": 150,
        "duration_ms": 1200
    }
)
```

### 3. Statistics

Monitor conversation usage:

```bash
curl http://localhost:8001/stats

{
  "total_conversations": 42,
  "total_messages": 156,
  "expired_conversations": 5,
  "ttl_hours": 24
}
```

### 4. Manual Cleanup

Trigger cleanup manually:

```python
# Cleanup expired conversations
removed_count = await conv_manager.cleanup_expired()
print(f"Removed {removed_count} expired conversations")
```

## Supabase Dashboard

### View Conversations

1. Go to **Table Editor** in Supabase
2. Select `ai_conversations` table
3. See all active conversations with timestamps

### View Messages

```sql
-- Get recent conversations with message counts
SELECT
    c.conversation_id,
    c.created_at,
    c.expires_at,
    COUNT(m.id) as message_count
FROM ai_conversations c
LEFT JOIN ai_conversation_messages m ON c.conversation_id = m.conversation_id
GROUP BY c.conversation_id, c.created_at, c.expires_at
ORDER BY c.updated_at DESC
LIMIT 10;
```

### Popular Queries

```sql
-- Most active conversations
SELECT
    c.conversation_id,
    COUNT(m.id) as message_count,
    c.created_at,
    c.updated_at
FROM ai_conversations c
JOIN ai_conversation_messages m ON c.conversation_id = m.conversation_id
GROUP BY c.conversation_id
ORDER BY message_count DESC
LIMIT 10;

-- User activity
SELECT
    c.user_id,
    COUNT(DISTINCT c.conversation_id) as conversations,
    COUNT(m.id) as total_messages
FROM ai_conversations c
LEFT JOIN ai_conversation_messages m ON c.conversation_id = m.conversation_id
WHERE c.user_id IS NOT NULL
GROUP BY c.user_id
ORDER BY conversations DESC;

-- Average conversation length
SELECT
    AVG(message_count) as avg_messages_per_conversation
FROM (
    SELECT
        conversation_id,
        COUNT(*) as message_count
    FROM ai_conversation_messages
    GROUP BY conversation_id
) subquery;
```

## Performance

### Indexes

All performance-critical queries are indexed:

```sql
-- Conversation lookup by ID (unique index)
CREATE INDEX idx_conversations_id ON ai_conversations(conversation_id);

-- Expiration cleanup
CREATE INDEX idx_conversations_expires ON ai_conversations(expires_at);

-- User conversations
CREATE INDEX idx_conversations_user ON ai_conversations(user_id);

-- Message lookup
CREATE INDEX idx_messages_conversation ON ai_conversation_messages(conversation_id);
CREATE INDEX idx_messages_created ON ai_conversation_messages(created_at);
```

### Optimization Tips

1. **Limit Message History**: Default 10 messages prevents large queries
2. **Cleanup Regularly**: Hourly cleanup removes expired data
3. **Use Metadata**: Store structured data in JSONB for flexible queries
4. **Monitor Slow Queries**: Use Supabase dashboard to identify bottlenecks

## Row Level Security (RLS)

### Service Role Access

The AI microservice uses `service_role` key for full access:

```sql
-- Service role can access all conversations
CREATE POLICY "Allow service role full access to conversations"
ON ai_conversations FOR ALL TO service_role
USING (true) WITH CHECK (true);
```

### User Access

If exposing conversations to frontend users:

```sql
-- Users can only see their own conversations
CREATE POLICY "Users can access own conversations"
ON ai_conversations FOR SELECT TO authenticated
USING (user_id = auth.uid() OR user_id IS NULL);
```

## Backup and Recovery

### Automatic Backups

Supabase Pro includes daily backups. For free tier:

```bash
# Manual backup
pg_dump "$DATABASE_URL" \
  --table=ai_conversations \
  --table=ai_conversation_messages \
  > conversations_backup_$(date +%Y%m%d).sql

# Restore
psql "$DATABASE_URL" < conversations_backup_20251004.sql
```

### Export to JSON

```python
# Export all conversations to JSON
async def export_conversations():
    async with db_service.async_session() as session:
        result = await session.execute(text("""
            SELECT
                c.conversation_id,
                c.created_at,
                json_agg(
                    json_build_object(
                        'role', m.role,
                        'content', m.content,
                        'timestamp', m.created_at
                    ) ORDER BY m.created_at
                ) as messages
            FROM ai_conversations c
            JOIN ai_conversation_messages m
                ON c.conversation_id = m.conversation_id
            GROUP BY c.conversation_id, c.created_at
        """))

        return [dict(row) for row in result]
```

## Migration from In-Memory

If you previously used in-memory storage:

1. Run the SQL schema (see Setup above)
2. Restart AI service (already configured)
3. Old in-memory data will be lost (conversations start fresh)
4. New conversations automatically saved to Supabase

No code changes needed - the conversation manager handles the transition automatically!

## Troubleshooting

### Connection Issues

```bash
# Test database connection
psql "$DATABASE_URL" -c "SELECT COUNT(*) FROM ai_conversations;"
```

### Table Missing

```sql
-- Verify tables exist
\dt ai_*

-- If missing, run schema again
\i docs/schema/conversations.sql
```

### Permission Errors

```sql
-- Check RLS policies
SELECT * FROM pg_policies
WHERE tablename IN ('ai_conversations', 'ai_conversation_messages');

-- If service role has issues, temporarily disable RLS
ALTER TABLE ai_conversations DISABLE ROW LEVEL SECURITY;
ALTER TABLE ai_conversation_messages DISABLE ROW LEVEL SECURITY;
```

### Cleanup Not Running

```bash
# Check cleanup function exists
psql "$DATABASE_URL" -c "\df cleanup_expired_conversations"

# Run manually
psql "$DATABASE_URL" -c "SELECT cleanup_expired_conversations();"
```

## Advanced Features

### Conversation Analytics

```sql
-- Conversation duration analysis
SELECT
    AVG(EXTRACT(EPOCH FROM (updated_at - created_at))/60) as avg_duration_minutes,
    MAX(EXTRACT(EPOCH FROM (updated_at - created_at))/60) as max_duration_minutes
FROM ai_conversations;

-- Peak usage hours
SELECT
    EXTRACT(HOUR FROM created_at) as hour,
    COUNT(*) as conversation_count
FROM ai_conversations
GROUP BY hour
ORDER BY hour;

-- Message type distribution
SELECT
    role,
    COUNT(*) as message_count,
    AVG(LENGTH(content)) as avg_length
FROM ai_conversation_messages
GROUP BY role;
```

### Real-time Subscriptions

Use Supabase Realtime for live conversation updates:

```typescript
// Subscribe to new messages
const subscription = supabase
  .channel('conversation-messages')
  .on(
    'postgres_changes',
    {
      event: 'INSERT',
      schema: 'public',
      table: 'ai_conversation_messages',
      filter: `conversation_id=eq.${conversationId}`
    },
    (payload) => {
      console.log('New message:', payload.new)
    }
  )
  .subscribe()
```

### Conversation Export API

Add to `main.py`:

```python
@app.get("/conversations/{conversation_id}/export")
async def export_conversation(conversation_id: str):
    """Export conversation as JSON."""
    messages = await conversation_manager.get_messages(conversation_id)
    conversation = await conversation_manager.get_conversation(conversation_id)

    return {
        "conversation_id": conversation_id,
        "created_at": conversation["created_at"],
        "updated_at": conversation["updated_at"],
        "messages": messages,
        "metadata": conversation["metadata"]
    }
```

## Best Practices

1. **Set appropriate TTL**: Adjust based on your use case (24h default)
2. **Use metadata**: Store structured data for analytics
3. **Monitor storage**: Check conversation count regularly
4. **Clean up regularly**: Ensure cleanup task is running
5. **Link to users**: Associate conversations with user IDs for better tracking
6. **Index wisely**: Add indexes for your specific query patterns
7. **Backup regularly**: Export important conversations

## Support

For Supabase-specific issues:
- Docs: https://supabase.com/docs/guides/database
- Community: https://discord.supabase.com
