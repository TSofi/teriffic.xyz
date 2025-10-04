"""Supabase-based conversation context management."""
from typing import List, Dict, Optional
from datetime import datetime, timedelta
import uuid
import logging
from supabase import Client
import json

logger = logging.getLogger(__name__)


class ConversationManager:
    """Manage conversation history using Supabase client."""

    def __init__(self, supabase_client: Client, ttl_hours: int = 24):
        """
        Initialize conversation manager.

        Args:
            supabase_client: Supabase client instance
            ttl_hours: Time to live for conversations in hours
        """
        self.client = supabase_client
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
        expires_at = (datetime.now() + timedelta(hours=self.ttl_hours)).isoformat()

        try:
            self.client.table('ai_conversations').insert({
                "conversation_id": conversation_id,
                "user_id": user_id,
                "expires_at": expires_at
            }).execute()

            return conversation_id

        except Exception as e:
            logger.error(f"Error creating conversation: {e}")
            raise

    async def get_conversation(self, conversation_id: str) -> Optional[Dict]:
        """Get conversation by ID."""
        try:
            response = self.client.table('ai_conversations')\
                .select('*')\
                .eq('conversation_id', conversation_id)\
                .gt('expires_at', datetime.now().isoformat())\
                .execute()

            if not response.data:
                return None

            conv = response.data[0]
            return {
                "id": conv["conversation_id"],
                "user_id": conv.get("user_id"),
                "metadata": conv.get("metadata", {}),
                "created_at": conv["created_at"],
                "updated_at": conv["updated_at"],
                "expires_at": conv["expires_at"]
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
        try:
            # Check if conversation exists, create if not
            conv = await self.get_conversation(conversation_id)
            if not conv:
                # Create conversation first
                expires_at = (datetime.now() + timedelta(hours=self.ttl_hours)).isoformat()
                self.client.table('ai_conversations').insert({
                    "conversation_id": conversation_id,
                    "expires_at": expires_at
                }).execute()

            # Add message
            self.client.table('ai_conversation_messages').insert({
                "conversation_id": conversation_id,
                "role": role,
                "content": content,
                "metadata": metadata or {}
            }).execute()

            return True

        except Exception as e:
            logger.error(f"Error adding message: {e}")
            return False

    async def get_messages(
        self,
        conversation_id: str,
        limit: Optional[int] = None
    ) -> List[Dict]:
        """Get conversation messages."""
        try:
            query = self.client.table('ai_conversation_messages')\
                .select('*')\
                .eq('conversation_id', conversation_id)\
                .order('created_at', desc=False)

            if limit:
                query = query.limit(limit)

            response = query.execute()

            messages = []
            for msg in response.data or []:
                messages.append({
                    "role": msg["role"],
                    "content": msg["content"],
                    "metadata": msg.get("metadata", {}),
                    "timestamp": msg["created_at"]
                })

            # Get last N messages if limit specified
            if limit and len(messages) > limit:
                messages = messages[-limit:]

            return messages

        except Exception as e:
            logger.error(f"Error getting messages: {e}")
            return []

    async def delete_conversation(self, conversation_id: str) -> bool:
        """Delete a conversation."""
        try:
            self.client.table('ai_conversations')\
                .delete()\
                .eq('conversation_id', conversation_id)\
                .execute()

            return True

        except Exception as e:
            logger.error(f"Error deleting conversation: {e}")
            return False

    async def cleanup_expired(self) -> int:
        """Remove expired conversations. Returns count of removed conversations."""
        try:
            # Get expired conversations
            response = self.client.table('ai_conversations')\
                .select('conversation_id')\
                .lt('expires_at', datetime.now().isoformat())\
                .execute()

            expired_ids = [c['conversation_id'] for c in response.data or []]

            if not expired_ids:
                return 0

            # Delete expired conversations (messages will cascade delete)
            self.client.table('ai_conversations')\
                .delete()\
                .in_('conversation_id', expired_ids)\
                .execute()

            removed_count = len(expired_ids)

            if removed_count > 0:
                logger.info(f"Cleaned up {removed_count} expired conversations")

            return removed_count

        except Exception as e:
            logger.error(f"Error cleaning up conversations: {e}")
            return 0

    async def extend_ttl(self, conversation_id: str, hours: int = None) -> bool:
        """Extend conversation TTL."""
        hours = hours or self.ttl_hours
        new_expires_at = (datetime.now() + timedelta(hours=hours)).isoformat()

        try:
            self.client.table('ai_conversations')\
                .update({"expires_at": new_expires_at})\
                .eq('conversation_id', conversation_id)\
                .execute()

            return True

        except Exception as e:
            logger.error(f"Error extending TTL: {e}")
            return False

    async def get_stats(self) -> Dict:
        """Get conversation manager statistics."""
        try:
            # Get total conversations
            conv_response = self.client.table('ai_conversations').select('conversation_id', count='exact').execute()
            total_conversations = conv_response.count or 0

            # Get total messages
            msg_response = self.client.table('ai_conversation_messages').select('id', count='exact').execute()
            total_messages = msg_response.count or 0

            # Get expired conversations
            expired_response = self.client.table('ai_conversations')\
                .select('conversation_id', count='exact')\
                .lt('expires_at', datetime.now().isoformat())\
                .execute()
            expired_conversations = expired_response.count or 0

            return {
                "total_conversations": total_conversations,
                "total_messages": total_messages,
                "expired_conversations": expired_conversations,
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
        try:
            response = self.client.table('ai_conversations')\
                .select('*')\
                .eq('user_id', user_id)\
                .gt('expires_at', datetime.now().isoformat())\
                .order('updated_at', desc=True)\
                .limit(limit)\
                .execute()

            conversations = []
            for conv in response.data or []:
                conversations.append({
                    "conversation_id": conv["conversation_id"],
                    "created_at": conv["created_at"],
                    "updated_at": conv["updated_at"],
                    "expires_at": conv["expires_at"],
                    "metadata": conv.get("metadata", {})
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
