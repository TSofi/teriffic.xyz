# Rewards & Tickets System API

## Database Setup

### 1. Run the Migration

Execute the SQL migration file in your Supabase SQL editor:

```sql
-- File: backend/migrations/rewards_tickets_extension.sql
```

This will:
- Add level tracking columns to the `users` table
- Update the `reports` table to support verification
- Create the `tickets` table
- Add PostgreSQL functions for level calculations
- Set up triggers for automatic level progression

### 2. Verify Installation

Check that the following exist in your database:
- Tables: `users`, `reports`, `tickets`
- Functions: `calculate_level`, `get_reports_for_level`, `get_reward_days`, `activate_ticket`
- Triggers: `update_level_on_verified_report`

## API Endpoints

All endpoints are prefixed with `/api`

### Reports

#### Create Report
```http
POST /api/reports
Content-Type: application/json

{
  "user_id": 1,
  "route": "Route 19",
  "station_id": "STOP123",
  "delay": 15,
  "bus_number": "999",
  "issue": "Traffic jam on Main St",
  "status": "pending"
}
```

Response: `201 Created`
```json
{
  "id": 1,
  "user_id": 1,
  "route": "Route 19",
  "station_id": "STOP123",
  "reported_time": "2025-10-05T10:30:00",
  "delay": 15,
  "bus_number": "999",
  "status": "pending",
  "issue": "Traffic jam on Main St",
  "verified_at": null
}
```

#### Get User Reports
```http
GET /api/reports/user/{user_id}?status_filter=verified
```

Response: `200 OK`
```json
[
  {
    "id": 1,
    "user_id": 1,
    "bus_number": "999",
    "issue": "Traffic jam",
    "status": "verified",
    "reported_time": "2025-10-05T10:30:00",
    "verified_at": "2025-10-05T11:00:00"
  }
]
```

#### Verify Report (Admin)
```http
PATCH /api/reports/{report_id}/verify
```

**Important**: When a report is verified, the system automatically:
1. Increments user's `total_verified_reports`
2. Calculates if user leveled up
3. If leveled up, creates a new ticket
4. Updates user's `current_level`

Response: `200 OK`
```json
{
  "message": "Report verified successfully",
  "report": { /* report object */ }
}
```

#### Reject Report (Admin)
```http
PATCH /api/reports/{report_id}/reject
```

### User Level & Progress

#### Get User Level
```http
GET /api/users/{user_id}/level
```

Response: `200 OK`
```json
{
  "id": 1,
  "email": "user@example.com",
  "current_level": 3,
  "total_verified_reports": 22,
  "points": 220
}
```

#### Get User Progress
```http
GET /api/users/{user_id}/progress
```

Response: `200 OK`
```json
{
  "user_id": 1,
  "current_level": 3,
  "total_verified_reports": 22,
  "reports_for_current_level": 14,
  "current_progress": 2,
  "progress_percentage": 14.29,
  "reward_days": 3,
  "reports_to_next_ticket": 12
}
```

**Level Progression System:**
- Level 1: Requires 10 verified reports
- Level 2: Requires 12 verified reports (10 + 12 = 22 total)
- Level 3: Requires 14 verified reports (10 + 12 + 14 = 36 total)
- Level N: Requires `10 + (N-1) * 2` verified reports

**Reward Days:**
- Levels 1-30: Reward equals level number (Level 5 = 5 days)
- Levels 30+: Capped at 30 days (1 month)

### Tickets

#### Get User Tickets
```http
GET /api/tickets/user/{user_id}
```

Response: `200 OK`
```json
[
  {
    "id": 1,
    "user_id": 1,
    "days": 3,
    "earned_date": "2025-10-05",
    "earned_level": 3,
    "activated_date": null,
    "expiry_date": null,
    "is_active": false,
    "status": "available",
    "created_at": "2025-10-05T11:00:00"
  }
]
```

**Ticket Statuses:**
- `available`: Not yet activated, can be used
- `active`: Currently active and valid
- `expired`: Past expiry date
- `used`: Already consumed

#### Activate Ticket
```http
POST /api/tickets/{ticket_id}/activate
```

Response: `200 OK`
```json
{
  "message": "Ticket activated successfully",
  "ticket": {
    "id": 1,
    "activated_date": "2025-10-05",
    "expiry_date": "2025-10-08",
    "is_active": true,
    "status": "active"
  }
}
```

When activated:
- `activated_date` = today
- `expiry_date` = today + days
- `is_active` = true
- `status` = "active"

#### Cleanup Expired Tickets (Admin)
```http
POST /api/tickets/cleanup-expired
```

Response: `200 OK`
```json
{
  "message": "Updated 5 expired tickets"
}
```

### Statistics

#### Get Leaderboard
```http
GET /api/stats/leaderboard?limit=10
```

Response: `200 OK`
```json
[
  {
    "id": 1,
    "email": "user1@example.com",
    "current_level": 15,
    "total_verified_reports": 250,
    "points": 2500
  },
  {
    "id": 2,
    "email": "user2@example.com",
    "current_level": 12,
    "total_verified_reports": 180,
    "points": 1800
  }
]
```

## Frontend Integration

### Example: Create Report
```typescript
import { rewardsService } from './services/rewardsService';

const createReport = async () => {
  const report = await rewardsService.createReport({
    user_id: 1,
    bus_number: "999",
    issue: "Traffic jam on Main St",
    status: "pending"
  });
  console.log('Report created:', report);
};
```

### Example: Get User Progress
```typescript
const loadProgress = async (userId: number) => {
  const progress = await rewardsService.getUserProgress(userId);

  console.log(`Level ${progress.current_level}`);
  console.log(`${progress.current_progress} / ${progress.reports_for_current_level} reports`);
  console.log(`${progress.reports_to_next_ticket} more to next ticket!`);
};
```

### Example: Activate Ticket
```typescript
const activateMyTicket = async (ticketId: number) => {
  const result = await rewardsService.activateTicket(ticketId);
  console.log(result.message);
  console.log('Valid until:', result.ticket.expiry_date);
};
```

## Testing Workflow

1. **Create a user** (if not exists):
```sql
INSERT INTO users (email) VALUES ('test@example.com') RETURNING id;
```

2. **Create reports**:
```bash
curl -X POST http://localhost:8000/api/reports \
  -H "Content-Type: application/json" \
  -d '{"user_id": 1, "bus_number": "999", "issue": "Test report", "status": "pending"}'
```

3. **Verify reports** (to trigger level up):
```bash
curl -X PATCH http://localhost:8000/api/reports/1/verify
```

4. **Check progress**:
```bash
curl http://localhost:8000/api/users/1/progress
```

5. **Get tickets**:
```bash
curl http://localhost:8000/api/tickets/user/1
```

6. **Activate a ticket**:
```bash
curl -X POST http://localhost:8000/api/tickets/1/activate
```

## Database Functions

### calculate_level(total_reports)
Calculates the current level based on total verified reports.

### get_reports_for_level(level)
Returns how many reports are needed to complete a specific level.

### get_reward_days(level)
Returns the number of reward days for a level (capped at 30).

### activate_ticket(ticket_id)
Activates a ticket and sets the expiry date.

## Automatic Triggers

### update_level_on_verified_report
Automatically fires when a report's status changes to "verified":
1. Updates user's verified report count
2. Calculates new level
3. Creates ticket if level increased
4. Updates user's current level
