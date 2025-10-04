# Bus Tracker AI Assistant Microservice

AI-powered microservice for intelligent bus tracking queries using GPT OSS 120B via OpenRouter with autonomous tool calling capabilities.

## 🚀 Features

- **Intelligent Query Processing**: Natural language understanding for bus line queries
- **Automatic Tool Calling**: AI autonomously extracts data from database using function calling
- **Real-time Information**: Access to current bus status, delays, reports, and alerts
- **Conversation Context**: Redis-backed conversation history management
- **Production Ready**: Docker deployment with health checks and monitoring

## 🏗️ Architecture

```
┌─────────────┐
│   Client    │
│ Application │
└──────┬──────┘
       │ HTTP/REST
       ▼
┌─────────────────────────────────────┐
│      FastAPI AI Microservice        │
│  ┌─────────────────────────────┐   │
│  │   LLM Service (OpenRouter)  │   │
│  │   - GPT OSS 120B Model      │   │
│  │   - Tool Calling Logic      │   │
│  └─────────────────────────────┘   │
│  ┌─────────────────────────────┐   │
│  │    Tool Executor            │   │
│  │  - get_bus_line_status      │   │
│  │  - get_bus_line_delays      │   │
│  │  - get_recent_reports       │   │
│  │  - check_service_alerts     │   │
│  │  - get_alternative_routes   │   │
│  └─────────────────────────────┘   │
└────────┬────────────────┬───────────┘
         │                │
         ▼                ▼
   ┌──────────┐    ┌────────────┐
   │PostgreSQL│    │   Redis    │
   │ Database │    │ (Contexts) │
   └──────────┘    └────────────┘
```

## 📦 Installation

### Prerequisites

- Python 3.11+
- Supabase account (free tier works)
- OpenRouter API key

### Setup

1. **Clone and navigate:**
```bash
cd ai-service
```

2. **Create environment file:**
```bash
cp .env.example .env
# Edit .env with your configuration
```

3. **Install dependencies:**
```bash
pip install -r requirements.txt
```

4. **Run the service:**
```bash
uvicorn src.main:app --host 0.0.0.0 --port 8001 --reload
```

## 🐳 Docker Deployment

### Using Docker Compose

1. **Create network:**
```bash
docker network create bus-tracker-network
```

2. **Start services:**
```bash
docker-compose up -d
```

3. **View logs:**
```bash
docker-compose logs -f ai-service
```

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `OPENROUTER_API_KEY` | OpenRouter API key | Required |
| `MODEL_NAME` | LLM model to use | `google/gemma-2-27b-it` |
| `SUPABASE_URL` | Supabase project URL | Required |
| `SUPABASE_KEY` | Supabase anon/public key | Required |
| `DATABASE_URL` | PostgreSQL connection URL | Required |
| `API_PORT` | Service port | `8001` |
| `MAX_TOKENS` | Max response tokens | `1000` |
| `TEMPERATURE` | LLM temperature | `0.7` |
| `CONVERSATION_TTL_HOURS` | Conversation expiry time | `24` |

## 📚 API Endpoints

### Health Check
```bash
GET /health
```

### Chat with Context
```bash
POST /chat
{
  "message": "How is line 999?",
  "conversation_id": "optional-conversation-id",
  "include_history": true
}
```

**Response:**
```json
{
  "response": "Bus line 999 is currently running with minor delays of about 5 minutes. There are 3 active buses on the route.",
  "conversation_id": "uuid",
  "tool_calls": [
    {
      "tool": "get_bus_line_status",
      "arguments": {"line_number": "999"},
      "result": {...}
    }
  ],
  "timestamp": "2025-10-04T10:00:00"
}
```

### Simple Query
```bash
POST /query
{
  "query": "Is line 100 delayed?",
  "line_number": "100"
}
```

### Get Conversation History
```bash
GET /conversations/{conversation_id}
```

### Clear Conversation
```bash
POST /conversations/{conversation_id}/clear
```

## 🛠️ Available Tools

The AI automatically uses these tools to answer queries:

### 1. `get_bus_line_status`
Get current status and delay information for a bus line.

**Parameters:**
- `line_number` (required): Bus line number
- `include_reports` (optional): Include recent reports

### 2. `get_bus_line_delays`
Get detailed delay statistics over a time period.

**Parameters:**
- `line_number` (required): Bus line number
- `time_range` (optional): 1h, 3h, 6h, 12h, 24h, 7d

### 3. `get_recent_reports`
Get recent user-submitted reports.

**Parameters:**
- `line_number` (required): Bus line number
- `report_types` (optional): Filter by types
- `limit` (optional): Max reports to return

### 4. `check_service_alerts`
Check for official service alerts and maintenance.

**Parameters:**
- `line_number` (optional): Specific line or all alerts

### 5. `get_alternative_routes`
Get alternative routes when a line has issues.

**Parameters:**
- `line_number` (required): Affected line
- `origin_stop` (optional): Starting stop
- `destination_stop` (optional): Destination stop

## 💡 Usage Examples

### Example 1: Basic Query
```python
import httpx

async with httpx.AsyncClient() as client:
    response = await client.post(
        "http://localhost:8001/query",
        json={"query": "How is line 999?"}
    )
    print(response.json()["response"])
```

### Example 2: Conversation
```python
import httpx

async with httpx.AsyncClient() as client:
    # First message
    response1 = await client.post(
        "http://localhost:8001/chat",
        json={
            "message": "How is line 999?",
            "include_history": False
        }
    )

    conversation_id = response1.json()["conversation_id"]

    # Follow-up message with context
    response2 = await client.post(
        "http://localhost:8001/chat",
        json={
            "message": "Are there any alternatives?",
            "conversation_id": conversation_id,
            "include_history": True
        }
    )
```

### Example 3: JavaScript/TypeScript
```typescript
const response = await fetch('http://localhost:8001/chat', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    message: 'Is line 100 delayed?',
    include_history: false
  })
});

const data = await response.json();
console.log(data.response);
```

## 🧪 Testing

Run tests with pytest:

```bash
# Install test dependencies
pip install pytest pytest-asyncio pytest-cov

# Run all tests
pytest

# Run with coverage
pytest --cov=src tests/

# Run specific test file
pytest tests/test_llm_service.py -v
```

## 📊 Monitoring

### Health Check
```bash
curl http://localhost:8001/health
```

### Logs
```bash
# Docker logs
docker-compose logs -f ai-service

# Direct logs (if running locally)
tail -f logs/ai-service.log
```

## 🔧 Configuration

### OpenRouter Models

Recommended models (via `MODEL_NAME` env var):

- `google/gemma-2-27b-it` - Balanced performance and cost
- `anthropic/claude-3-sonnet` - High quality responses
- `meta-llama/llama-3.1-70b-instruct` - Open source alternative
- `openai/gpt-4-turbo` - Maximum capability

### Database Schema Requirements

The service expects these tables:
- `bus_lines` - Bus line information
- `buses` - Active bus positions
- `reports` - User reports
- `service_alerts` - Official alerts
- `bus_positions` - Historical positions for statistics

See `docs/SUPABASE_SETUP.md` for full setup guide and schema.

## 🚀 Integration

### Integrate with Main App

```python
# In your main FastAPI app
import httpx

async def get_ai_response(user_query: str) -> str:
    async with httpx.AsyncClient() as client:
        response = await client.post(
            "http://ai-service:8001/query",
            json={"query": user_query}
        )
        return response.json()["response"]

@app.get("/ask")
async def ask_ai(question: str):
    answer = await get_ai_response(question)
    return {"answer": answer}
```

### React Native Integration

```typescript
// services/aiService.ts
export const askAI = async (message: string, conversationId?: string) => {
  const response = await fetch(`${AI_SERVICE_URL}/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      message,
      conversation_id: conversationId,
      include_history: !!conversationId
    })
  });

  return response.json();
};
```

## 🔐 Security

- Always use HTTPS in production
- Implement rate limiting
- Validate and sanitize inputs
- Store API keys in secure vaults
- Use proper CORS configuration
- Implement authentication/authorization

## 📝 License

MIT License - See LICENSE file for details

## 🤝 Contributing

1. Fork the repository
2. Create feature branch
3. Write tests for new features
4. Ensure all tests pass
5. Submit pull request

## 💬 Conversation Storage

Conversations are now stored in Supabase PostgreSQL tables:
- **Persistent**: Survives service restarts
- **Scalable**: Shared across multiple instances
- **Multi-user**: Support for user-specific conversations
- **Analytics**: Query conversation history

See `docs/SUPABASE_CONVERSATIONS.md` for detailed guide.

## 🐛 Troubleshooting

### Common Issues

**1. OpenRouter API errors:**
- Verify API key is correct
- Check model availability
- Monitor rate limits

**2. Supabase connection issues:**
- Verify Supabase URL and key
- Check database password
- Test connection: `psql $DATABASE_URL`
- Ensure IP is whitelisted (if using connection pooler)

**3. Conversation storage issues:**
- Verify conversation tables exist: `SELECT * FROM ai_conversations;`
- Check conversation stats: `curl http://localhost:8001/stats`
- Run manual cleanup: See `docs/SUPABASE_CONVERSATIONS.md`

**4. Tool calling not working:**
- Check database schema matches expectations
- Verify tool definitions in `tools.py`
- Review LLM service logs

## 📞 Support

For issues and questions:
- GitHub Issues: [repository]/issues
- Documentation: [repository]/docs
- Email: support@example.com
