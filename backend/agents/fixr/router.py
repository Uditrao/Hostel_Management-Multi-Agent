"""
FIXR — FastAPI Router (Phase 4)
================================
Endpoints:

  GET  /fixr/status                 — Agent health check & stats summary
  POST /fixr/complaint              — Student submits a maintenance complaint
  GET  /fixr/complaints/mine        — Student views own complaints + status tracker
  GET  /fixr/complaints             — Warden views all complaints (filterable & sortable)
  GET  /fixr/complaints/summary     — Quick aggregate counts for dashboard widgets
  GET  /fixr/complaints/{id}        — Fetch a single complaint by UUID
  PATCH /fixr/complaints/{id}       — Warden assigns worker note, updates status
"""

from __future__ import annotations

import logging
from typing import Optional

from fastapi import APIRouter, HTTPException, Path, Query
from pydantic import BaseModel, Field

from agents.fixr.complaints import (
    submit_complaint,
    get_my_complaints,
    get_all_complaints,
    update_complaint,
    get_complaint_by_id,
    get_complaints_summary,
    VALID_STATUSES,
    VALID_CATEGORIES,
    VALID_URGENCIES,
)

logger = logging.getLogger("hostel.fixr.router")

router = APIRouter()


# ── Pydantic Request Schemas ──────────────────────────────────────────────────

class ComplaintSubmitRequest(BaseModel):
    student_id: str = Field(
        ...,
        description="UUID of the submitting student",
        example="550e8400-e29b-41d4-a716-446655440000",
    )
    raw_text: str = Field(
        ...,
        min_length=10,
        max_length=2000,
        description="Free-text complaint description (English / Hindi / Hinglish)",
        example="My bathroom pipe is leaking badly and water is flooding the floor.",
    )


class ComplaintUpdateRequest(BaseModel):
    status: Optional[str] = Field(
        None,
        description="New status: 'open' | 'assigned' | 'resolved'",
        example="assigned",
    )
    assigned_worker_note: Optional[str] = Field(
        None,
        max_length=500,
        description="Worker name or instruction note from the Warden",
        example="Plumber Ramesh assigned — will visit tomorrow morning.",
    )


# ── Routes ────────────────────────────────────────────────────────────────────

@router.get("/status", summary="FIXR agent health check & complaint stats")
async def fixr_status():
    """
    Returns the FIXR agent status and a real-time summary of the complaints table.
    """
    summary = get_complaints_summary()
    return {
        "agent":    "FIXR",
        "codename": "🔧 FIXR — fixes it fast",
        "status":   "online",
        "capabilities": [
            "llm_complaint_classification",
            "urgency_triage",
            "worker_assignment",
            "status_lifecycle_management",
            "warden_filterable_dashboard",
            "student_complaint_tracker",
        ],
        "complaints_summary": summary if summary.get("success") else {},
    }


@router.post(
    "/complaint",
    summary="Submit a maintenance complaint (Student action)",
    response_description="Created complaint record with LLM classification result",
)
@router.post(
    "/complaints",
    summary="Submit a maintenance complaint (Student action - plural alias)",
    response_description="Created complaint record with LLM classification result",
    include_in_schema=False,
)
async def submit_new_complaint(body: ComplaintSubmitRequest):
    """
    Submit a free-text maintenance complaint.

    The text is automatically classified by **FIXR** via Groq LLM (with offline fallback) to:
    - **category**: `electrical` | `plumbing` | `carpentry` | `other`
    - **urgency**: `low` | `medium` | `high` | `critical`
    - **short_summary**: a one-sentence description

    The complaint is saved to the database and immediately visible on the Warden portal.
    """
    result = submit_complaint(
        student_id=body.student_id,
        raw_text=body.raw_text,
    )
    if not result.get("success"):
        raise HTTPException(
            status_code=422,
            detail=result.get("message", "Failed to submit complaint."),
        )
    return result


@router.get(
    "/complaints/mine",
    summary="Get student's own complaints & status tracker",
    response_description="All complaints submitted by the specified student",
)
async def get_student_complaints(
    student_id: str = Query(
        ...,
        description="UUID of the student",
    ),
    status: Optional[str] = Query(
        None,
        description="Filter by status: 'open' | 'assigned' | 'resolved'",
    ),
    limit: int = Query(50, ge=1, le=100, description="Max complaints to return"),
    offset: int = Query(0, ge=0, description="Pagination offset"),
):
    """
    Returns all complaints submitted by the specified student, sorted newest first.
    Includes a summary of open / assigned / resolved counts.
    """
    if status and status not in VALID_STATUSES:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid status '{status}'. Valid values: {', '.join(VALID_STATUSES)}.",
        )
    result = get_my_complaints(
        student_id=student_id,
        status_filter=status,
        limit=limit,
        offset=offset,
    )
    if not result.get("success"):
        raise HTTPException(
            status_code=422,
            detail=result.get("message", "Failed to retrieve complaints."),
        )
    return result


@router.get(
    "/complaints/summary",
    summary="Aggregate complaint counts for dashboard widgets (Warden)",
    response_description="Counts grouped by status, urgency, and category",
)
async def complaints_summary():
    """
    Returns aggregate statistics over the entire `complaints` table.
    Designed for the Warden dashboard summary cards and HERALD anomaly feed.

    Highlights critical/high open complaints that need immediate attention.
    """
    result = get_complaints_summary()
    if not result.get("success"):
        raise HTTPException(status_code=500, detail=result.get("message", "Failed to get summary."))
    return result


@router.get(
    "/complaints",
    summary="Get all complaints — filterable & sortable (Warden view)",
    response_description="Complaint records with student info, sorted by urgency then date",
)
async def get_complaints(
    status: Optional[str] = Query(
        None,
        description="Filter by status: 'open' | 'assigned' | 'resolved'",
    ),
    category: Optional[str] = Query(
        None,
        description="Filter by category: 'electrical' | 'plumbing' | 'carpentry' | 'other'",
    ),
    urgency: Optional[str] = Query(
        None,
        description="Filter by urgency: 'low' | 'medium' | 'high' | 'critical'",
    ),
    limit: int = Query(50, ge=1, le=200, description="Max complaints to return"),
    offset: int = Query(0, ge=0, description="Pagination offset"),
):
    """
    Warden view of all complaints. Results are sorted by urgency (critical first),
    then by creation date (newest first).

    Includes embedded student info (roll_no, name, room_no) for each complaint.
    Also returns a `global_summary` with aggregate counts across the full table
    regardless of the applied filters.
    """
    if status and status not in VALID_STATUSES:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid status '{status}'. Valid: {', '.join(VALID_STATUSES)}.",
        )
    if category and category not in VALID_CATEGORIES:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid category '{category}'. Valid: {', '.join(VALID_CATEGORIES)}.",
        )
    if urgency and urgency not in VALID_URGENCIES:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid urgency '{urgency}'. Valid: {', '.join(VALID_URGENCIES)}.",
        )

    result = get_all_complaints(
        status_filter=status,
        category_filter=category,
        urgency_filter=urgency,
        limit=limit,
        offset=offset,
    )
    if not result.get("success"):
        raise HTTPException(
            status_code=500,
            detail=result.get("message", "Failed to retrieve complaints."),
        )
    return result


@router.get(
    "/complaints/{complaint_id}",
    summary="Get a single complaint by UUID",
    response_description="Full complaint record with embedded student information",
)
async def get_complaint(
    complaint_id: str = Path(
        ...,
        description="UUID of the complaint",
    ),
):
    """
    Fetch a specific complaint record by its UUID, including the embedded
    student details (roll_no, name, room_no).
    """
    result = get_complaint_by_id(complaint_id)
    if not result.get("success"):
        raise HTTPException(
            status_code=404,
            detail=result.get("message", f"Complaint '{complaint_id}' not found."),
        )
    return result


@router.patch(
    "/complaints/{complaint_id}",
    summary="Update complaint status or assign worker (Warden action)",
    response_description="Updated complaint record",
)
async def patch_complaint(
    body: ComplaintUpdateRequest,
    complaint_id: str = Path(
        ...,
        description="UUID of the complaint to update",
    ),
):
    """
    Update a complaint record. Warden can:
    - Change **status**: `open` → `assigned` → `resolved`
    - Set or update **assigned_worker_note**: name of the worker or instructions

    At least one field must be provided in the request body.

    **Status lifecycle**:
    ```
    open ──→ assigned ──→ resolved
    ```
    """
    if not body.status and not body.assigned_worker_note:
        raise HTTPException(
            status_code=400,
            detail="Request body must include at least one of: 'status', 'assigned_worker_note'.",
        )

    result = update_complaint(
        complaint_id=complaint_id,
        status=body.status,
        assigned_worker_note=body.assigned_worker_note,
    )
    if not result.get("success"):
        status_code = 404 if "not found" in result.get("message", "").lower() else 422
        raise HTTPException(
            status_code=status_code,
            detail=result.get("message", "Failed to update complaint."),
        )
    return result
