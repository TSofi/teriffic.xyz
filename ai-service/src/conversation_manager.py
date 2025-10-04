"""Supabase-based conversation context management."""
from typing import List, Dict, Optional
from datetime import datetime, timedelta
import uuid
import logging
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text, delete, select
import json

logger = logging.getLogger(__name__)


class ConversationManager:
    """Manage conversation history using Supabase PostgreSQL."""

    def __init__(self, db_service, ttl_hours: int = 24):
        """
        Initialize conversation manager.

        Args:
            db_service: Database service instance
            ttl_hours: Time to live for conversations in hours
        """
        self.db = db_service
        self.ttl_hours = ttl_hours
        self._cleanup_task = None

    async def start_cleanup_task(self):
        """Start background task to cleanup expired conversations."""
        import asyncio
        if self._cleanup_task is None:
            self._cleanup_task = asyncio.create_task(self._cleanup_loop())

    async def stop_cleanup_task(self):
        """Stop background cleanup task."""
        if self._cleanup_task:
            self._cleanup_task.cancel()
            try:
                await self._cleanup_task
            except asyncio.CancelledError:
                pass
            self._cleanup_task = None

    async def _cleanup_loop(self):
        """Background task to cleanup expired conversations."""
        import asyncio
        while True:
            try:
                await asyncio.sleep(3600)  # Run every hour
                await self.cleanup_expired()
            except asyncio.CancelledError:
                break
            except Exception as e:
                logger.error(f"Error in cleanup loop: {e}")

    async def create_conversation(self, user_id: Optional[str] = None) -> str:
        """Create a new conversation and return ID."""
        conversation_id = str(uuid.uuid4())

        async with self.db.async_session() as session:
            try:
                query = text("""
                    INSERT INTO ai_conversations (conversation_id, user_id, expires_at)
                    VALUES (:conversation_id, :user_id, NOW() + INTERVAL ':ttl_hours hours')
                    RETURNING conversation_id
                """)

                result = await session.execute(
                    query,
                    {
                        "conversation_id": conversation_id,
                        "user_id": user_id,
                        "ttl_hours": self.ttl_hours
                    }
                )
                await session.commit()

                return conversation_id

            except Exception as e:
                logger.error(f"Error creating conversation: {e}")
                await session.rollback()
                raise

    async def get_conversation(self, conversation_id: str) -> Optional[Dict]:
        """Get conversation by ID."""
        async with self.db.async_session() as session:
            try:
                query = text("""
                    SELECT
                        conversation_id,
                        user_id,
                        metadata,
                        created_at,
                        updated_at,
                        expires_at
                    FROM ai_conversations
                    WHERE conversation_id = :conversation_id
                        AND expires_at > NOW()
                """)

                result = await session.execute(
                    query,
                    {"conversation_id": conversation_id}
                )
                row = result.fetchone()

                if not row:
                    return None

                return {
                    "id": row[0],
                    "user_id": row[1],
                    "metadata": row[2] or {},
                    "created_at": row[3],
                    "updated_at": row[4],
                    "expires_at": row[5]
                }

            except Exception as e:
                logger.error(f"Error getting conversation: {e}")
                return None

    async def add_message(
        self,
        conversation_id: str,
        role: str,
        content: str,
        metadata: Optional[Dict] = None
    ) -> bool:
        """Add a message to conversation."""
        async with self.db.async_session() as session:
            try:
                # Check if conversation exists, create if not
                conv = await self.get_conversation(conversation_id)
                if not conv:
                    # Create conversation first
                    create_conv_query = text("""
                        INSERT INTO ai_conversations (conversation_id, expires_at)
                        VALUES (:conversation_id, NOW() + INTERVAL ':ttl_hours hours')
                        ON CONFLICT (conversation_id) DO NOTHING
                    """)
                    await session.execute(
                        create_conv_query,
                        {
                            "conversation_id": conversation_id,
                            "ttl_hours": self.ttl_hours
                        }
                    )

                # Add message
                query = text("""
                    INSERT INTO ai_conversation_messages
                    (conversation_id, role, content, metadata)
                    VALUES (:conversation_id, :role, :content, :metadata)
                """)

                await session.execute(
                    query,
                    {
                        "conversation_id": conversation_id,
                        "role": role,
                        "content": content,
                        "metadata": json.dumps(metadata or {})
                    }
                )

                await session.commit()
                return True

            except Exception as e:
                logger.error(f"Error adding message: {e}")
                await session.rollback()
                return False

    async def get_messages(
        self,
        conversation_id: str,
        limit: Optional[int] = None
    ) -> List[Dict]:
        """Get conversation messages."""
        async with self.db.async_session() as session:
            try:
                limit_clause = f"LIMIT {limit}" if limit else ""

                query = text(f"""
                    SELECT
                        role,
                        content,
                        metadata,
                        created_at
                    FROM ai_conversation_messages
                    WHERE conversation_id = :conversation_id
                    ORDER BY created_at ASC
                    {limit_clause}
                """)

                result = await session.execute(
                    query,
                    {"conversation_id": conversation_id}
                )

                messages = []
                for row in result.fetchall():
                    messages.append({
                        "role": row[0],
                        "content": row[1],
                        "metadata": row[2] or {},
                        "timestamp": row[3].isoformat() if row[3] else None
                    })

                # Apply limit after fetch if needed (get last N messages)
                if limit and len(messages) > limit:
                    messages = messages[-limit:]

                return messages

            except Exception as e:
                logger.error(f"Error getting messages: {e}")
                return []

    async def delete_conversation(self, conversation_id: str) -> bool:
        """Delete a conversation."""
        async with self.db.async_session() as session:
            try:
                query = text("""
                    DELETE FROM ai_conversations
                    WHERE conversation_id = :conversation_id
                """)

                result = await session.execute(
                    query,
                    {"conversation_id": conversation_id}
                )
                await session.commit()

                return result.rowcount > 0

            except Exception as e:
                logger.error(f"Error deleting conversation: {e}")
                await session.rollback()
                return False

    async def cleanup_expired(self) -> int:
        """Remove expired conversations. Returns count of removed conversations."""
        async with self.db.async_session() as session:
            try:
                # Use the stored function
                query = text("SELECT cleanup_expired_conversations()")
                result = await session.execute(query)
                await session.commit()

                removed_count = result.scalar()

                if removed_count and removed_count > 0:
                    logger.info(f"Cleaned up {removed_count} expired conversations")

                return removed_count or 0

            except Exception as e:
                logger.error(f"Error cleaning up conversations: {e}")
                await session.rollback()
                return 0

    async def extend_ttl(self, conversation_id: str, hours: int = None) -> bool:
        """Extend conversation TTL."""
        hours = hours or self.ttl_hours

        async with self.db.async_session() as session:
            try:
                query = text("""
                    UPDATE ai_conversations
                    SET expires_at = NOW() + INTERVAL ':hours hours'
                    WHERE conversation_id = :conversation_id
                """)

                result = await session.execute(
                    query,
                    {"conversation_id": conversation_id, "hours": hours}
                )
                await session.commit()

                return result.rowcount > 0

            except Exception as e:
                logger.error(f"Error extending TTL: {e}")
                await session.rollback()
                return False

    async def get_stats(self) -> Dict:
        """Get conversation manager statistics."""
        async with self.db.async_session() as session:
            try:
                query = text("""
                    SELECT
                        COUNT(DISTINCT c.conversation_id) as total_conversations,
                        COUNT(m.id) as total_messages,
                        COUNT(DISTINCT CASE WHEN c.expires_at < NOW() THEN c.conversation_id END) as expired_conversations
                    FROM ai_conversations c
                    LEFT JOIN ai_conversation_messages m ON c.conversation_id = m.conversation_id
                """)

                result = await session.execute(query)
                row = result.fetchone()

                if row:
                    return {
                        "total_conversations": row[0] or 0,
                        "total_messages": row[1] or 0,
                        "expired_conversations": row[2] or 0,
                        "ttl_hours": self.ttl_hours
                    }

                return {
                    "total_conversations": 0,
                    "total_messages": 0,
                    "expired_conversations": 0,
                    "ttl_hours": self.ttl_hours
                }

            except Exception as e:
                logger.error(f"Error getting stats: {e}")
                return {
                    "error": str(e),
                    "ttl_hours": self.ttl_hours
                }

    async def get_user_conversations(
        self,
        user_id: str,
        limit: int = 10
    ) -> List[Dict]:
        """Get all conversations for a user."""
        async with self.db.async_session() as session:
            try:
                query = text("""
                    SELECT
                        conversation_id,
                        created_at,
                        updated_at,
                        expires_at,
                        metadata
                    FROM ai_conversations
                    WHERE user_id = :user_id
                        AND expires_at > NOW()
                    ORDER BY updated_at DESC
                    LIMIT :limit
                """)

                result = await session.execute(
                    query,
                    {"user_id": user_id, "limit": limit}
                )

                conversations = []
                for row in result.fetchall():
                    conversations.append({
                        "conversation_id": row[0],
                        "created_at": row[1].isoformat() if row[1] else None,
                        "updated_at": row[2].isoformat() if row[2] else None,
                        "expires_at": row[3].isoformat() if row[3] else None,
                        "metadata": row[4] or {}
                    })

                return conversations

            except Exception as e:
                logger.error(f"Error getting user conversations: {e}")
                return []

    def format_for_llm(self, messages: List[Dict]) -> List[Dict[str, str]]:
        """Format messages for LLM API."""
        return [
            {
                "role": msg["role"],
                "content": msg["content"]
            }
            for msg in messages
        ]
