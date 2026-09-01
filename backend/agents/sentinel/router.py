"""
SENTINEL — FastAPI Router
==========================
Endpoints:

  GET  /sentinel/status           — Agent status & health check
  POST /sentinel/gate-event       — Process gate identity event from IRIS/kiosk
  GET  /sentinel/attendance       — Retrieve student attendance history
  GET  /sentinel/defaulters       — Get defaulters for a specific date (defaults to today)
  GET  /sentinel/window           — Get active attendance window
  PUT  /sentinel/window           — Update attendance window (Warden)
  POST /sentinel/check-defaulters — Run on-demand defaulters evaluation
"""

from __future__ import annotations

import logging
from datetime import date
from typing import Optional, List, Dict, Any

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel, Field

from agents.sentinel.attendance import (
    record_gate_attendance,
    get_student_attendance,
    get_defaulters,
    get_attendance_window,
    update_attendance_window,
)
from agents.sentinel.scheduler_jobs import (
    run_defaulter_check_job,
    reschedule_cutoff_job,
)

logger = logging.getLogger("hostel.sentinel.router")

router = APIRouter()


# ── Pydantic Request Schemas ─────────────────────────────────────────────────

class GateEventRequest(BaseModel):
    recognized: bool = Field(..., description="Whether the face was recognized")
    student_id: Optional[str] = Field(None, description="UUID of the student")
    student_name: Optional[str] = Field(None, description="Name of the student")
    roll_no: Optional[str] = Field(None, description="Roll number")
    room_no: Optional[str] = Field(None, description="Room number")
    confidence: Optional[float] = Field(None, description="Cosine similarity score")
    location: Optional[str] = Field("gate", description="Location where event occurred")


class WindowUpdateRequest(BaseModel):
    start_time: str = Field(..., example="07:00", description="Start time (HH:MM or HH:MM:SS)")
    end_time: str = Field(..., example="09:00", description="End time (HH:MM or HH:MM:SS)")
    active_days: List[str] = Field(
        default=["Mon", "Tue", "Wed", "Thu", "Fri", "Sat"],
        description="List of active weekday names (e.g. ['Mon','Tue','Wed'])",
    )


# ── Routes ────────────────────────────────────────────────────────────────────

@router.get("/status", summary="SENTINEL agent health check")
async def sentinel_status():
    """Returns the SENTINEL agent status and operational summary."""
    window = get_attendance_window()
    return {
        "agent": "SENTINEL",
        "codename": "🛡️ SENTINEL — always watching the gate",
        "status": "online",
        "capabilities": [
            "gate_event_processing",
            "window_enforcement",
            "idempotent_logging",
            "defaulter_detection",
        ],
        "active_window": {
            "start_time": window.get("start_time"),
            "end_time": window.get("end_time"),
            "active_days": window.get("active_days"),
        },
    }


@router.post(
    "/gate-event",
    summary="Process identity event from IRIS/kiosk",
    response_description="Attendance marking result",
)
async def process_gate_event(event: GateEventRequest):
    """
    Called by IRIS or the Camera Kiosk after face recognition at the hostel gate.
    - Idempotent: Skips duplicates if the student has already checked in today.
    - Status: Evaluates current time against the attendance window → 'present' vs 'late'.
    """
    event_dict = event.model_dump()
    result = record_gate_attendance(event_dict)

    if not result.get("success"):
        # Unrecognized or validation failure
        return result

    return result


@router.get(
    "/attendance",
    summary="Get student attendance log",
    response_description="Attendance history records for a student",
)
async def get_attendance(
    student_id: str = Query(..., description="UUID of the student"),
    limit: int = Query(50, ge=1, le=200, description="Maximum records to return"),
):
    """
    Retrieve attendance logs for a student, ordered newest first.
    """
    result = get_student_attendance(student_id=student_id, limit=limit)
    return result


@router.get(
    "/defaulters",
    summary="Get defaulters list (Warden view)",
    response_description="Students who did not mark attendance on the specified date",
)
async def get_defaulters_list(
    target_date: Optional[str] = Query(
        None,
        pattern=r"^\d{4}-\d{2}-\d{2}$",
        description="Target date in YYYY-MM-DD format (defaults to today)",
    ),
):
    """
    Calculates and returns all enrolled students who missed gate attendance for a given date.
    """
    parsed_date: Optional[date] = None
    if target_date:
        try:
            parsed_date = date.fromisoformat(target_date)
        except ValueError:
            raise HTTPException(status_code=400, detail="Invalid date format. Use YYYY-MM-DD.")

    result = get_defaulters(target_date=parsed_date)
    return result


@router.get(
    "/window",
    summary="Get current attendance window",
    response_description="Active gate attendance window timings and days",
)
async def get_window():
    """
    Retrieve the current gate attendance window configuration.
    """
    return get_attendance_window()


@router.put(
    "/window",
    summary="Update attendance window (Warden action)",
    response_description="Updated window configuration",
)
async def update_window(window_data: WindowUpdateRequest):
    """
    Update the gate attendance window start time, end time, and active days.
    Also reschedules the automatic daily cutoff job.
    """
    result = update_attendance_window(
        start_time=window_data.start_time,
        end_time=window_data.end_time,
        active_days=window_data.active_days,
    )

    if not result.get("success"):
        raise HTTPException(
            status_code=422,
            detail=result.get("message", "Failed to update window."),
        )

    # Reschedule APScheduler cutoff job
    reschedule_cutoff_job()

    return result


@router.post(
    "/check-defaulters",
    summary="Trigger on-demand defaulters evaluation",
    response_description="Immediate execution result of defaulters check",
)
async def trigger_defaulters_check():
    """
    Manually triggers the defaulter evaluation job immediately (useful for testing & Warden dashboard).
    """
    result = await run_defaulter_check_job()
    return result
