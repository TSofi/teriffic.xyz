# Integration Guide: AI Microservice with Bus Tracker App

## Overview

This guide shows how to integrate the AI microservice with your bus tracking application.

## Architecture Integration

```
┌─────────────────────────────────────────┐
│     React Native Mobile App             │
│  ┌────────────────────────────────┐    │
│  │  ChatScreen / AI Assistant     │    │
│  └────────────┬───────────────────┘    │
└───────────────┼────────────────────────┘
                │ HTTP REST
                ▼
┌─────────────────────────────────────────┐
│         API Gateway (Optional)          │
│         - Rate Limiting                 │
│         - Authentication                │
└────────────────┬────────────────────────┘
                 │
                 ▼
┌─────────────────────────────────────────┐
│       AI Microservice (Port 8001)       │
│  - LLM Processing                       │
│  - Tool Calling                         │
│  - Conversation Management              │
└────────────┬────────────────────────────┘
             │
             ▼
┌─────────────────────────────────────────┐
│       Supabase PostgreSQL Database      │
│  - bus_lines, buses, reports, etc.      │
└─────────────────────────────────────────┘
```

## Backend Integration

### Option 1: Direct Integration (Simple)

Your main backend proxies requests to the AI service.

```python
# In your main FastAPI app (e.g., main_api.py)
from fastapi import FastAPI, HTTPException
import httpx

app = FastAPI()

AI_SERVICE_URL = "http://ai-service:8001"  # Docker service name

@app.post("/api/ai/chat")
async def ai_chat(message: str, conversation_id: str = None):
    """Proxy endpoint for AI chat."""
    async with httpx.AsyncClient() as client:
        try:
            response = await client.post(
                f"{AI_SERVICE_URL}/chat",
                json={
                    "message": message,
                    "conversation_id": conversation_id,
                    "include_history": True
                },
                timeout=30.0
            )
            response.raise_for_status()
            return response.json()
        except httpx.HTTPError as e:
            raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/ai/quick-query")
async def ai_quick_query(query: str, line_number: str = None):
    """Quick query without conversation context."""
    async with httpx.AsyncClient() as client:
        try:
            response = await client.post(
                f"{AI_SERVICE_URL}/query",
                json={
                    "query": query,
                    "line_number": line_number
                },
                timeout=15.0
            )
            response.raise_for_status()
            return response.json()
        except httpx.HTTPError as e:
            raise HTTPException(status_code=500, detail=str(e))
```

### Option 2: Message Queue Integration (Advanced)

For better scalability, use a message queue.

```python
# Using RabbitMQ/Redis Queue
import aio_pika
import json

async def send_ai_request(message: str, user_id: str):
    """Send AI request to queue."""
    connection = await aio_pika.connect_robust("amqp://guest:guest@localhost/")

    async with connection:
        channel = await connection.channel()

        await channel.default_exchange.publish(
            aio_pika.Message(
                body=json.dumps({
                    "message": message,
                    "user_id": user_id,
                    "timestamp": datetime.now().isoformat()
                }).encode()
            ),
            routing_key="ai_requests"
        )

# AI Service Queue Consumer
async def consume_ai_requests():
    connection = await aio_pika.connect_robust("amqp://guest:guest@localhost/")

    async with connection:
        channel = await connection.channel()
        queue = await channel.declare_queue("ai_requests")

        async for message in queue:
            async with message.process():
                data = json.loads(message.body.decode())
                # Process with LLM service
                response = await llm_service.chat([
                    {"role": "user", "content": data["message"]}
                ])
                # Send response back via WebSocket or callback
```

## Frontend Integration (React Native)

### Service Layer

```typescript
// src/services/aiService.ts
import axios from 'axios';

const API_URL = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:8000';

interface ChatRequest {
  message: string;
  conversationId?: string;
  includeHistory?: boolean;
}

interface ChatResponse {
  response: string;
  conversation_id: string;
  tool_calls: Array<{
    tool: string;
    arguments: any;
    result: any;
  }>;
  timestamp: string;
}

export const aiService = {
  /**
   * Send a chat message to the AI assistant
   */
  chat: async (request: ChatRequest): Promise<ChatResponse> => {
    const response = await axios.post<ChatResponse>(
      `${API_URL}/api/ai/chat`,
      {
        message: request.message,
        conversation_id: request.conversationId,
        include_history: request.includeHistory ?? true
      }
    );

    return response.data;
  },

  /**
   * Quick query without conversation context
   */
  quickQuery: async (query: string, lineNumber?: string): Promise<string> => {
    const response = await axios.post(
      `${API_URL}/api/ai/quick-query`,
      {
        query,
        line_number: lineNumber
      }
    );

    return response.data.response;
  },

  /**
   * Get conversation history
   */
  getConversation: async (conversationId: string) => {
    const response = await axios.get(
      `${API_URL}/api/ai/conversations/${conversationId}`
    );

    return response.data;
  },

  /**
   * Clear conversation history
   */
  clearConversation: async (conversationId: string) => {
    await axios.post(
      `${API_URL}/api/ai/conversations/${conversationId}/clear`
    );
  }
};
```

### React Native Screen Component

```tsx
// src/screens/AIAssistantScreen.tsx
import React, { useState, useEffect } from 'react';
import {
  View,
  TextInput,
  FlatList,
  TouchableOpacity,
  Text,
  ActivityIndicator
} from 'react-native';
import { aiService } from '../services/aiService';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}

export const AIAssistantScreen = () => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputText, setInputText] = useState('');
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const sendMessage = async () => {
    if (!inputText.trim()) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: inputText,
      timestamp: new Date()
    };

    setMessages(prev => [...prev, userMessage]);
    setInputText('');
    setLoading(true);

    try {
      const response = await aiService.chat({
        message: inputText,
        conversationId: conversationId || undefined,
        includeHistory: true
      });

      const assistantMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: response.response,
        timestamp: new Date(response.timestamp)
      };

      setMessages(prev => [...prev, assistantMessage]);

      if (!conversationId) {
        setConversationId(response.conversation_id);
      }
    } catch (error) {
      console.error('Error sending message:', error);
      // Show error message
    } finally {
      setLoading(false);
    }
  };

  const renderMessage = ({ item }: { item: Message }) => (
    <View
      style={{
        alignSelf: item.role === 'user' ? 'flex-end' : 'flex-start',
        backgroundColor: item.role === 'user' ? '#007AFF' : '#E5E5EA',
        padding: 12,
        borderRadius: 16,
        marginVertical: 4,
        maxWidth: '80%'
      }}
    >
      <Text
        style={{
          color: item.role === 'user' ? 'white' : 'black'
        }}
      >
        {item.content}
      </Text>
    </View>
  );

  return (
    <View style={{ flex: 1, padding: 16 }}>
      <FlatList
        data={messages}
        renderItem={renderMessage}
        keyExtractor={item => item.id}
        inverted={false}
      />

      <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 8 }}>
        <TextInput
          style={{
            flex: 1,
            borderWidth: 1,
            borderColor: '#ccc',
            borderRadius: 20,
            paddingHorizontal: 16,
            paddingVertical: 8,
            marginRight: 8
          }}
          value={inputText}
          onChangeText={setInputText}
          placeholder="Ask about bus lines..."
          editable={!loading}
        />

        <TouchableOpacity
          onPress={sendMessage}
          disabled={loading || !inputText.trim()}
          style={{
            backgroundColor: '#007AFF',
            borderRadius: 20,
            padding: 12
          }}
        >
          {loading ? (
            <ActivityIndicator color="white" />
          ) : (
            <Text style={{ color: 'white' }}>Send</Text>
          )}
        </TouchableOpacity>
      </View>
    </View>
  );
};
```

### Quick Query Component (For Map Screen)

```tsx
// src/components/QuickAIQuery.tsx
import React, { useState } from 'react';
import { View, TextInput, Text, TouchableOpacity } from 'react-native';
import { aiService } from '../services/aiService';

interface Props {
  lineNumber: string;
}

export const QuickAIQuery: React.FC<Props> = ({ lineNumber }) => {
  const [answer, setAnswer] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const askAboutLine = async () => {
    setLoading(true);
    try {
      const response = await aiService.quickQuery(
        `How is line ${lineNumber}?`,
        lineNumber
      );
      setAnswer(response);
    } catch (error) {
      console.error('Error:', error);
      setAnswer('Unable to get information at this time.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={{ padding: 16 }}>
      <TouchableOpacity
        onPress={askAboutLine}
        disabled={loading}
        style={{
          backgroundColor: '#007AFF',
          padding: 12,
          borderRadius: 8
        }}
      >
        <Text style={{ color: 'white', textAlign: 'center' }}>
          {loading ? 'Checking...' : `Ask AI about Line ${lineNumber}`}
        </Text>
      </TouchableOpacity>

      {answer && (
        <View style={{ marginTop: 12, padding: 12, backgroundColor: '#f0f0f0', borderRadius: 8 }}>
          <Text>{answer}</Text>
        </View>
      )}
    </View>
  );
};
```

## Docker Compose Full Stack

```yaml
# docker-compose.yml (Full Stack)
version: '3.8'

services:
  # Main API
  api:
    build: ./backend
    ports:
      - "8000:8000"
    environment:
      - DATABASE_URL=postgresql://user:password@db:5432/bus_tracking
      - AI_SERVICE_URL=http://ai-service:8001
    depends_on:
      - db
      - ai-service
    networks:
      - bus-tracker-network

  # AI Microservice
  ai-service:
    build: ./ai-service
    ports:
      - "8001:8001"
    environment:
      - OPENROUTER_API_KEY=${OPENROUTER_API_KEY}
      - DATABASE_URL=postgresql+asyncpg://user:password@db:5432/bus_tracking
      - REDIS_URL=redis://redis:6379/0
    depends_on:
      - db
      - redis
    networks:
      - bus-tracker-network

networks:
  bus-tracker-network:
    driver: bridge

# Note: Using Supabase hosted database, no local PostgreSQL needed
```

## Testing Integration

```bash
# 1. Start all services
docker-compose up -d

# 2. Test AI service directly
curl -X POST http://localhost:8001/query \
  -H "Content-Type: application/json" \
  -d '{"query": "How is line 999?"}'

# 3. Test via main API
curl -X POST http://localhost:8000/api/ai/chat \
  -H "Content-Type: application/json" \
  -d '{"message": "Is line 100 delayed?"}'

# 4. Test from React Native (use your device IP)
# Update EXPO_PUBLIC_API_URL=http://192.168.1.x:8000
```

## Environment Variables

Create `.env` file in project root:

```bash
# OpenRouter
OPENROUTER_API_KEY=your_key_here

# Supabase
SUPABASE_URL=https://xxxxx.supabase.co
SUPABASE_KEY=your_supabase_anon_key
DATABASE_URL=postgresql+asyncpg://postgres:[PASSWORD]@db.xxxxx.supabase.co:5432/postgres

# API URLs
EXPO_PUBLIC_API_URL=http://localhost:8000

# Conversations
CONVERSATION_TTL_HOURS=24
```

## Monitoring & Debugging

```bash
# View AI service logs
docker-compose logs -f ai-service

# Monitor Supabase queries
# Use Supabase dashboard: Logs → Database

# Check in-memory conversation stats
curl http://localhost:8001/stats

# Health checks
curl http://localhost:8001/health
```

## Performance Optimization

1. **Caching**: Cache frequent queries in Redis
2. **Connection Pooling**: Use SQLAlchemy connection pooling
3. **Request Timeout**: Set appropriate timeouts for LLM calls
4. **Rate Limiting**: Implement rate limiting per user
5. **Async Processing**: Use background tasks for non-urgent queries

## Security Considerations

1. Add authentication to AI endpoints
2. Validate and sanitize all inputs
3. Implement rate limiting
4. Use HTTPS in production
5. Store API keys securely (AWS Secrets Manager, etc.)
6. Add CORS properly configured for your domain

## Next Steps

1. Deploy to production (AWS ECS, Kubernetes, etc.)
2. Set up monitoring (Prometheus, Grafana)
3. Implement analytics tracking
4. Add A/B testing for different models
5. Create admin dashboard for monitoring AI responses
