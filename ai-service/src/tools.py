"""Tool definitions for LLM function calling."""
from typing import Dict, Any, List
from datetime import datetime, timedelta
import json


# Tool definitions following OpenAI function calling format
TOOLS = [
    {
        "type": "function",
        "function": {
            "name": "get_bus_line_status",
            "description": "Get current status and delay information for a specific bus line. Returns real-time data about delays, cancellations, crowding, and recent reports.",
            "parameters": {
                "type": "object",
                "properties": {
                    "line_number": {
                        "type": "string",
                        "description": "The bus line number (e.g., '999', '100', 'A12')"
                    },
                    "include_reports": {
                        "type": "boolean",
                        "description": "Whether to include recent user reports in the response",
                        "default": True
                    }
                },
                "required": ["line_number"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "get_bus_line_delays",
            "description": "Get detailed delay statistics for a bus line over a specific time period.",
            "parameters": {
                "type": "object",
                "properties": {
                    "line_number": {
                        "type": "string",
                        "description": "The bus line number"
                    },
                    "time_range": {
                        "type": "string",
                        "enum": ["1h", "3h", "6h", "12h", "24h", "7d"],
                        "description": "Time range for delay statistics",
                        "default": "6h"
                    }
                },
                "required": ["line_number"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "get_recent_reports",
            "description": "Get recent user-submitted reports for a specific bus line, including delays, cancellations, crowding, and technical issues.",
            "parameters": {
                "type": "object",
                "properties": {
                    "line_number": {
                        "type": "string",
                        "description": "The bus line number"
                    },
                    "report_types": {
                        "type": "array",
                        "items": {
                            "type": "string",
                            "enum": ["delay", "cancelled", "crowded", "technical", "access", "traffic", "other"]
                        },
                        "description": "Filter by specific report types"
                    },
                    "limit": {
                        "type": "integer",
                        "description": "Maximum number of reports to return",
                        "default": 10
                    }
                },
                "required": ["line_number"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "check_service_alerts",
            "description": "Check for official service alerts, planned maintenance, or route changes for a bus line.",
            "parameters": {
                "type": "object",
                "properties": {
                    "line_number": {
                        "type": "string",
                        "description": "The bus line number (optional, if not provided returns all active alerts)"
                    }
                },
                "required": []
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "get_alternative_routes",
            "description": "Get alternative bus routes when a line has severe delays or cancellations.",
            "parameters": {
                "type": "object",
                "properties": {
                    "line_number": {
                        "type": "string",
                        "description": "The affected bus line number"
                    },
                    "origin_stop": {
                        "type": "string",
                        "description": "Starting stop name or ID"
                    },
                    "destination_stop": {
                        "type": "string",
                        "description": "Destination stop name or ID"
                    }
                },
                "required": ["line_number"]
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
            "get_bus_line_status": self.get_bus_line_status,
            "get_bus_line_delays": self.get_bus_line_delays,
            "get_recent_reports": self.get_recent_reports,
            "check_service_alerts": self.check_service_alerts,
            "get_alternative_routes": self.get_alternative_routes
        }

        if tool_name not in tool_map:
            return {"error": f"Unknown tool: {tool_name}"}

        try:
            result = await tool_map[tool_name](**arguments)
            return result
        except Exception as e:
            return {"error": f"Tool execution failed: {str(e)}"}

    async def get_bus_line_status(self, line_number: str, include_reports: bool = True) -> Dict[str, Any]:
        """Get current status for a bus line."""
        # Query database for line status
        status = await self.db.get_line_status(line_number)

        if not status:
            return {
                "line_number": line_number,
                "status": "unknown",
                "message": f"No data found for bus line {line_number}"
            }

        result = {
            "line_number": line_number,
            "status": status.get("operational_status", "operational"),
            "current_delays": status.get("current_delays", []),
            "average_delay_minutes": status.get("avg_delay", 0),
            "active_buses": status.get("active_buses", 0),
            "crowding_level": status.get("crowding_level", "normal"),
            "last_updated": status.get("last_updated", datetime.now().isoformat())
        }

        if include_reports:
            recent_reports = await self.db.get_recent_reports(line_number, limit=5)
            result["recent_reports"] = recent_reports

        return result

    async def get_bus_line_delays(self, line_number: str, time_range: str = "6h") -> Dict[str, Any]:
        """Get delay statistics for a bus line."""
        delays = await self.db.get_delay_statistics(line_number, time_range)

        return {
            "line_number": line_number,
            "time_range": time_range,
            "statistics": {
                "average_delay": delays.get("avg_delay", 0),
                "max_delay": delays.get("max_delay", 0),
                "min_delay": delays.get("min_delay", 0),
                "total_delays": delays.get("total_delays", 0),
                "on_time_percentage": delays.get("on_time_percentage", 100)
            },
            "delay_distribution": delays.get("distribution", [])
        }

    async def get_recent_reports(
        self,
        line_number: str,
        report_types: List[str] = None,
        limit: int = 10
    ) -> Dict[str, Any]:
        """Get recent user reports."""
        reports = await self.db.get_reports(
            line_number=line_number,
            report_types=report_types,
            limit=limit
        )

        return {
            "line_number": line_number,
            "total_reports": len(reports),
            "reports": [
                {
                    "type": r.get("type"),
                    "description": r.get("description"),
                    "severity": r.get("severity"),
                    "timestamp": r.get("timestamp"),
                    "verified": r.get("verified", False),
                    "upvotes": r.get("upvotes", 0)
                }
                for r in reports
            ]
        }

    async def check_service_alerts(self, line_number: str = None) -> Dict[str, Any]:
        """Check for service alerts."""
        alerts = await self.db.get_service_alerts(line_number)

        return {
            "line_number": line_number,
            "alerts": [
                {
                    "type": a.get("type"),
                    "title": a.get("title"),
                    "description": a.get("description"),
                    "severity": a.get("severity"),
                    "start_time": a.get("start_time"),
                    "end_time": a.get("end_time"),
                    "affected_stops": a.get("affected_stops", [])
                }
                for a in alerts
            ]
        }

    async def get_alternative_routes(
        self,
        line_number: str,
        origin_stop: str = None,
        destination_stop: str = None
    ) -> Dict[str, Any]:
        """Get alternative routes."""
        alternatives = await self.db.get_alternative_routes(
            line_number,
            origin_stop,
            destination_stop
        )

        return {
            "original_line": line_number,
            "alternatives": [
                {
                    "line_number": alt.get("line_number"),
                    "estimated_time": alt.get("estimated_time"),
                    "transfers": alt.get("transfers", 0),
                    "distance": alt.get("distance"),
                    "status": alt.get("status", "operational")
                }
                for alt in alternatives
            ]
        }
