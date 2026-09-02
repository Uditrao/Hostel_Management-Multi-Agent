"""
NOURISH — FastAPI Router (Phase 3A: Mess Entry Gating)
========================================================
Endpoints wired here:

  GET  /nourish/status          -- Agent health check & current meal window
  POST /nourish/mess-event      -- Process identity event from IRIS/kiosk at mess gate
  GET  /nourish/entries         -- Today's entry counts per meal (warden/staff view)
  GET  /nourish/entries/{meal}  -- Paginated entries for a specific meal
  GET  /nourish/meal-windows    -- Show configured meal time windows

Phase 3B and 3C routes (inventory, menu, NLP) will be added to this router later.
"""

from __future__ import annotations

import logging
from datetime import date
from typing import Optional

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel, Field

from agents.nourish.entry import (
    record_mess_entry,
    get_today_entries,
    get_entries_by_meal,
    determine_meal_type,
    MEAL_WINDOWS,
)

logger = logging.getLogger("hostel.nourish.router")

router = APIRouter()


# -- Pydantic Request Schemas --------------------------------------------------

class MessEventRequest(BaseModel):
    """
    Identity event forwarded from IRIS (or the camera kiosk) at the mess gate.
    This is the same shape as the identity event emitted by /iris/recognize,
    extended with an optional flagged_image_url for unknown-person frames.
    """
    recognized:        bool           = Field(...,  description="Whether the face was recognised by IRIS")
    student_id:        Optional[str]  = Field(None, description="UUID of the matched student")
    student_name:      Optional[str]  = Field(None, description="Full name of the matched student")
    roll_no:           Optional[str]  = Field(None, description="Roll number of the matched student")
    room_no:           Optional[str]  = Field(None, description="Room number of the matched student")
    confidence:        Optional[float]= Field(None, description="Cosine similarity score (0-1)")
    location:          Optional[str]  = Field("mess",description="Should be 'mess' for this endpoint")
    flagged_image_url: Optional[str]  = Field(None, description="URL of the saved flagged image (unrecognised)")


# -- Routes --------------------------------------------------------------------

@router.get("/status", summary="NOURISH agent health check")
async def nourish_status():
    """
    Returns the NOURISH agent status, current active meal window, and capability summary.
    """
    current_meal = determine_meal_type()
    return {
        "agent":        "NOURISH",
        "codename":     "NOURISH -- feeds everyone",
        "status":       "online",
        "capabilities": [
            "mess_entry_gating",
            "duplicate_entry_prevention",
            "unrecognised_face_flagging",
            "meal_window_detection",
        ],
        "current_meal":  current_meal,
        "meal_windows":  {
            meal: {
                "start": str(window["start"])[:5],
                "end":   str(window["end"])[:5],
            }
            for meal, window in MEAL_WINDOWS.items()
        },
    }


@router.post(
    "/mess-event",
    summary="Process identity event at the mess gate",
    response_description="Entry decision: allowed or denied, with reason and log entry",
)
async def process_mess_event(event: MessEventRequest):
    """
    Called by IRIS or the Camera Kiosk after face recognition at the mess gate.

    Decision matrix:
    - **Recognised + in meal window + no duplicate** → Entry **allowed** and logged.
    - **Recognised + duplicate for this meal** → Entry **denied** (already entered).
    - **Recognised + outside meal window** → Entry **denied** (not meal time).
    - **Unrecognised** → Entry **denied**, attempt logged with `flagged_image_url`.

    The response always returns HTTP 200. The `allowed` field tells the kiosk
    whether to open the gate/display green (allowed) or red (denied).
    """
    event_dict = event.model_dump()
    result = record_mess_entry(event_dict)

    logger.info(
        "NOURISH mess-event: recognized=%s student=%s meal=%s allowed=%s",
        event.recognized,
        event.student_id,
        result.get("meal_type"),
        result.get("allowed"),
    )

    # Always return 200 -- the kiosk reads the `allowed` field to decide display.
    return result


@router.get(
    "/entries",
    summary="Today's mess entry summary (warden/staff view)",
    response_description="Entry counts broken down by meal and recognition status",
)
async def get_entries_summary(
    target_date: Optional[str] = Query(
        None,
        pattern=r"^\d{4}-\d{2}-\d{2}$",
        description="Date in YYYY-MM-DD format (defaults to today IST)",
    ),
):
    """
    Returns a summary of mess entries for today (or a given date), grouped by meal.

    Response shape:
    ```json
    {
      "date": "2026-09-02",
      "current_meal": "lunch",
      "summary": {
        "breakfast": {"total": 45, "recognised": 43, "unrecognised": 2},
        "lunch":     {"total": 0,  "recognised": 0,  "unrecognised": 0},
        "dinner":    {"total": 0,  "recognised": 0,  "unrecognised": 0},
        "total":     45
      }
    }
    ```
    """
    parsed_date: Optional[date] = None
    if target_date:
        try:
            parsed_date = date.fromisoformat(target_date)
        except ValueError:
            raise HTTPException(status_code=400, detail="Invalid date format. Use YYYY-MM-DD.")

    return get_today_entries(target_date=parsed_date)


@router.get(
    "/entries/{meal_type}",
    summary="Detailed entries for a specific meal (warden/staff view)",
    response_description="Paginated list of mess entries for the requested meal",
)
async def get_meal_entries(
    meal_type: str,
    target_date: Optional[str] = Query(
        None,
        pattern=r"^\d{4}-\d{2}-\d{2}$",
        description="Date in YYYY-MM-DD format (defaults to today IST)",
    ),
    limit: int = Query(100, ge=1, le=200, description="Max records to return"),
    offset: int = Query(0, ge=0, description="Pagination offset"),
    recognised_only: bool = Query(False, description="Return only recognised-face entries"),
):
    """
    Returns a paginated list of individual mess entry records for a given meal on a given date.

    `meal_type` must be one of: **breakfast**, **lunch**, **dinner**.
    """
    if meal_type not in ("breakfast", "lunch", "dinner"):
        raise HTTPException(
            status_code=400,
            detail="meal_type must be 'breakfast', 'lunch', or 'dinner'.",
        )

    parsed_date: Optional[date] = None
    if target_date:
        try:
            parsed_date = date.fromisoformat(target_date)
        except ValueError:
            raise HTTPException(status_code=400, detail="Invalid date format. Use YYYY-MM-DD.")

    return get_entries_by_meal(
        meal_type=meal_type,
        target_date=parsed_date,
        limit=limit,
        offset=offset,
        recognised_only=recognised_only,
    )


@router.get(
    "/meal-windows",
    summary="Show configured meal time windows",
    response_description="Start and end times for each meal",
)
async def get_meal_windows():
    """
    Returns the configured meal time windows as loaded from environment variables.
    Useful for the frontend to show live meal schedules.
    """
    return {
        "meal_windows": {
            meal: {
                "start": str(window["start"])[:5],
                "end":   str(window["end"])[:5],
            }
            for meal, window in MEAL_WINDOWS.items()
        },
        "note": (
            "Override via .env: BREAKFAST_START, BREAKFAST_END, "
            "LUNCH_START, LUNCH_END, DINNER_START, DINNER_END (HH:MM format)"
        ),
    }
