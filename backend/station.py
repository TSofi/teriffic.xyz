from pydantic import BaseModel
from typing import Optional


class Station(BaseModel):
    id: Optional[int] = None
    name: str
    latitude: float
    longitude: float