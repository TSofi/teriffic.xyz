from pydantic import BaseModel
from typing import Optional, List, Dict, Any


class Route(BaseModel):
    id: Optional[int] = None
    line_number: str
    stations_info: List[Dict[str, Any]]  # Array of {station_id, departure_time, actual_departure_time, arrival_time, actual_arrival_time}
    current_latitude: Optional[float] = None
    current_longitude: Optional[float] = None