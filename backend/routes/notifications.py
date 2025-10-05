from fastapi import APIRouter, Request
from sse_starlette.sse import EventSourceResponse
import asyncio
import json
from datetime import datetime
import random
from collections import defaultdict

router = APIRouter()

# Global notification queues for each user
notification_queues = defaultdict(asyncio.Queue)

async def notify_report_verified(user_id: int):
    """Send notification when report is verified - called from report_verifier.py"""
    notification = {
        "user_id": user_id
    }
    await notification_queues[user_id].put(notification)
    print(f"✓ Notification sent to user {user_id}: Report verified")

# Mock notification data generator
async def generate_mock_notifications(user_id: int):
    """Generate mock notifications for testing"""

    notification_types = [
        {
            "type": "bus_delay",
            "title": "Bus Delayed",
            "messages": [
                "Your bus #999 is delayed by 5 minutes",
                "Bus #704 is running 3 minutes late",
                "Route #111 experiencing delays of 7 minutes"
            ]
        },
        {
            "type": "route_update",
            "title": "Route Update",
            "messages": [
                "Your route has been updated with a faster option",
                "Alternative route available - 10 minutes faster",
                "Traffic cleared on your route"
            ]
        },
        {
            "type": "bus_arrival",
            "title": "Bus Arriving",
            "messages": [
                "Your bus arrives in 2 minutes",
                "Bus #999 is approaching your stop",
                "Next bus in 5 minutes"
            ]
        },
        {
            "type": "service_alert",
            "title": "Service Alert",
            "messages": [
                "Station Hala Targowa closed for maintenance",
                "Route #2 temporarily diverted",
                "Service disruption on Line 999"
            ]
        }
    ]

    while True:
        # Randomly decide if we should send a notification (30% chance every 10 seconds)
        if random.random() < 0.3:
            notification_type = random.choice(notification_types)
            message = random.choice(notification_type["messages"])

            notification = {
                "id": random.randint(1000, 9999),
                "user_id": user_id,
                "type": notification_type["type"],
                "title": notification_type["title"],
                "message": message,
                "timestamp": datetime.now().isoformat(),
                "read": False
            }

            yield notification

        # Wait 10 seconds before next check
        await asyncio.sleep(10)


@router.get("/notifications/stream")
async def notification_stream(request: Request, user_id: int = 1):
    """
    Server-Sent Events endpoint for real-time notifications

    Usage:
    const eventSource = new EventSource('http://localhost:8000/api/notifications/stream?user_id=1');
    eventSource.onmessage = (event) => {
        const notification = JSON.parse(event.data);
        console.log('New notification:', notification);
    };
    """

    async def event_generator():
        try:
            queue = notification_queues[user_id]

            while True:
                # Check if client is still connected
                if await request.is_disconnected():
                    break

                # Wait for notification from queue (with timeout to check connection)
                try:
                    notification = await asyncio.wait_for(queue.get(), timeout=1.0)

                    # Send notification as SSE event
                    yield {
                        "event": "report_verified",
                        "data": json.dumps(notification)
                    }

                except asyncio.TimeoutError:
                    # No notification, continue loop
                    continue

        except asyncio.CancelledError:
            print(f"Client disconnected from notification stream (user_id: {user_id})")
            raise

    return EventSourceResponse(event_generator())


@router.get("/notifications/test")
async def send_test_notification(user_id: int = 1):
    """
    Endpoint to manually trigger a test notification
    Useful for testing the notification system
    """
    test_notification = {
        "id": 9999,
        "user_id": user_id,
        "type": "test",
        "title": "Test Notification",
        "message": "This is a test notification from the backend",
        "timestamp": datetime.now().isoformat(),
        "read": False
    }

    return {
        "message": "Test notification sent",
        "notification": test_notification
    }
