"""Tests for API endpoints."""
import pytest
from httpx import AsyncClient
from unittest.mock import AsyncMock, patch
from src.main import app


@pytest.fixture
async def client():
    """Create test client."""
    async with AsyncClient(app=app, base_url="http://test") as client:
        yield client


@pytest.mark.asyncio
async def test_health_check(client):
    """Test health check endpoint."""
    response = await client.get("/health")

    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "healthy"
    assert "model" in data


@pytest.mark.asyncio
async def test_root_endpoint(client):
    """Test root endpoint."""
    response = await client.get("/")

    assert response.status_code == 200
    data = response.json()
    assert data["service"] == "Bus Tracker AI Assistant"
    assert "endpoints" in data


@pytest.mark.asyncio
async def test_chat_endpoint(client):
    """Test chat endpoint."""
    with patch('src.main.llm_service') as mock_llm:
        mock_llm.chat = AsyncMock(return_value={
            "response": "Line 999 is running normally.",
            "tool_calls": []
        })
        mock_llm.build_system_prompt.return_value = "System prompt"

        with patch('src.main.conversation_manager') as mock_conv:
            mock_conv.get_messages = AsyncMock(return_value=[])
            mock_conv.add_message = AsyncMock(return_value=True)

            response = await client.post(
                "/chat",
                json={
                    "message": "How is line 999?",
                    "include_history": False
                }
            )

            assert response.status_code == 200
            data = response.json()
            assert "response" in data
            assert "conversation_id" in data


@pytest.mark.asyncio
async def test_simple_query_endpoint(client):
    """Test simple query endpoint."""
    with patch('src.main.llm_service') as mock_llm:
        mock_llm.simple_query = AsyncMock(
            return_value="Line 999 is operational."
        )

        response = await client.post(
            "/query",
            json={
                "query": "Is line 999 running?",
                "line_number": "999"
            }
        )

        assert response.status_code == 200
        data = response.json()
        assert "response" in data
        assert "query" in data
