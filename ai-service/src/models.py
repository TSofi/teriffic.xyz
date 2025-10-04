"""Pydantic models for API requests and responses."""
from pydantic import BaseModel, Field
from typing import List, Dict, Any, Optional
from datetime import datetime


class Message(BaseModel):
    """Chat message model."""
    role: str = Field(..., description="Message role: user, assistant, or system")
    content: str = Field(..., description="Message content")


class ChatRequest(BaseModel):
    """Request model for chat endpoint."""
    message: str = Field(..., description="User message")
    conversation_id: Optional[str] = Field(None, description="Conversation ID for context")
    include_history: bool = Field(True, description="Include conversation history")


class SimpleQueryRequest(BaseModel):
    """Request model for simple query endpoint."""
    query: str = Field(..., description="User query")
    line_number: Optional[str] = Field(None, description="Optional bus line number for context")


class ToolCall(BaseModel):
    """Tool call information."""
    tool: str
    arguments: Dict[str, Any]
    result: Dict[str, Any]


class ChatResponse(BaseModel):
    """Response model for chat endpoint."""
    response: str = Field(..., description="AI assistant response")
    conversation_id: str = Field(..., description="Conversation ID")
    tool_calls: List[ToolCall] = Field(default_factory=list, description="Tools called during processing")
    timestamp: datetime = Field(default_factory=datetime.now)


class HealthResponse(BaseModel):
    """Health check response."""
    status: str
    version: str
    model: str
    timestamp: datetime = Field(default_factory=datetime.now)


class ConversationHistory(BaseModel):
    """Conversation history model."""
    conversation_id: str
    messages: List[Message]
    created_at: datetime
    updated_at: datetime


class TranscribeRequest(BaseModel):
    """Request model for audio transcription."""
    audio_base64: str = Field(..., description="Base64 encoded audio file")


class TranscribeResponse(BaseModel):
    """Response model for audio transcription."""
    text: str = Field(..., description="Transcribed text")
    success: bool = Field(..., description="Success status")
