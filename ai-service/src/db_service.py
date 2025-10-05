"""Database service using Supabase client."""
from typing import List, Dict, Any, Optional
from datetime import datetime, timedelta
from supabase import create_client, Client
import logging

logger = logging.getLogger(__name__)


class DatabaseService:
    """Service for database operations using Supabase client."""

    def __init__(self, supabase_url: str, supabase_key: str):
        """Initialize Supabase client."""
        self.client: Client = create_client(supabase_url, supabase_key)
        logger.info(f"Supabase client initialized for {supabase_url}")

    async def get_bus_reports(
        self,
        bus_number: str,
        station_id: str,
        route: Optional[str] = None
    ) -> List[Dict[str, Any]]:
        """
        Get recent bus reports from the last hour for a specific bus and station.

        Args:
            bus_number: Bus number (e.g., '999')
            station_id: Station ID
            route: Optional route/line name

        Returns:
            List of recent reports within last hour
        """
        try:
            # Get reports from last hour (use UTC timezone-aware datetime)
            from datetime import timezone
            one_hour_ago = (datetime.now(timezone.utc) - timedelta(hours=1)).isoformat()

            # Build query with case-insensitive matching
            query = self.client.table('reports')\
                .select('*')\
                .ilike('bus_number', bus_number)\
                .ilike('station_id', station_id)\
                .gte('reported_time', one_hour_ago)\
                .order('reported_time', desc=True)

            # Add route filter if specified (case-insensitive)
            if route:
                query = query.ilike('route', route)

            response = query.execute()

            return response.data or []

        except Exception as e:
            logger.error(f"Error fetching bus reports: {e}")
            return []

    async def create_bus_report(
        self,
        bus_number: str,
        station_id: str,
        issue: str,
        route: Optional[str] = None,
        delay: Optional[int] = None,
        user_id: int = 1  # Default user_id, should be replaced with actual user auth
    ) -> bool:
        """
        Create a new bus report in the reports table.

        Args:
            bus_number: Bus number (e.g., '999')
            station_id: Station ID
            issue: Issue description (delayed, cancelled, crowded, etc.)
            route: Optional route/line name
            delay: Optional delay in minutes
            user_id: User ID (default 1 for anonymous)

        Returns:
            True if successful, False otherwise
        """
        try:
            # Use UTC timezone-aware datetime
            from datetime import timezone
            data = {
                "user_id": user_id,
                "bus_number": bus_number,
                "station_id": station_id,
                "issue": issue,
                "reported_time": datetime.now(timezone.utc).isoformat()
            }

            if route:
                data["route"] = route

            if delay is not None:
                data["delay"] = delay

            response = self.client.table('reports').insert(data).execute()

            logger.info(f"Report created: bus_number={bus_number}, station={station_id}, issue={issue}")
            return True

        except Exception as e:
            logger.error(f"Error creating bus report: {e}")
            return False

    async def get_line_status(self, line_number: str) -> Optional[Dict[str, Any]]:
        """Get current operational status for a bus line."""
        try:
            # Get line info
            line_response = self.client.table('bus_lines').select('*').eq('line_number', line_number).execute()

            if not line_response.data:
                return None

            line = line_response.data[0]

            # Get active buses for this line
            buses_response = self.client.table('buses')\
                .select('*')\
                .eq('line_id', line['id'])\
                .gte('last_updated', (datetime.now() - timedelta(minutes=30)).isoformat())\
                .execute()

            buses = buses_response.data or []

            # Calculate statistics
            active_buses = len(buses)
            avg_delay = sum(b.get('delay_minutes', 0) for b in buses) / max(active_buses, 1)
            max_crowding = max((b.get('crowding_level', 'normal') for b in buses), default='normal')

            return {
                "line_number": line_number,
                "operational_status": line.get("operational_status", "operational"),
                "active_buses": active_buses,
                "avg_delay": float(avg_delay),
                "crowding_level": max_crowding,
                "last_updated": datetime.now().isoformat()
            }

        except Exception as e:
            logger.error(f"Error fetching line status: {e}")
            return None

    async def get_recent_reports(
        self,
        line_number: str,
        limit: int = 5
    ) -> List[Dict[str, Any]]:
        """Get recent user reports for a line."""
        try:
            # Get line ID first
            line_response = self.client.table('bus_lines').select('id').eq('line_number', line_number).execute()

            if not line_response.data:
                return []

            line_id = line_response.data[0]['id']

            # Get recent reports
            six_hours_ago = (datetime.now() - timedelta(hours=6)).isoformat()

            reports_response = self.client.table('reports')\
                .select('*, buses!inner(line_id), report_votes(count)')\
                .eq('buses.line_id', line_id)\
                .gte('created_at', six_hours_ago)\
                .order('created_at', desc=True)\
                .limit(limit)\
                .execute()

            reports = []
            for r in reports_response.data or []:
                reports.append({
                    "type": r.get("type"),
                    "description": r.get("description"),
                    "severity": r.get("severity"),
                    "timestamp": r.get("created_at"),
                    "verified": r.get("verified", False),
                    "upvotes": len(r.get("report_votes", []))
                })

            return reports

        except Exception as e:
            logger.error(f"Error fetching recent reports: {e}")
            return []

    async def get_delay_statistics(
        self,
        line_number: str,
        time_range: str = "6h"
    ) -> Dict[str, Any]:
        """Get delay statistics for a time range."""
        time_mapping = {
            "1h": 1, "3h": 3, "6h": 6, "12h": 12, "24h": 24, "7d": 168
        }
        hours = time_mapping.get(time_range, 6)

        try:
            # Get line ID
            line_response = self.client.table('bus_lines').select('id').eq('line_number', line_number).execute()

            if not line_response.data:
                return {}

            line_id = line_response.data[0]['id']

            # Get positions within time range
            time_ago = (datetime.now() - timedelta(hours=hours)).isoformat()

            positions_response = self.client.table('bus_positions')\
                .select('delay_minutes')\
                .eq('line_id', line_id)\
                .gte('timestamp', time_ago)\
                .execute()

            positions = positions_response.data or []

            if not positions:
                return {
                    "avg_delay": 0,
                    "max_delay": 0,
                    "min_delay": 0,
                    "total_delays": 0,
                    "on_time_percentage": 100
                }

            delays = [p['delay_minutes'] for p in positions]
            on_time = sum(1 for d in delays if d <= 2)

            return {
                "avg_delay": sum(delays) / len(delays),
                "max_delay": max(delays),
                "min_delay": min(delays),
                "total_delays": len(delays),
                "on_time_percentage": (on_time / len(delays)) * 100
            }

        except Exception as e:
            logger.error(f"Error fetching delay statistics: {e}")
            return {}

    async def get_reports(
        self,
        line_number: str,
        report_types: Optional[List[str]] = None,
        limit: int = 10
    ) -> List[Dict[str, Any]]:
        """Get reports with optional type filtering."""
        try:
            # Get line ID
            line_response = self.client.table('bus_lines').select('id').eq('line_number', line_number).execute()

            if not line_response.data:
                return []

            line_id = line_response.data[0]['id']

            # Build query
            query = self.client.table('reports')\
                .select('*, buses!inner(line_id), report_votes(count)')\
                .eq('buses.line_id', line_id)\
                .order('created_at', desc=True)\
                .limit(limit)

            # Add type filter if specified
            if report_types:
                query = query.in_('type', report_types)

            reports_response = query.execute()

            reports = []
            for r in reports_response.data or []:
                reports.append({
                    "type": r.get("type"),
                    "description": r.get("description"),
                    "severity": r.get("severity"),
                    "timestamp": r.get("created_at"),
                    "verified": r.get("verified", False),
                    "upvotes": len(r.get("report_votes", []))
                })

            return reports

        except Exception as e:
            logger.error(f"Error fetching reports: {e}")
            return []

    async def get_service_alerts(
        self,
        line_number: Optional[str] = None
    ) -> List[Dict[str, Any]]:
        """Get active service alerts."""
        try:
            query = self.client.table('service_alerts')\
                .select('*')\
                .lte('start_time', datetime.now().isoformat())\
                .order('severity', desc=True)\
                .order('start_time', desc=True)

            # Filter by line if specified
            if line_number:
                query = query.or_(f'line_number.eq.{line_number},line_number.is.null')

            # Only active alerts (end_time is null or in future)
            alerts_response = query.execute()

            alerts = []
            for a in alerts_response.data or []:
                end_time = a.get('end_time')
                if end_time is None or datetime.fromisoformat(end_time.replace('Z', '+00:00')) >= datetime.now():
                    alerts.append({
                        "type": a.get("type"),
                        "title": a.get("title"),
                        "description": a.get("description"),
                        "severity": a.get("severity"),
                        "start_time": a.get("start_time"),
                        "end_time": end_time,
                        "affected_stops": a.get("affected_stops", [])
                    })

            return alerts

        except Exception as e:
            logger.error(f"Error fetching service alerts: {e}")
            return []

    async def get_alternative_routes(
        self,
        line_number: str,
        origin_stop: Optional[str] = None,
        destination_stop: Optional[str] = None
    ) -> List[Dict[str, Any]]:
        """Get alternative routes."""
        try:
            # Get operational lines (excluding the affected line)
            routes_response = self.client.table('bus_lines')\
                .select('*')\
                .neq('line_number', line_number)\
                .eq('operational_status', 'operational')\
                .limit(3)\
                .execute()

            alternatives = []
            for route in routes_response.data or []:
                alternatives.append({
                    "line_number": route.get("line_number"),
                    "estimated_time": 30,  # Placeholder - would need routing logic
                    "transfers": 1,
                    "distance": 5.0,
                    "status": route.get("operational_status", "operational")
                })

            return alternatives

        except Exception as e:
            logger.error(f"Error fetching alternative routes: {e}")
            return []
