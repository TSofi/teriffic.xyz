# Supabase Setup Guide for AI Microservice

## Overview

This AI microservice uses Supabase as its PostgreSQL database backend. This guide covers setup, configuration, and schema requirements.

## Prerequisites

- Supabase account (free tier is sufficient)
- Project created in Supabase dashboard

## Quick Setup

### 1. Get Supabase Credentials

From your Supabase project dashboard:

1. Go to **Settings** → **API**
2. Copy the following:
   - **Project URL**: `https://xxxxx.supabase.co`
   - **Anon/Public Key**: Your public API key
   - **Database Password**: From Settings → Database

### 2. Configure Environment Variables

Create `.env` file in `ai-service/` directory:

```bash
# OpenRouter Configuration
OPENROUTER_API_KEY=sk-or-v1-xxxxx

# Supabase Configuration
SUPABASE_URL=https://xxxxx.supabase.co
SUPABASE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.xxxxx
DATABASE_URL=postgresql+asyncpg://postgres:[YOUR-PASSWORD]@db.xxxxx.supabase.co:5432/postgres

# API Configuration
API_HOST=0.0.0.0
API_PORT=8001
DEBUG=true

# LLM Configuration
MODEL_NAME=google/gemma-2-27b-it
MAX_TOKENS=1000
TEMPERATURE=0.7
CONVERSATION_TTL_HOURS=24
```

### 3. Database Schema

The AI microservice expects the following tables in your Supabase database:

**IMPORTANT**: Also run the conversation storage schema:
```bash
# In Supabase SQL Editor, run:
ai-service/docs/schema/conversations.sql
```

This creates the `ai_conversations` and `ai_conversation_messages` tables for conversation history.

---

#### Required Tables

```sql
-- Bus Lines
CREATE TABLE IF NOT EXISTS bus_lines (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    line_number VARCHAR(20) NOT NULL UNIQUE,
    line_name VARCHAR(255),
    operational_status VARCHAR(50) DEFAULT 'operational',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Buses (Active vehicles)
CREATE TABLE IF NOT EXISTS buses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    line_id UUID REFERENCES bus_lines(id) ON DELETE CASCADE,
    bus_identifier VARCHAR(50),
    latitude DECIMAL(10, 8),
    longitude DECIMAL(11, 8),
    delay_minutes INTEGER DEFAULT 0,
    crowding_level VARCHAR(20) DEFAULT 'normal',
    last_updated TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- User Reports
CREATE TABLE IF NOT EXISTS reports (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    bus_id UUID REFERENCES buses(id) ON DELETE CASCADE,
    user_id UUID,
    type VARCHAR(50) NOT NULL,
    description TEXT,
    severity VARCHAR(20),
    photo_url TEXT,
    verified BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Report Votes
CREATE TABLE IF NOT EXISTS report_votes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    report_id UUID REFERENCES reports(id) ON DELETE CASCADE,
    user_id UUID,
    vote_type VARCHAR(20) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(report_id, user_id)
);

-- Service Alerts
CREATE TABLE IF NOT EXISTS service_alerts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    line_number VARCHAR(20),
    type VARCHAR(50) NOT NULL,
    title VARCHAR(255) NOT NULL,
    description TEXT,
    severity VARCHAR(20) NOT NULL,
    start_time TIMESTAMP WITH TIME ZONE NOT NULL,
    end_time TIMESTAMP WITH TIME ZONE,
    affected_stops JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Bus Positions (Historical data for statistics)
CREATE TABLE IF NOT EXISTS bus_positions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    line_id UUID REFERENCES bus_lines(id) ON DELETE CASCADE,
    bus_id UUID REFERENCES buses(id) ON DELETE CASCADE,
    latitude DECIMAL(10, 8),
    longitude DECIMAL(11, 8),
    delay_minutes INTEGER DEFAULT 0,
    timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX idx_buses_line_id ON buses(line_id);
CREATE INDEX idx_buses_last_updated ON buses(last_updated);
CREATE INDEX idx_reports_bus_id ON reports(bus_id);
CREATE INDEX idx_reports_created_at ON reports(created_at);
CREATE INDEX idx_bus_positions_line_id ON bus_positions(line_id);
CREATE INDEX idx_bus_positions_timestamp ON bus_positions(timestamp);
CREATE INDEX idx_service_alerts_line ON service_alerts(line_number);
CREATE INDEX idx_service_alerts_dates ON service_alerts(start_time, end_time);
```

### 4. Run SQL in Supabase

1. Go to **SQL Editor** in Supabase dashboard
2. Create a new query
3. Paste the schema SQL above
4. Click **Run** to create tables

### 5. Enable Row Level Security (Optional, Recommended)

```sql
-- Enable RLS on tables
ALTER TABLE bus_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE buses ENABLE ROW LEVEL SECURITY;
ALTER TABLE reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE service_alerts ENABLE ROW LEVEL SECURITY;

-- Allow public read access (adjust based on your needs)
CREATE POLICY "Allow public read on bus_lines" ON bus_lines
    FOR SELECT USING (true);

CREATE POLICY "Allow public read on buses" ON buses
    FOR SELECT USING (true);

CREATE POLICY "Allow public read on reports" ON reports
    FOR SELECT USING (true);

CREATE POLICY "Allow public read on service_alerts" ON service_alerts
    FOR SELECT USING (true);
```

## Testing Connection

### Test Database Connection

```bash
# Install dependencies
pip install -r requirements.txt

# Test connection
python -c "
from src.config import get_settings
from src.db_service import DatabaseService
import asyncio

async def test():
    settings = get_settings()
    db = DatabaseService(settings.database_url)
    result = await db.get_line_status('999')
    print('Connection successful:', result)

asyncio.run(test())
"
```

### Test AI Service

```bash
# Start the service
uvicorn src.main:app --reload

# Test query
curl -X POST http://localhost:8001/query \
  -H "Content-Type: application/json" \
  -d '{"query": "How is line 999?"}'
```

## Seed Data (Optional)

Add sample data for testing:

```sql
-- Sample bus lines
INSERT INTO bus_lines (line_number, line_name, operational_status) VALUES
('999', 'Downtown Express', 'operational'),
('100', 'City Center Loop', 'operational'),
('A12', 'Airport Shuttle', 'delayed');

-- Sample buses
INSERT INTO buses (line_id, bus_identifier, latitude, longitude, delay_minutes, crowding_level)
SELECT
    bl.id,
    'BUS-' || bl.line_number || '-' || generate_series,
    52.2297 + (random() * 0.1 - 0.05),
    21.0122 + (random() * 0.1 - 0.05),
    floor(random() * 15)::INTEGER,
    CASE floor(random() * 3)::INTEGER
        WHEN 0 THEN 'low'
        WHEN 1 THEN 'normal'
        ELSE 'high'
    END
FROM bus_lines bl
CROSS JOIN generate_series(1, 3);

-- Sample reports
INSERT INTO reports (bus_id, type, description, severity, verified)
SELECT
    b.id,
    CASE floor(random() * 4)::INTEGER
        WHEN 0 THEN 'delay'
        WHEN 1 THEN 'crowded'
        WHEN 2 THEN 'cancelled'
        ELSE 'technical'
    END,
    'Sample report for testing',
    CASE floor(random() * 3)::INTEGER
        WHEN 0 THEN 'minor'
        WHEN 1 THEN 'moderate'
        ELSE 'major'
    END,
    random() > 0.5
FROM buses b
LIMIT 10;

-- Sample service alert
INSERT INTO service_alerts (line_number, type, title, description, severity, start_time, end_time)
VALUES (
    '999',
    'delay',
    'Construction Detour',
    'Line 999 experiencing delays due to road construction on Main Street',
    'moderate',
    NOW(),
    NOW() + INTERVAL '2 hours'
);
```

## Supabase Features

### Real-time Subscriptions (Future Enhancement)

```python
# Example: Listen to real-time updates
from src.supabase_client import SupabaseClient

supabase = SupabaseClient(settings.supabase_url, settings.supabase_key)

# Subscribe to bus position updates
channel = supabase.realtime('bus-positions')
channel.on('postgres_changes', {
    'event': 'INSERT',
    'schema': 'public',
    'table': 'bus_positions'
}, lambda payload: print(f"New position: {payload}"))

channel.subscribe()
```

### Storage (For Report Photos)

```python
# Upload report photo to Supabase Storage
storage = supabase.get_storage()

# Create bucket if not exists
storage.create_bucket('report-photos', public=True)

# Upload file
with open('photo.jpg', 'rb') as f:
    storage.from_('report-photos').upload(
        file=f,
        path=f'reports/{report_id}.jpg'
    )
```

### Edge Functions (Advanced)

Deploy serverless functions for custom logic:

```typescript
// supabase/functions/process-report/index.ts
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'

serve(async (req) => {
  const { reportId } = await req.json()

  // Custom report processing logic
  // Auto-verify reports, send notifications, etc.

  return new Response(JSON.stringify({ success: true }))
})
```

## Performance Optimization

### Database Indexes

Already included in schema, but monitor query performance:

```sql
-- Check slow queries
SELECT * FROM pg_stat_statements
ORDER BY mean_exec_time DESC
LIMIT 10;
```

### Connection Pooling

The service uses SQLAlchemy's async connection pooling:

```python
# Already configured in db_service.py
engine = create_async_engine(
    database_url,
    echo=False,
    pool_size=20,        # Adjust based on load
    max_overflow=10,
    pool_pre_ping=True   # Verify connections
)
```

### Caching Strategy

Since Redis is not used, implement application-level caching:

```python
from functools import lru_cache
from datetime import datetime, timedelta

# Cache frequently accessed data
@lru_cache(maxsize=100)
def get_cached_line_status(line_number: str, minute: int):
    # minute parameter ensures cache expires every minute
    return db_service.get_line_status(line_number)

# Usage
current_minute = datetime.now().minute
status = get_cached_line_status("999", current_minute)
```

## Monitoring

### Enable Supabase Logs

1. Go to **Logs** in Supabase dashboard
2. Monitor:
   - Database queries
   - API requests
   - Performance metrics

### Custom Logging

```python
# Add to main.py for request logging
from fastapi import Request
import time

@app.middleware("http")
async def log_requests(request: Request, call_next):
    start_time = time.time()
    response = await call_next(request)
    duration = time.time() - start_time

    logger.info(f"{request.method} {request.url.path} - {duration:.2f}s")
    return response
```

## Security Best Practices

1. **Never commit `.env` file** - Use `.env.example` for templates
2. **Use environment variables** in production
3. **Enable RLS policies** for user-specific data
4. **Rotate API keys** regularly
5. **Use HTTPS only** in production
6. **Implement rate limiting** at API level

## Backup and Recovery

### Automated Backups

Supabase Pro includes automated daily backups. For free tier:

```bash
# Manual backup script
pg_dump $DATABASE_URL > backup_$(date +%Y%m%d).sql

# Restore
psql $DATABASE_URL < backup_20251004.sql
```

### Export Data

```sql
-- Export to CSV
COPY (SELECT * FROM reports WHERE created_at > NOW() - INTERVAL '7 days')
TO '/tmp/reports.csv' WITH CSV HEADER;
```

## Troubleshooting

### Connection Issues

```bash
# Test direct connection
psql "postgresql://postgres:[PASSWORD]@db.xxxxx.supabase.co:5432/postgres"

# Check if firewall allows port 5432
telnet db.xxxxx.supabase.co 5432
```

### Schema Issues

```sql
-- Verify tables exist
SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public';

-- Check table structure
\d bus_lines
```

### Performance Issues

```sql
-- Analyze query performance
EXPLAIN ANALYZE
SELECT * FROM reports WHERE created_at > NOW() - INTERVAL '6 hours';

-- Update statistics
ANALYZE reports;
```

## Migration from Other Databases

If migrating from another PostgreSQL database:

```bash
# Export from old database
pg_dump old_database_url > export.sql

# Import to Supabase
psql $DATABASE_URL < export.sql
```

## Additional Resources

- [Supabase Documentation](https://supabase.com/docs)
- [PostgreSQL Async Best Practices](https://docs.sqlalchemy.org/en/20/orm/extensions/asyncio.html)
- [FastAPI + Supabase Guide](https://supabase.com/docs/guides/getting-started/tutorials/with-fastapi)

## Support

For Supabase-specific issues:
- Community: [Supabase Discord](https://discord.supabase.com)
- GitHub: [Supabase Issues](https://github.com/supabase/supabase/issues)
- Docs: [supabase.com/docs](https://supabase.com/docs)
