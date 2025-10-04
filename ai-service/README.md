# AI Microservice for Bus Tracking

Python-based AI microservice using GPT models via OpenRouter with autonomous tool calling to query bus status from Supabase.

## 🚀 Quick Start

```bash
# 1. Setup environment
cd ai-service
cp .env.example .env
# Edit .env with your credentials

# 2. Install dependencies
pip install -r requirements.txt

# 3. Setup Supabase tables
# Run SQL from docs/schema/conversations.sql in Supabase SQL Editor

# 4. Run service
uvicorn src.main:app --reload

# 5. Test
curl -X POST http://localhost:8001/query \
  -H "Content-Type: application/json" \
  -d '{"query": "How is line 999?"}'
```

## 📚 Documentation

- **[Complete Setup Guide](docs/README.md)** - Full installation and configuration
- **[Supabase Setup](docs/SUPABASE_SETUP.md)** - Database schema and setup
- **[Conversation Storage](docs/SUPABASE_CONVERSATIONS.md)** - How conversations are stored
- **[Integration Guide](docs/INTEGRATION.md)** - Integrate with your app

## 🎯 Key Features

- **AI-Powered Queries**: Natural language queries about bus lines
- **Autonomous Tool Calling**: AI automatically uses database tools
- **Conversation Memory**: Persistent storage in Supabase
- **Real-time Data**: Query live bus status, delays, and reports
- **Multi-user Support**: User-specific conversation history
- **Production Ready**: Docker deployment, health checks, monitoring

## 🏗️ Architecture

```
User Query → AI Service → OpenRouter LLM → Tool Calling
                ↓                              ↓
         Conversation Storage           Database Queries
                ↓                              ↓
         Supabase Tables              Bus Status Data
```

## 🔧 Configuration

Create `.env` file:

```bash
# OpenRouter
OPENROUTER_API_KEY=sk-or-v1-xxxxx

# Supabase
SUPABASE_URL=https://xxxxx.supabase.co
SUPABASE_KEY=your_supabase_anon_key
DATABASE_URL=postgresql+asyncpg://postgres:[PASSWORD]@db.xxxxx.supabase.co:5432/postgres

# Optional
MODEL_NAME=google/gemma-2-27b-it
CONVERSATION_TTL_HOURS=24
```

## 🐳 Docker Deployment

```bash
# Build and run
docker-compose up -d

# View logs
docker-compose logs -f ai-service

# Stop
docker-compose down
```

## 📊 API Endpoints

### Chat (with history)
```bash
POST /chat
{
  "message": "How is line 999?",
  "conversation_id": "optional-uuid",
  "include_history": true
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

### Health Check
```bash
GET /health
GET /stats
```

## 🧪 Example Usage

### Python
```python
import httpx

async with httpx.AsyncClient() as client:
    response = await client.post(
        "http://localhost:8001/query",
        json={"query": "How is line 999?"}
    )
    print(response.json()["response"])
```

### TypeScript
```typescript
const response = await fetch('http://localhost:8001/chat', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    message: 'Is line 100 delayed?'
  })
});

const data = await response.json();
console.log(data.response);
```

## 🛠️ Available Tools

The AI automatically uses these tools:

1. **get_bus_line_status** - Current status and delays
2. **get_bus_line_delays** - Historical delay statistics
3. **get_recent_reports** - User-submitted reports
4. **check_service_alerts** - Official service alerts
5. **get_alternative_routes** - Alternative routes when delayed

## 📦 Tech Stack

- **FastAPI** - Async web framework
- **OpenRouter** - LLM API gateway
- **Supabase** - PostgreSQL database
- **SQLAlchemy** - Async database ORM
- **Pydantic** - Data validation
- **Docker** - Containerization

## 🤝 Integration

See [INTEGRATION.md](docs/INTEGRATION.md) for:
- React Native integration
- Backend proxy setup
- Docker Compose with main app
- Environment configuration

## 📈 Monitoring

```bash
# Check health
curl http://localhost:8001/health

# View conversation stats
curl http://localhost:8001/stats

# View logs
docker-compose logs -f ai-service
```

## 🧪 Testing

```bash
# Run tests
pytest

# With coverage
pytest --cov=src tests/

# Specific test
pytest tests/test_llm_service.py -v
```

## 📝 License

MIT License - See LICENSE file for details

## 🐛 Troubleshooting

### Can't connect to Supabase
```bash
# Test connection
psql "$DATABASE_URL"

# Verify tables
psql "$DATABASE_URL" -c "\dt ai_*"
```

### OpenRouter errors
- Check API key is valid
- Verify model availability at openrouter.ai
- Monitor rate limits

### Conversations not saving
- Verify conversation tables exist
- Run schema: `docs/schema/conversations.sql`
- Check logs for database errors

## 🔗 Links

- [OpenRouter Models](https://openrouter.ai/models)
- [Supabase Dashboard](https://supabase.com/dashboard)
- [FastAPI Docs](https://fastapi.tiangolo.com)

---

**Built for real-time bus tracking with AI-powered assistance**
