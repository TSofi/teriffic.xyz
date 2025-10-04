"""Tests for LLM service."""
import pytest
from unittest.mock import AsyncMock, MagicMock, patch
from src.llm_service import LLMService
from src.db_service import DatabaseService


@pytest.fixture
def mock_db_service():
    """Create mock database service."""
    db_service = AsyncMock(spec=DatabaseService)

    # Mock line status
    db_service.get_line_status.return_value = {
        "line_number": "999",
        "operational_status": "operational",
        "active_buses": 3,
        "avg_delay": 5.2,
        "crowding_level": "moderate",
        "last_updated": "2025-10-04T10:00:00"
    }

    # Mock recent reports
    db_service.get_recent_reports.return_value = [
        {
            "type": "delay",
            "description": "Bus running 10 minutes late",
            "severity": "moderate",
            "timestamp": "2025-10-04T09:55:00",
            "verified": True,
            "upvotes": 5
        }
    ]

    return db_service


@pytest.fixture
def llm_service(mock_db_service):
    """Create LLM service with mocked dependencies."""
    with patch('src.llm_service.get_settings') as mock_settings:
        mock_settings.return_value.openrouter_api_key = "test-key"
        mock_settings.return_value.openrouter_base_url = "https://openrouter.ai/api/v1"
        mock_settings.return_value.model_name = "test-model"
        mock_settings.return_value.temperature = 0.7
        mock_settings.return_value.max_tokens = 1000
        mock_settings.return_value.top_p = 0.9

        service = LLMService(mock_db_service)
        return service


@pytest.mark.asyncio
async def test_tool_executor_get_bus_line_status(mock_db_service):
    """Test getting bus line status."""
    from src.tools import ToolExecutor

    executor = ToolExecutor(mock_db_service)

    result = await executor.get_bus_line_status("999", include_reports=True)

    assert result["line_number"] == "999"
    assert result["status"] == "operational"
    assert result["active_buses"] == 3
    assert "recent_reports" in result


@pytest.mark.asyncio
async def test_tool_executor_unknown_tool(mock_db_service):
    """Test handling unknown tool."""
    from src.tools import ToolExecutor

    executor = ToolExecutor(mock_db_service)

    result = await executor.execute_tool("unknown_tool", {})

    assert "error" in result
    assert "Unknown tool" in result["error"]


@pytest.mark.asyncio
async def test_simple_query(llm_service):
    """Test simple query without tool calling."""
    with patch.object(llm_service, 'chat', new_callable=AsyncMock) as mock_chat:
        mock_chat.return_value = {
            "response": "Bus line 999 is operational with minor delays.",
            "tool_calls": []
        }

        response = await llm_service.simple_query("How is line 999?")

        assert isinstance(response, str)
        assert "999" in response


def test_system_prompt(llm_service):
    """Test system prompt generation."""
    prompt = llm_service.build_system_prompt()

    assert "bus tracking" in prompt.lower()
    assert "tool" in prompt.lower()
    assert "helpful" in prompt.lower()
