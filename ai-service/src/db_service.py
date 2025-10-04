"""Database service for querying bus line data."""
from typing import List, Dict, Any, Optional
from datetime import datetime, timedelta
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy import text
import logging

logger = logging.getLogger(__name__)


class DatabaseService:
    """Service for database operations."""

    def __init__(self, database_url: str):
        """Initialize database connection."""
        self.engine = create_async_engine(database_url, echo=False)
        self.async_session = sessionmaker(
            self.engine,
            class_=AsyncSession,
            expire_on_commit=False
        )

    async def get_line_status(self, line_number: str) -> Optional[Dict[str, Any]]:
        """Get current operational status for a bus line."""
        async with self.async_session() as session:
            try:
                # This is a placeholder query - adjust based on your actual schema
                query = text("""
                    SELECT
                        bl.line_number,
                        bl.operational_status,
                        COUNT(DISTINCT b.id) as active_buses,
                        AVG(CASE WHEN b.delay_minutes > 0 THEN b.delay_minutes ELSE 0 END) as avg_delay,
                        MAX(b.crowding_level) as crowding_level,
                        MAX(b.last_updated) as last_updated
                    FROM bus_lines bl
                    LEFT JOIN buses b ON bl.id = b.line_id
                    WHERE bl.line_number = :line_number
                        AND (b.last_updated > NOW() - INTERVAL '30 minutes' OR b.last_updated IS NULL)
                    GROUP BY bl.line_number, bl.operational_status
                """)

                result = await session.execute(
                    query,
                    {"line_number": line_number}
                )
                row = result.fetchone()

                if not row:
                    return None

                return {
                    "line_number": row[0],
                    "operational_status": row[1] or "operational",
                    "active_buses": row[2] or 0,
                    "avg_delay": float(row[3] or 0),
                    "crowding_level": row[4] or "normal",
                    "last_updated": row[5].isoformat() if row[5] else datetime.now().isoformat()
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
        async with self.async_session() as session:
            try:
                query = text("""
                    SELECT
                        r.type,
                        r.description,
                        r.severity,
                        r.created_at as timestamp,
                        r.verified,
                        COUNT(rv.id) as upvotes
                    FROM reports r
                    JOIN buses b ON r.bus_id = b.id
                    JOIN bus_lines bl ON b.line_id = bl.id
                    LEFT JOIN report_votes rv ON r.id = rv.report_id AND rv.vote_type = 'helpful'
                    WHERE bl.line_number = :line_number
                        AND r.created_at > NOW() - INTERVAL '6 hours'
                    GROUP BY r.id, r.type, r.description, r.severity, r.created_at, r.verified
                    ORDER BY r.created_at DESC
                    LIMIT :limit
                """)

                result = await session.execute(
                    query,
                    {"line_number": line_number, "limit": limit}
                )

                return [
                    {
                        "type": row[0],
                        "description": row[1],
                        "severity": row[2],
                        "timestamp": row[3].isoformat(),
                        "verified": row[4],
                        "upvotes": row[5]
                    }
                    for row in result.fetchall()
                ]
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

        async with self.async_session() as session:
            try:
                query = text("""
                    SELECT
                        AVG(b.delay_minutes) as avg_delay,
                        MAX(b.delay_minutes) as max_delay,
                        MIN(b.delay_minutes) as min_delay,
                        COUNT(*) as total_delays,
                        (COUNT(CASE WHEN b.delay_minutes <= 2 THEN 1 END) * 100.0 / COUNT(*)) as on_time_percentage
                    FROM bus_positions b
                    JOIN bus_lines bl ON b.line_id = bl.id
                    WHERE bl.line_number = :line_number
                        AND b.timestamp > NOW() - INTERVAL ':hours hours'
                """)

                result = await session.execute(
                    query,
                    {"line_number": line_number, "hours": hours}
                )
                row = result.fetchone()

                if not row:
                    return {}

                return {
                    "avg_delay": float(row[0] or 0),
                    "max_delay": float(row[1] or 0),
                    "min_delay": float(row[2] or 0),
                    "total_delays": row[3] or 0,
                    "on_time_percentage": float(row[4] or 100)
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
        async with self.async_session() as session:
            try:
                type_filter = ""
                if report_types:
                    type_filter = f"AND r.type IN ({','.join([f\"'{t}'\" for t in report_types])})"

                query = text(f"""
                    SELECT
                        r.type,
                        r.description,
                        r.severity,
                        r.created_at as timestamp,
                        r.verified,
                        COUNT(rv.id) as upvotes
                    FROM reports r
                    JOIN buses b ON r.bus_id = b.id
                    JOIN bus_lines bl ON b.line_id = bl.id
                    LEFT JOIN report_votes rv ON r.id = rv.report_id AND rv.vote_type = 'helpful'
                    WHERE bl.line_number = :line_number
                        {type_filter}
                    GROUP BY r.id
                    ORDER BY r.created_at DESC
                    LIMIT :limit
                """)

                result = await session.execute(
                    query,
                    {"line_number": line_number, "limit": limit}
                )

                return [
                    {
                        "type": row[0],
                        "description": row[1],
                        "severity": row[2],
                        "timestamp": row[3].isoformat(),
                        "verified": row[4],
                        "upvotes": row[5]
                    }
                    for row in result.fetchall()
                ]
            except Exception as e:
                logger.error(f"Error fetching reports: {e}")
                return []

    async def get_service_alerts(
        self,
        line_number: Optional[str] = None
    ) -> List[Dict[str, Any]]:
        """Get active service alerts."""
        async with self.async_session() as session:
            try:
                line_filter = ""
                params = {}

                if line_number:
                    line_filter = "AND (sa.line_number = :line_number OR sa.line_number IS NULL)"
                    params["line_number"] = line_number

                query = text(f"""
                    SELECT
                        sa.type,
                        sa.title,
                        sa.description,
                        sa.severity,
                        sa.start_time,
                        sa.end_time,
                        sa.affected_stops
                    FROM service_alerts sa
                    WHERE sa.start_time <= NOW()
                        AND (sa.end_time IS NULL OR sa.end_time >= NOW())
                        {line_filter}
                    ORDER BY sa.severity DESC, sa.start_time DESC
                """)

                result = await session.execute(query, params)

                return [
                    {
                        "type": row[0],
                        "title": row[1],
                        "description": row[2],
                        "severity": row[3],
                        "start_time": row[4].isoformat(),
                        "end_time": row[5].isoformat() if row[5] else None,
                        "affected_stops": row[6] or []
                    }
                    for row in result.fetchall()
                ]
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
        async with self.async_session() as session:
            try:
                # Simplified query - real implementation would use routing algorithms
                query = text("""
                    SELECT
                        bl.line_number,
                        30 as estimated_time,
                        1 as transfers,
                        5.0 as distance,
                        bl.operational_status as status
                    FROM bus_lines bl
                    WHERE bl.line_number != :line_number
                        AND bl.operational_status = 'operational'
                    LIMIT 3
                """)

                result = await session.execute(
                    query,
                    {"line_number": line_number}
                )

                return [
                    {
                        "line_number": row[0],
                        "estimated_time": row[1],
                        "transfers": row[2],
                        "distance": row[3],
                        "status": row[4]
                    }
                    for row in result.fetchall()
                ]
            except Exception as e:
                logger.error(f"Error fetching alternative routes: {e}")
                return []
