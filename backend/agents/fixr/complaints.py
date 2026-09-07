"""
FIXR — Complaints Business Logic (Phase 4)
==========================================
Core functions for the Maintenance Agent:

  • submit_complaint()         — Student submits free-text → Groq classifies →
                                 stored in `complaints` table.
  • get_my_complaints()        — Student views own complaints + status.
  • get_all_complaints()       — Warden views all complaints (filterable).
  • update_complaint()         — Warden assigns worker note, updates status.
  • get_complaint_by_id()      — Fetch a single complaint by UUID.
  • get_complaints_summary()   — Quick count summary by status/urgency.
"""

from __future__ import annotations

import logging
import uuid
from datetime import datetime
from typing import Any, Dict, List, Optional

from db.supabase_client import get_client
from llm.complaint_classifier import classify_complaint

logger = logging.getLogger("hostel.fixr.complaints")

# Valid constraint sets (must match Postgres CHECK constraints in schema.sql)
VALID_CATEGORIES = {"electrical", "plumbing", "carpentry", "other"}
VALID_URGENCIES  = {"low", "medium", "high", "critical"}
VALID_STATUSES   = {"open", "assigned", "resolved"}


# ── Helper ─────────────────────────────────────────────────────────────────────

def _clean_uuid(val: Optional[str]) -> Optional[str]:
    """Return a validated UUID string, or None if invalid."""
    if not val:
        return None
    try:
        return str(uuid.UUID(str(val).strip()))
    except (ValueError, AttributeError):
        return None


# ── Submit Complaint ───────────────────────────────────────────────────────────

def submit_complaint(
    student_id: str,
    raw_text: str,
) -> Dict[str, Any]:
    """
    Process a new maintenance complaint from a student.

    Steps:
      1. Validate student_id is a proper UUID.
      2. Send raw_text to the LLM classifier → category, urgency, short_summary.
      3. Insert a row into the `complaints` table.
      4. Return the created complaint record + classification metadata.

    Args:
        student_id: UUID string of the submitting student.
        raw_text:   Free-text complaint description (English / Hindi / Hinglish).

    Returns:
        Dict with {success, complaint, classification, message}
    """
    clean_sid = _clean_uuid(student_id)
    if not clean_sid:
        return {
            "success": False,
            "message": "Invalid or missing student_id. Must be a valid UUID.",
        }

    clean_text = raw_text.strip()
    if not clean_text:
        return {
            "success": False,
            "message": "Complaint text cannot be empty.",
        }
    if len(clean_text) < 10:
        return {
            "success": False,
            "message": "Complaint text is too short. Please describe the problem in detail (min 10 characters).",
        }
    if len(clean_text) > 2000:
        return {
            "success": False,
            "message": "Complaint text is too long (max 2000 characters).",
        }

    # 1. LLM Classification
    classification = classify_complaint(clean_text)
    category      = classification["category"]
    urgency        = classification["urgency"]
    short_summary  = classification["short_summary"]
    classifier_src = classification.get("classifier", "unknown")

    logger.info(
        "FIXR: Classifying complaint for student=%s → category=%s urgency=%s (via %s)",
        clean_sid, category, urgency, classifier_src,
    )

    # 2. Insert to Supabase
    try:
        client = get_client()
        payload: Dict[str, Any] = {
            "student_id": clean_sid,
            "raw_text":   clean_text,
            "category":   category,
            "urgency":    urgency,
            "status":     "open",
        }
        res = client.table("complaints").insert(payload).execute()

        if not res.data or len(res.data) == 0:
            return {
                "success": False,
                "message": "Failed to save complaint to database.",
            }

        complaint = res.data[0]
        logger.info(
            "FIXR ✅ Complaint submitted: id=%s category=%s urgency=%s",
            complaint.get("id"), category, urgency,
        )

        return {
            "success": True,
            "message": (
                f"Complaint submitted successfully. Classified as '{category}' "
                f"with '{urgency}' urgency."
            ),
            "complaint": complaint,
            "classification": {
                "category":      category,
                "urgency":       urgency,
                "short_summary": short_summary,
                "classifier":    classifier_src,
            },
        }

    except Exception as exc:
        logger.exception("FIXR: DB error inserting complaint — %s", exc)
        return {
            "success": False,
            "message": f"Database error while saving complaint: {exc}",
        }


# ── Student: View Own Complaints ───────────────────────────────────────────────

def get_my_complaints(
    student_id: str,
    status_filter: Optional[str] = None,
    limit: int = 50,
    offset: int = 0,
) -> Dict[str, Any]:
    """
    Retrieve all complaints submitted by a specific student.

    Args:
        student_id:    UUID of the student.
        status_filter: Optional filter: 'open' | 'assigned' | 'resolved'.
        limit:         Max rows to return.
        offset:        Pagination offset.

    Returns:
        Dict with {success, student_id, total, complaints, summary}
    """
    clean_sid = _clean_uuid(student_id)
    if not clean_sid:
        return {
            "success": False,
            "student_id": student_id,
            "message": "Invalid student_id.",
            "complaints": [],
        }

    if status_filter and status_filter not in VALID_STATUSES:
        return {
            "success": False,
            "message": f"Invalid status filter '{status_filter}'. Use: open, assigned, resolved.",
            "complaints": [],
        }

    try:
        client = get_client()
        query = (
            client.table("complaints")
            .select("*")
            .eq("student_id", clean_sid)
            .order("created_at", desc=True)
        )
        if status_filter:
            query = query.eq("status", status_filter)

        query = query.range(offset, offset + limit - 1)
        res = query.execute()
        complaints = res.data or []

        # Compute per-status counts for the summary
        open_count     = sum(1 for c in complaints if c.get("status") == "open")
        assigned_count = sum(1 for c in complaints if c.get("status") == "assigned")
        resolved_count = sum(1 for c in complaints if c.get("status") == "resolved")

        return {
            "success":    True,
            "student_id": clean_sid,
            "total":      len(complaints),
            "complaints": complaints,
            "summary": {
                "open":     open_count,
                "assigned": assigned_count,
                "resolved": resolved_count,
            },
        }

    except Exception as exc:
        logger.exception("FIXR: Error fetching student complaints — %s", exc)
        return {
            "success":    False,
            "student_id": clean_sid,
            "message":    str(exc),
            "complaints": [],
        }


# ── Warden: View All Complaints ────────────────────────────────────────────────

def get_all_complaints(
    status_filter:   Optional[str] = None,
    category_filter: Optional[str] = None,
    urgency_filter:  Optional[str] = None,
    limit:  int = 50,
    offset: int = 0,
) -> Dict[str, Any]:
    """
    Retrieve all complaints (Warden view), optionally filtered by status,
    category, or urgency. Sorted by urgency (critical first) then created_at (newest).

    Args:
        status_filter:   'open' | 'assigned' | 'resolved'
        category_filter: 'electrical' | 'plumbing' | 'carpentry' | 'other'
        urgency_filter:  'low' | 'medium' | 'high' | 'critical'
        limit:           Max rows.
        offset:          Pagination offset.
    """
    # Validate filters
    if status_filter and status_filter not in VALID_STATUSES:
        return {"success": False, "message": f"Invalid status filter: '{status_filter}'.", "complaints": []}
    if category_filter and category_filter not in VALID_CATEGORIES:
        return {"success": False, "message": f"Invalid category filter: '{category_filter}'.", "complaints": []}
    if urgency_filter and urgency_filter not in VALID_URGENCIES:
        return {"success": False, "message": f"Invalid urgency filter: '{urgency_filter}'.", "complaints": []}

    try:
        client = get_client()

        # Build query with optional filters
        query = (
            client.table("complaints")
            .select("*, students(roll_no, name, room_no)")
            .order("created_at", desc=True)
        )

        if status_filter:
            query = query.eq("status", status_filter)
        if category_filter:
            query = query.eq("category", category_filter)
        if urgency_filter:
            query = query.eq("urgency", urgency_filter)

        query = query.range(offset, offset + limit - 1)
        res = query.execute()
        complaints = res.data or []

        # Urgency rank for client-side sorting if needed (critical=4 → low=1)
        _urgency_rank = {"critical": 4, "high": 3, "medium": 2, "low": 1}
        complaints.sort(
            key=lambda c: (_urgency_rank.get(c.get("urgency", "low"), 1), c.get("created_at", "")),
            reverse=True,
        )

        # Summary counts (from all unfiltered complaints for dashboard context)
        summary_res = (
            client.table("complaints")
            .select("status, urgency, category")
            .execute()
        )
        all_data = summary_res.data or []

        return {
            "success":    True,
            "total":      len(complaints),
            "complaints": complaints,
            "filters": {
                "status":   status_filter,
                "category": category_filter,
                "urgency":  urgency_filter,
            },
            "global_summary": {
                "total":              len(all_data),
                "open":               sum(1 for c in all_data if c.get("status") == "open"),
                "assigned":           sum(1 for c in all_data if c.get("status") == "assigned"),
                "resolved":           sum(1 for c in all_data if c.get("status") == "resolved"),
                "critical":           sum(1 for c in all_data if c.get("urgency") == "critical"),
                "high":               sum(1 for c in all_data if c.get("urgency") == "high"),
                "by_category": {
                    cat: sum(1 for c in all_data if c.get("category") == cat)
                    for cat in VALID_CATEGORIES
                },
            },
        }

    except Exception as exc:
        logger.exception("FIXR: Error fetching all complaints — %s", exc)
        return {
            "success":    False,
            "message":    str(exc),
            "complaints": [],
        }


# ── Warden: Update Complaint ───────────────────────────────────────────────────

def update_complaint(
    complaint_id: str,
    status: Optional[str] = None,
    assigned_worker_note: Optional[str] = None,
) -> Dict[str, Any]:
    """
    Update a complaint record (Warden action).

    At least one of `status` or `assigned_worker_note` must be provided.
    Status transitions:
        open → assigned → resolved

    Args:
        complaint_id:          UUID string of the complaint.
        status:                New status value.
        assigned_worker_note:  Worker name / instruction note from warden.

    Returns:
        Dict with {success, complaint, message}
    """
    clean_cid = _clean_uuid(complaint_id)
    if not clean_cid:
        return {"success": False, "message": "Invalid complaint_id. Must be a valid UUID."}

    if status and status not in VALID_STATUSES:
        return {
            "success": False,
            "message": f"Invalid status '{status}'. Must be one of: open, assigned, resolved.",
        }

    if not status and not assigned_worker_note:
        return {
            "success": False,
            "message": "Provide at least one of: status, assigned_worker_note.",
        }

    update_payload: Dict[str, Any] = {}
    if status:
        update_payload["status"] = status
    if assigned_worker_note is not None:
        update_payload["assigned_worker_note"] = assigned_worker_note.strip()

    try:
        client = get_client()

        # Verify the complaint exists first
        check_res = (
            client.table("complaints")
            .select("id, status, student_id")
            .eq("id", clean_cid)
            .limit(1)
            .execute()
        )
        if not check_res.data or len(check_res.data) == 0:
            return {"success": False, "message": f"Complaint with id '{clean_cid}' not found."}

        # Apply update
        res = (
            client.table("complaints")
            .update(update_payload)
            .eq("id", clean_cid)
            .execute()
        )

        if not res.data or len(res.data) == 0:
            return {"success": False, "message": "Complaint update returned no data."}

        updated = res.data[0]
        logger.info(
            "FIXR ✅ Complaint updated: id=%s status=%s worker_note=%s",
            clean_cid, updated.get("status"), bool(updated.get("assigned_worker_note")),
        )

        return {
            "success":   True,
            "message":   "Complaint updated successfully.",
            "complaint": updated,
        }

    except Exception as exc:
        logger.exception("FIXR: DB error updating complaint — %s", exc)
        return {"success": False, "message": f"Database error: {exc}"}


# ── Get Single Complaint by ID ─────────────────────────────────────────────────

def get_complaint_by_id(complaint_id: str) -> Dict[str, Any]:
    """
    Fetch a single complaint record by UUID.

    Returns:
        Dict with {success, complaint} or {success: False, message}
    """
    clean_cid = _clean_uuid(complaint_id)
    if not clean_cid:
        return {"success": False, "message": "Invalid complaint_id."}

    try:
        client = get_client()
        res = (
            client.table("complaints")
            .select("*, students(roll_no, name, room_no)")
            .eq("id", clean_cid)
            .limit(1)
            .execute()
        )
        if not res.data or len(res.data) == 0:
            return {"success": False, "message": f"Complaint '{clean_cid}' not found."}

        return {"success": True, "complaint": res.data[0]}

    except Exception as exc:
        logger.exception("FIXR: Error fetching complaint by id — %s", exc)
        return {"success": False, "message": str(exc)}


# ── Summary / Stats ────────────────────────────────────────────────────────────

def get_complaints_summary() -> Dict[str, Any]:
    """
    Returns aggregate stats on the complaints table — useful for the Warden
    dashboard and HERALD orchestrator.

    Returns:
        Dict with counts broken down by status, urgency, and category.
    """
    try:
        client = get_client()
        res = client.table("complaints").select("status, urgency, category").execute()
        data = res.data or []

        return {
            "success": True,
            "total":   len(data),
            "by_status": {
                s: sum(1 for c in data if c.get("status") == s)
                for s in VALID_STATUSES
            },
            "by_urgency": {
                u: sum(1 for c in data if c.get("urgency") == u)
                for u in ("critical", "high", "medium", "low")
            },
            "by_category": {
                cat: sum(1 for c in data if c.get("category") == cat)
                for cat in VALID_CATEGORIES
            },
            "open_critical": sum(
                1 for c in data
                if c.get("status") == "open" and c.get("urgency") == "critical"
            ),
            "open_high": sum(
                1 for c in data
                if c.get("status") == "open" and c.get("urgency") == "high"
            ),
        }

    except Exception as exc:
        logger.exception("FIXR: Error fetching complaints summary — %s", exc)
        return {"success": False, "message": str(exc)}
