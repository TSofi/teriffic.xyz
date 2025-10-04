from pydantic import BaseModel
from typing import Optional


class JourneyRequest(BaseModel):
    """Request model for journey planning"""
    start_latitude: float
    start_longitude: float
    destination_latitude: float
    destination_longitude: float
    departure_time: str  # ISO format: "2025-10-03T14:30:00"


class StationInfo(BaseModel):
    """Information about a station"""
    station_id: int
    station_name: str
    latitude: float
    longitude: float


class BusStationStop(BaseModel):
    """Information about each station stop during bus ride"""
    station_id: int
    station_name: str
    latitude: float
    longitude: float
    arrival_time: str
    departure_time: str
    is_boarding_station: bool  # True if this is where user gets on
    is_exit_station: bool      # True if this is where user gets off


class JourneyResponse(BaseModel):
    """Response model with journey details"""
    # Departure information
    departure_station: StationInfo
    walking_to_departure_time_minutes: float
    walking_to_departure_distance_km: float
    user_arrival_at_station_time: str  # When user arrives at departure station

    # Bus information
    line_number: str
    route_id: int
    bus_departure_time_scheduled: str
    bus_departure_time_actual: Optional[str]
    bus_arrival_time_scheduled: str
    bus_arrival_time_actual: Optional[str]
    bus_stations: list[BusStationStop]  # All stations the bus passes through

    # Arrival information
    arrival_station: StationInfo
    walking_from_arrival_time_minutes: float
    walking_from_arrival_distance_km: float

    # Total journey
    total_journey_time_minutes: float
    total_waiting_time_minutes: float  # Time waiting at departure station


class JourneyError(BaseModel):
    """Error response"""
    error: str
    message: str