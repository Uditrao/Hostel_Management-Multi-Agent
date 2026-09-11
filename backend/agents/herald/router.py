"""
HERALD -- FastAPI Router (Phase 5)
===================================
Endpoints:

  GET  /herald/status              -- HERALD agent health check + stats (public)
  GET  /herald/anomalies           -- Warden views anomaly flags [warden]
  POST /herald/run                 -- Warden triggers on-demand orchestrator run [warden]
  PATCH /herald/anomalies/{id}/seen -- Warden marks a flag as seen [warden]
  GET  /herald/summary             -- Groq-generated Warden briefing paragraph [warden]

Phase 6: Role guards applied.
"""

from __future__ import annotations

import logging
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Path, Query

from agents.herald.orchestrator import (
    run_orchestrator,
    get_anomaly_flags,
    mark_flag_seen,
    get_herald_stats,
)
from agents.herald.summarizer import generate_summary
from auth.dependencies import require_role

logger = logging.getLogger("hostel.herald.router")

router = APIRouter()


# -- Status / Health -----------------------------------------------------------

@router.get("/status", summary="HERALD agent health check and anomaly stats")
async def herald_status():
    """
    Returns HERALD agent status and aggregate anomaly flag counts.
    Useful for the Warden dashboard summary card.
    """
    stats = get_herald_stats()
    return {
        "agent":    "HERALD",
        "codename": "Herald -- delivers the big picture",
        "status":   "online",
        "capabilities": [
            "cross_agent_anomaly_detection",
            "attendance_missed_check",
            "mess_missed_streak_check",
            "unresolved_complaint_check",
            "nightly_cron_scheduler",
            "on_demand_run",
            "warden_briefing_summary",
        ],
        "anomaly_stats": stats if stats.get("success") else {},
    }


# -- Get Anomaly Flags ---------------------------------------------------------

@router.get(
    "/anomalies",
    summary="Warden: view anomaly flags [warden]",
    response_description="List of anomaly flags with embedded student info",
)
async def get_anomalies(
    unseen_only: bool = Query(
        False,
        description="If true, return only flags not yet seen by the Warden",
    ),
    flag_type: Optional[str] = Query(
        None,
        description=(
            "Filter by flag type: "
            "'attendance_missed' | 'mess_missed_streak' | 'unresolved_complaint'"
        ),
    ),
    limit: int  = Query(100, ge=1, le=500, description="Max flags to return"),
    offset: int = Query(0,   ge=0,         description="Pagination offset"),
    _warden: dict = Depends(require_role("warden")),
):
    """
    Returns all anomaly flags raised by HERALD, sorted newest first.

    Each flag includes:
    - **type**: the anomaly category
    - **detail**: human-readable description of the issue
    - **seen_by_warden**: whether the Warden has acknowledged it
    - **students**: embedded student info (name, roll_no, room_no)

    Use `unseen_only=true` to show only unread flags (useful for notification badge).
    """
    result = get_anomaly_flags(
        unseen_only=unseen_only,
        flag_type=flag_type,
        limit=limit,
        offset=offset,
    )
    if not result.get("success"):
        raise HTTPException(
            status_code=400 if "Invalid" in result.get("message", "") else 500,
            detail=result.get("message", "Failed to fetch anomaly flags."),
        )
    return result


# -- Trigger On-Demand Run -----------------------------------------------------

@router.post(
    "/run",
    summary="Warden: trigger HERALD orchestrator run on-demand [warden]",
    response_description="Run summary with new flag counts and breakdown",
)
async def trigger_run(
    _warden: dict = Depends(require_role("warden")),
):
    """
    Manually triggers the HERALD orchestrator to run all three anomaly checks
    immediately (without waiting for the nightly cron):

    1. **Attendance missed** — students with no entries in 3+ days
    2. **Mess missed streak** — students absent from last 6 meal slots
    3. **Unresolved complaint** — high/critical complaints open 24h+

    Returns a breakdown of newly created flags.
    Duplicate flags for the same student + type + day are silently skipped.
    """
    result = run_orchestrator()
    if not result.get("success"):
        raise HTTPException(
            status_code=500,
            detail=result.get("error", "Orchestrator run failed."),
        )
    return result


# -- Mark Flag As Seen ---------------------------------------------------------

@router.patch(
    "/anomalies/{flag_id}/seen",
    summary="Warden: mark an anomaly flag as seen [warden]",
    response_description="Updated anomaly flag record",
)
async def mark_anomaly_seen(
    flag_id: str = Path(
        ...,
        description="UUID of the anomaly flag to mark as seen",
    ),
    _warden: dict = Depends(require_role("warden")),
):
    """
    Acknowledge an anomaly flag. Sets `seen_by_warden = true` so it no longer
    appears in the unread notification count.

    Idempotent: calling this on an already-seen flag returns success.
    """
    result = mark_flag_seen(flag_id)
    if not result.get("success"):
        status_code = 404 if "not found" in result.get("message", "").lower() else 422
        raise HTTPException(
            status_code=status_code,
            detail=result.get("message", "Failed to mark flag as seen."),
        )
    return result


# -- Warden Summary (LLM) ------------------------------------------------------

@router.get(
    "/summary",
    summary="Generate an LLM Warden briefing from today's anomaly flags [warden]",
    response_description="Plain-text Warden briefing paragraph",
)
async def get_warden_summary(
    unseen_only: bool = Query(
        True,
        description="If true (default), summarise only unseen flags",
    ),
    _warden: dict = Depends(require_role("warden")),
):
    """
    Calls HERALD's Groq summarizer to produce a concise one-paragraph briefing
    of current anomaly flags for the Warden.

    Falls back to a simple text summary if LLM is unavailable.
    """
    flags_result = get_anomaly_flags(unseen_only=unseen_only, limit=200)
    if not flags_result.get("success"):
        raise HTTPException(
            status_code=500,
            detail=flags_result.get("message", "Failed to retrieve flags for summary."),
        )

    flags   = flags_result.get("flags", [])
    summary = generate_summary(flags)

    return {
        "success":       True,
        "flag_count":    len(flags),
        "unseen_only":   unseen_only,
        "summary":       summary,
    }
