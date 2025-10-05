from pydantic import BaseModel
from typing import Optional


class User(BaseModel):
    """User entity"""
    id: int
    email: str
    points: int = 0
    current_level: int = 1
    total_verified_reports: int = 0
    updated_at: Optional[str] = None  # ISO format datetime string


class UserCreate(BaseModel):
    """DTO for creating a new user"""
    email: str
    points: int = 0
    current_level: int = 1
    total_verified_reports: int = 0
