"""Tool definitions for LLM function calling."""
from typing import Dict, Any, List
from datetime import datetime, timedelta
import json


# Tool definitions following OpenAI function calling format
TOOLS = [
    {
        "type": "function",
        "function": {
            "name": "get_bus_status",
            "description": "Get current delay and status information for a specific bus at a station. Returns recent reports from the last hour.",
            "parameters": {
                "type": "object",
                "properties": {
                    "bus_number": {
                        "type": "string",
                        "description": "The bus number (e.g., '999', '100', 'A12')"
                    },
                    "station_id": {
                        "type": "string",
                        "description": "The station ID where the user is waiting"
                    },
                    "route": {
                        "type": "string",
                        "description": "Optional route/line name if mentioned"
                    }
                },
                "required": ["bus_number", "station_id"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "report_bus_delay",
            "description": "Record a user report about bus delay, cancellation, or issue at a station. Use this when user reports an issue like 'Bus 999 is delayed' or 'Bus is late at station XXX'.",
            "parameters": {
                "type": "object",
                "properties": {
                    "bus_number": {
                        "type": "string",
                        "description": "The bus number (e.g., '999', '100')"
                    },
                    "station_id": {
                        "type": "string",
                        "description": "The station ID where the issue is reported"
                    },
                    "route": {
                        "type": "string",
                        "description": "Optional route/line name if mentioned"
                    },
                    "delay": {
                        "type": "integer",
                        "description": "Delay in minutes (if mentioned, otherwise null)"
                    },
                    "issue": {
                        "type": "string",
                        "description": "Issue description: delayed, cancelled, crowded, broken, dirty, etc."
                    }
                },
                "required": ["bus_number", "station_id", "issue"]
            }
        }
    }
]


class ToolExecutor:
    """Execute tool functions and return results."""

    def __init__(self, db_service):
        """Initialize with database service."""
        self.db = db_service

    async def execute_tool(self, tool_name: str, arguments: Dict[str, Any]) -> Dict[str, Any]:
        """Execute a tool function by name."""
        tool_map = {
            "get_bus_status": self.get_bus_status,
            "report_bus_delay": self.report_bus_delay
        }

        if tool_name not in tool_map:
            return {"error": f"Unknown tool: {tool_name}"}

        try:
            result = await tool_map[tool_name](**arguments)
            return result
        except Exception as e:
            return {"error": f"Tool execution failed: {str(e)}"}

    async def get_bus_status(
        self,
        bus_number: str,
        station_id: str,
        route: str = None
    ) -> Dict[str, Any]:
        """Get bus status from recent reports (last hour)."""
        reports = await self.db.get_bus_reports(
            bus_number=bus_number,
            station_id=station_id,
            route=route
        )

        if not reports:
            return {
                "bus_number": bus_number,
                "station_id": station_id,
                "route": route,
                "status": "no_data",
                "message": f"No recent reports for bus {bus_number} at station {station_id}"
            }

        # Calculate average delay
        delays = [r.get("delay", 0) for r in reports if r.get("delay") is not None]
        avg_delay = sum(delays) / len(delays) if delays else 0

        # Get most recent issue
        latest_issue = reports[0].get("issue", "unknown") if reports else "unknown"

        return {
            "bus_number": bus_number,
            "station_id": station_id,
            "route": route,
            "total_reports": len(reports),
            "average_delay_minutes": round(avg_delay, 1),
            "latest_issue": latest_issue,
            "reports": [
                {
                    "bus_number": r.get("bus_number"),
                    "route": r.get("route"),
                    "delay": r.get("delay"),
                    "issue": r.get("issue"),
                    "reported_time": r.get("reported_time")
                }
                for r in reports[:5]  # Return max 5 most recent
            ]
        }

    async def report_bus_delay(
        self,
        bus_number: str,
        station_id: str,
        issue: str,
        route: str = None,
        delay: int = None,
        route_id: int = None,
        user_id: int = None
    ) -> Dict[str, Any]:
        """Record a new bus delay/issue report."""
        success = await self.db.create_bus_report(
            bus_number=bus_number,
            station_id=station_id,
            route=route or (str(route_id) if route_id else None),
            delay=delay,
            issue=issue,
            user_id=user_id or 1
        )

        if success:
            return {
                "success": True,
                "message": f"Report recorded for bus {bus_number} at station {station_id}",
                "bus_number": bus_number,
                "station_id": station_id,
                "route": route,
                "issue": issue,
                "delay": delay
            }
        else:
            return {
                "success": False,
                "error": "Failed to record report"
            }
