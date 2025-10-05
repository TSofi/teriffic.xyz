from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel
from typing import List, Optional
from datetime import date, datetime
from db import supabase

router = APIRouter()

# ============= Request/Response Models =============

class CreateReportRequest(BaseModel):
    user_id: int
    route: Optional[str] = None
    station_id: Optional[str] = None
    delay: Optional[int] = None
    bus_number: Optional[str] = None
    issue: str
    status: str = "pending"

class ReportResponse(BaseModel):
    id: int
    user_id: int
    route: Optional[str]
    station_id: Optional[str]
    reported_time: datetime
    delay: Optional[int]
    bus_number: Optional[str]
    status: str
    issue: Optional[str]
    verified_at: Optional[datetime]

class UserLevelResponse(BaseModel):
    id: int
    email: str
    current_level: int
    total_verified_reports: int
    points: int

class TicketResponse(BaseModel):
    id: int
    user_id: int
    days: int
    earned_date: date
    earned_level: int
    activated_date: Optional[date]
    expiry_date: Optional[date]
    is_active: bool
    status: str
    created_at: datetime

class ActivateTicketRequest(BaseModel):
    ticket_id: int

# ============= Reports Endpoints =============

@router.post("/reports", response_model=ReportResponse, status_code=status.HTTP_201_CREATED)
async def create_report(report: CreateReportRequest):
    """Create a new traffic/bus report"""
    try:
        result = supabase.table("reports").insert({
            "user_id": report.user_id,
            "route": report.route,
            "station_id": report.station_id,
            "delay": report.delay,
            "bus_number": report.bus_number,
            "issue": report.issue,
            "status": report.status
        }).execute()

        if not result.data:
            raise HTTPException(status_code=500, detail="Failed to create report")

        return result.data[0]
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/reports/user/{user_id}", response_model=List[ReportResponse])
async def get_user_reports(user_id: int, status_filter: Optional[str] = None):
    """Get all reports for a specific user, optionally filtered by status"""
    try:
        query = supabase.table("reports").select("*").eq("user_id", user_id)

        if status_filter:
            query = query.eq("status", status_filter)

        result = query.order("reported_time", desc=True).execute()
        return result.data
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.patch("/reports/{report_id}/verify")
async def verify_report(report_id: int):
    """Verify a report (admin/moderator action) - triggers level up if applicable"""
    try:
        result = supabase.table("reports").update({
            "status": "verified"
        }).eq("id", report_id).execute()

        if not result.data:
            raise HTTPException(status_code=404, detail="Report not found")

        return {"message": "Report verified successfully", "report": result.data[0]}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.patch("/reports/{report_id}/reject")
async def reject_report(report_id: int):
    """Reject a report (admin/moderator action)"""
    try:
        result = supabase.table("reports").update({
            "status": "rejected"
        }).eq("id", report_id).execute()

        if not result.data:
            raise HTTPException(status_code=404, detail="Report not found")

        return {"message": "Report rejected", "report": result.data[0]}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# ============= User Level Endpoints =============

@router.get("/users/{user_id}/level", response_model=UserLevelResponse)
async def get_user_level(user_id: int):
    """Get user's current level and stats"""
    try:
        result = supabase.table("users").select("*").eq("id", user_id).execute()

        if not result.data:
            raise HTTPException(status_code=404, detail="User not found")

        return result.data[0]
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/users/{user_id}/progress")
async def get_user_progress(user_id: int):
    """Get detailed user progress including level, reports, and next level requirements"""
    try:
        # Get user data
        user_result = supabase.table("users").select("*").eq("id", user_id).execute()

        if not user_result.data:
            raise HTTPException(status_code=404, detail="User not found")

        user = user_result.data[0]
        current_level = user.get("current_level", 1)
        total_verified = user.get("total_verified_reports", 0)

        # Calculate progress using PostgreSQL functions
        reports_for_level = supabase.rpc("get_reports_for_level", {"level": current_level}).execute()
        total_up_to_level = supabase.rpc("get_total_reports_up_to_level", {"level": current_level}).execute()
        reward_days = supabase.rpc("get_reward_days", {"level": current_level}).execute()

        current_progress = total_verified - total_up_to_level.data

        return {
            "user_id": user_id,
            "current_level": current_level,
            "total_verified_reports": total_verified,
            "reports_for_current_level": reports_for_level.data,
            "current_progress": current_progress,
            "progress_percentage": (current_progress / reports_for_level.data * 100) if reports_for_level.data > 0 else 0,
            "reward_days": reward_days.data,
            "reports_to_next_ticket": reports_for_level.data - current_progress
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# ============= Tickets Endpoints =============

@router.get("/tickets/user/{user_id}", response_model=List[TicketResponse])
async def get_user_tickets(user_id: int):
    """Get all tickets for a specific user"""
    try:
        result = supabase.table("tickets").select("*").eq("user_id", user_id).order("earned_date", desc=True).execute()
        return result.data
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/tickets/{ticket_id}/activate")
async def activate_ticket(ticket_id: int):
    """Activate a ticket to start using it"""
    try:
        # Call the PostgreSQL function to activate ticket
        result = supabase.rpc("activate_ticket", {"p_ticket_id": ticket_id}).execute()

        if not result.data:
            raise HTTPException(status_code=400, detail="Failed to activate ticket. It may already be used or expired.")

        # Get updated ticket data
        ticket_result = supabase.table("tickets").select("*").eq("id", ticket_id).execute()

        return {
            "message": "Ticket activated successfully",
            "ticket": ticket_result.data[0] if ticket_result.data else None
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/tickets/cleanup-expired")
async def cleanup_expired_tickets():
    """Admin endpoint to cleanup expired tickets"""
    try:
        result = supabase.rpc("update_expired_tickets").execute()
        return {"message": f"Updated {result.data} expired tickets"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# ============= Stats Endpoints =============

@router.get("/stats/leaderboard")
async def get_leaderboard(limit: int = 10):
    """Get top users by level"""
    try:
        result = supabase.table("users").select("id, email, current_level, total_verified_reports, points").order("current_level", desc=True).order("total_verified_reports", desc=True).limit(limit).execute()
        return result.data
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
