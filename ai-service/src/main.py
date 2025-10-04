"""FastAPI main application for AI microservice."""
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
import logging
import uuid
from typing import Optional
from supabase import create_client, Client

from .config import get_settings
from .models import (
    ChatRequest,
    ChatResponse,
    SimpleQueryRequest,
    HealthResponse,
    ToolCall
)
from .llm_service import LLMService
from .db_service import DatabaseService
from .conversation_manager import ConversationManager

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

settings = get_settings()

# Global services
supabase_client: Optional[Client] = None
db_service: Optional[DatabaseService] = None
llm_service: Optional[LLMService] = None
conversation_manager: Optional[ConversationManager] = None


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan manager."""
    global supabase_client, db_service, llm_service, conversation_manager

    # Startup
    logger.info("Starting AI microservice...")

    # Initialize Supabase client (shared across services)
    supabase_client = create_client(settings.supabase_url, settings.supabase_key)
    logger.info(f"Supabase client initialized")

    # Initialize services
    db_service = DatabaseService(settings.supabase_url, settings.supabase_key)
    llm_service = LLMService(db_service)
    conversation_manager = ConversationManager(
        supabase_client=supabase_client,
        ttl_hours=settings.conversation_ttl_hours
    )

    # Start background cleanup task
    await conversation_manager.start_cleanup_task()

    logger.info(f"Using model: {settings.model_name}")
    logger.info(f"Using Supabase at: {settings.supabase_url}")
    logger.info("AI microservice started successfully")

    yield

    # Shutdown
    logger.info("Shutting down AI microservice...")
    await conversation_manager.stop_cleanup_task()


# Create FastAPI app
app = FastAPI(
    title="Bus Tracker AI Assistant",
    description="AI-powered assistant for real-time bus tracking and delay information",
    version="1.0.0",
    lifespan=lifespan
)

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Configure appropriately for production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health", response_model=HealthResponse)
async def health_check():
    """Health check endpoint."""
    return HealthResponse(
        status="healthy",
        version="1.0.0",
        model=settings.model_name
    )


@app.get("/stats")
async def get_stats():
    """Get conversation manager statistics."""
    return await conversation_manager.get_stats()


@app.post("/chat", response_model=ChatResponse)
async def chat(request: ChatRequest):
    """
    Chat endpoint with conversation history support.

    The AI will automatically use tools to query the database for bus line information.
    """
    try:
        # Get or create conversation
        conversation_id = request.conversation_id or str(uuid.uuid4())

        # Build messages
        messages = []

        # Add system prompt
        messages.append({
            "role": "system",
            "content": llm_service.build_system_prompt()
        })

        # Add conversation history if requested
        if request.include_history and request.conversation_id:
            history = await conversation_manager.get_messages(
                request.conversation_id,
                limit=settings.conversation_history_limit
            )
            messages.extend(conversation_manager.format_for_llm(history))

        # Add current message
        messages.append({
            "role": "user",
            "content": request.message
        })

        # Get LLM response
        result = await llm_service.chat(messages)

        # Save conversation
        await conversation_manager.add_message(
            conversation_id,
            "user",
            request.message
        )
        await conversation_manager.add_message(
            conversation_id,
            "assistant",
            result["response"]
        )

        # Format tool calls
        tool_calls = [
            ToolCall(**tc) for tc in result.get("tool_calls", [])
        ]

        return ChatResponse(
            response=result["response"],
            conversation_id=conversation_id,
            tool_calls=tool_calls
        )

    except Exception as e:
        logger.error(f"Error in chat endpoint: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/query")
async def simple_query(request: SimpleQueryRequest):
    """
    Simple query endpoint without conversation history.

    Use this for one-off queries about bus lines.
    """
    try:
        # Build context if line number provided
        context = None
        if request.line_number:
            context = f"The user is asking about bus line {request.line_number}."

        # Get response
        response = await llm_service.simple_query(
            request.query,
            context=context
        )

        return {
            "query": request.query,
            "response": response
        }

    except Exception as e:
        logger.error(f"Error in query endpoint: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/conversations/{conversation_id}/clear")
async def clear_conversation(conversation_id: str):
    """Clear a conversation history."""
    try:
        deleted = await conversation_manager.delete_conversation(conversation_id)

        if not deleted:
            raise HTTPException(status_code=404, detail="Conversation not found")

        return {"message": "Conversation cleared successfully"}

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error clearing conversation: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/conversations/{conversation_id}")
async def get_conversation(conversation_id: str):
    """Get conversation history."""
    try:
        messages = await conversation_manager.get_messages(conversation_id)

        if not messages:
            raise HTTPException(status_code=404, detail="Conversation not found")

        return {
            "conversation_id": conversation_id,
            "messages": messages
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error retrieving conversation: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/")
async def root():
    """Root endpoint."""
    return {
        "service": "Bus Tracker AI Assistant",
        "version": "1.0.0",
        "status": "running",
        "endpoints": {
            "health": "/health",
            "stats": "/stats",
            "chat": "/chat",
            "simple_query": "/query",
            "docs": "/docs"
        }
    }


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(
        "main:app",
        host=settings.api_host,
        port=settings.api_port,
        reload=settings.debug,
        log_level="info"
    )
