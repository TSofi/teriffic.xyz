"""Supabase client wrapper for additional features."""
from supabase import create_client, Client
from typing import Optional
import logging

logger = logging.getLogger(__name__)


class SupabaseClient:
    """Wrapper for Supabase client with utility methods."""

    def __init__(self, url: str, key: str):
        """Initialize Supabase client."""
        self.url = url
        self.key = key
        self.client: Client = create_client(url, key)
        logger.info(f"Supabase client initialized for {url}")

    def get_client(self) -> Client:
        """Get Supabase client instance."""
        return self.client

    async def test_connection(self) -> bool:
        """Test Supabase connection."""
        try:
            # Try a simple query to test connection
            result = self.client.table('bus_lines').select('id').limit(1).execute()
            return True
        except Exception as e:
            logger.error(f"Supabase connection test failed: {e}")
            return False

    def get_storage(self):
        """Get storage client for file uploads (future use)."""
        return self.client.storage

    def get_auth(self):
        """Get auth client (future use)."""
        return self.client.auth

    def realtime(self, channel: str):
        """Create realtime subscription (future use)."""
        return self.client.channel(channel)
