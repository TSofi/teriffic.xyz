from pydantic import BaseModel
from typing import Optional
from datetime import datetime


class Report(BaseModel):
    """Report entity representing a user report about bus delays or issues"""
    id: int
    user_id: int
    route_id: int  # Maps to 'route' field in database
    station_id: int
    reported_time: str  # ISO format datetime string
    delay: Optional[int] = None  # Delay in seconds
    bus_number: Optional[str] = None
    status: Optional[bool] = None  # None = pending verification, True = verified, False = rejected
    issue: Optional[str] = None
    verified_at: Optional[str] = None  # ISO format datetime string


class ReportCreate(BaseModel):
    """DTO for creating a new report"""
    user_id: int
    route_id: int
    station_id: int
    reported_time: str
    delay: Optional[int] = None
    bus_number: Optional[str] = None
    issue: Optional[str] = None


class ReportUpdate(BaseModel):
    """DTO for updating report status"""
    status: bool  # True = verified, False = rejected
    verified_at: str  # ISO format datetime string