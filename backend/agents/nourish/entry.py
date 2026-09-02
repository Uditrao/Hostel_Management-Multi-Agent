"""
NOURISH — Mess Entry Logic (Phase 3A)
======================================
Core business logic for the Mess Entry Agent:

  • determine_meal_type()      — infer current meal (breakfast/lunch/dinner) from IST clock.
  • record_mess_entry()        — process an IRIS/kiosk identity event at the mess gate:
                                  - Recognised  → log entry, allow access.
                                  - Unrecognised → save flagged image URL, log attempt, deny.
                                  - Duplicate    → idempotent skip; deny with reason.
  • get_today_entries()        — today's entry counts per meal (warden/staff view).
  • get_entries_by_meal()      — paginated list of entries for a specific meal (warden view).

Meal time windows (tunable via .env, defaults shown):
  BREAKFAST_START / BREAKFAST_END  ->  07:00 - 09:30
  LUNCH_START     / LUNCH_END      ->  12:00 - 14:30
  DINNER_START    / DINNER_END     ->  19:00 - 21:30
"""

from __future__ import annotations

import logging
import os
from datetime import datetime, date, time, timezone, timedelta
from typing import Optional, Dict, Any

from db.supabase_client import get_client

logger = logging.getLogger("hostel.nourish.entry")

# -- Timezone (IST = UTC+05:30) ------------------------------------------------
IST_TZ = timezone(timedelta(hours=5, minutes=30))


def _now_ist() -> datetime:
    """Return the current datetime in Asia/Kolkata timezone."""
    return datetime.now(IST_TZ)


# -- Meal Time Windows (from .env with sensible defaults) ----------------------

def _parse_time(env_key: str, default: str) -> time:
    """Read an HH:MM time string from env, fall back to default."""
    raw = os.getenv(env_key, default).strip()
    parts = raw.split(":")
    return time(int(parts[0]), int(parts[1]) if len(parts) > 1 else 0)


MEAL_WINDOWS: Dict[str, Dict[str, time]] = {
    "breakfast": {
        "start": _parse_time("BREAKFAST_START", "07:00"),
        "end":   _parse_time("BREAKFAST_END",   "09:30"),
    },
    "lunch": {
        "start": _parse_time("LUNCH_START", "12:00"),
        "end":   _parse_time("LUNCH_END",   "14:30"),
    },
    "dinner": {
        "start": _parse_time("DINNER_START", "19:00"),
        "end":   _parse_time("DINNER_END",   "21:30"),
    },
}


def determine_meal_type(current_time: Optional[time] = None) -> Optional[str]:
    """
    Return the current meal type ('breakfast', 'lunch', 'dinner') based on
    the IST clock, or None if we are outside all meal windows.

    Args:
        current_time: Override for testing. Defaults to the current IST time.

    Returns:
        'breakfast' | 'lunch' | 'dinner' | None
    """
    ct = current_time or _now_ist().time()
    for meal, window in MEAL_WINDOWS.items():
        if window["start"] <= ct <= window["end"]:
            return meal
    return None


# -- Mess Entry Recording ------------------------------------------------------

def record_mess_entry(event: Dict[str, Any]) -> Dict[str, Any]:
    """
    Process an identity event at the mess gate and log it.

    Behaviour:
      - Recognised + within meal window -> check duplicate -> log entry -> allow.
      - Recognised + outside all windows -> deny (not a meal time).
      - Unrecognised -> log attempt with flagged_image_url -> deny.
      - Duplicate same meal -> skip insert -> deny with explanation.

    Args:
        event: Dict containing at minimum:
               {
                 "recognized":        bool,
                 "student_id":        str | None,
                 "student_name":      str | None,
                 "roll_no":           str | None,
                 "room_no":           str | None,
                 "confidence":        float,
                 "location":          str,         # should be 'mess'
                 "flagged_image_url": str | None,  # pre-uploaded URL for unknown frames
               }

    Returns:
        Dict with {success, allowed, meal_type, reason, entry, student_*}
    """
    now = _now_ist()
    meal_type = determine_meal_type(now.time())
    client = get_client()

    # -- Unrecognised path -----------------------------------------------------
    if not event.get("recognized") or not event.get("student_id"):
        payload = {
            "student_id":        None,
            "is_recognized":     False,
            "meal_type":         meal_type or "unknown",
            "timestamp":         now.isoformat(),
            "flagged_image_url": event.get("flagged_image_url"),
        }
        try:
            res = client.table("mess_entries").insert(payload).execute()
            entry = res.data[0] if res.data else payload
        except Exception as exc:
            logger.exception("NOURISH: Failed to log unrecognised attempt -- %s", exc)
            entry = payload

        logger.warning(
            "NOURISH Unrecognised face at mess -- meal=%s flagged_url=%s",
            meal_type, event.get("flagged_image_url"),
        )
        return {
            "success":   True,    # request processed; entry logging succeeded
            "allowed":   False,
            "reason":    "Face not recognised. Entry denied and flagged.",
            "meal_type": meal_type,
            "entry":     entry,
        }

    student_id   = str(event["student_id"]).strip()
    student_name = event.get("student_name")
    roll_no      = event.get("roll_no")

    # -- Outside meal window ---------------------------------------------------
    if meal_type is None:
        logger.info(
            "NOURISH Outside meal window -- student=%s time=%s",
            student_id, now.strftime("%H:%M:%S"),
        )
        return {
            "success":      False,
            "allowed":      False,
            "reason":       (
                "Not a meal time. Mess is open: "
                "Breakfast 07:00-09:30 | Lunch 12:00-14:30 | Dinner 19:00-21:30."
            ),
            "meal_type":    None,
            "student_id":   student_id,
            "student_name": student_name,
            "roll_no":      roll_no,
        }

    # -- Duplicate check: same student + same meal today -----------------------
    today = now.date()
    day_start_iso = datetime.combine(today, time.min, tzinfo=IST_TZ).isoformat()
    day_end_iso   = datetime.combine(today, time.max, tzinfo=IST_TZ).isoformat()

    try:
        dup_res = (
            client.table("mess_entries")
            .select("id, timestamp, meal_type")
            .eq("student_id",   student_id)
            .eq("meal_type",    meal_type)
            .eq("is_recognized", True)
            .gte("timestamp",   day_start_iso)
            .lte("timestamp",   day_end_iso)
            .limit(1)
            .execute()
        )

        if dup_res.data and len(dup_res.data) > 0:
            existing = dup_res.data[0]
            logger.info(
                "NOURISH Duplicate mess entry -- student=%s meal=%s already logged at %s",
                student_id, meal_type, existing.get("timestamp"),
            )
            return {
                "success":        True,
                "allowed":        False,
                "already_entered": True,
                "reason": (
                    f"You have already entered for {meal_type} today "
                    f"(logged at {existing.get('timestamp')})."
                ),
                "meal_type":    meal_type,
                "student_id":   student_id,
                "student_name": student_name,
                "roll_no":      roll_no,
                "entry":        existing,
            }

    except Exception as exc:
        logger.exception("NOURISH: Duplicate check failed -- %s", exc)
        # Fall through and attempt the insert anyway.

    # -- Insert new allowed entry ----------------------------------------------
    payload = {
        "student_id":        student_id,
        "is_recognized":     True,
        "meal_type":         meal_type,
        "timestamp":         now.isoformat(),
        "flagged_image_url": None,
    }

    try:
        ins_res = client.table("mess_entries").insert(payload).execute()
        entry = ins_res.data[0] if ins_res.data else payload
    except Exception as exc:
        logger.exception("NOURISH: Failed to insert mess entry -- %s", exc)
        return {
            "success":    False,
            "allowed":    False,
            "reason":     f"Database error while logging entry: {exc}",
            "meal_type":  meal_type,
            "student_id": student_id,
        }

    logger.info(
        "NOURISH Entry allowed -- student=%s name=%s meal=%s",
        student_id, student_name, meal_type,
    )
    return {
        "success":        True,
        "allowed":        True,
        "already_entered": False,
        "reason":         f"Entry granted for {meal_type}.",
        "meal_type":      meal_type,
        "student_id":     student_id,
        "student_name":   student_name,
        "roll_no":        roll_no,
        "confidence":     event.get("confidence"),
        "entry":          entry,
    }


# -- Query Helpers (Warden / Staff Views) --------------------------------------

def get_today_entries(target_date: Optional[date] = None) -> Dict[str, Any]:
    """
    Return a summary of today's mess entries broken down by meal type.

    Returns:
        {
          "success": bool,
          "date": str,
          "current_meal": str | None,
          "summary": {
            "breakfast": {"total": int, "recognised": int, "unrecognised": int},
            "lunch":     {...},
            "dinner":    {...},
            "total":     int,
          }
        }
    """
    try:
        client = get_client()
        now = _now_ist()
        td = target_date or now.date()

        start_iso = datetime.combine(td, time.min, tzinfo=IST_TZ).isoformat()
        end_iso   = datetime.combine(td, time.max, tzinfo=IST_TZ).isoformat()

        res = (
            client.table("mess_entries")
            .select("meal_type, is_recognized")
            .gte("timestamp", start_iso)
            .lte("timestamp", end_iso)
            .execute()
        )
        rows = res.data or []

        summary: Dict[str, Any] = {
            "breakfast": {"total": 0, "recognised": 0, "unrecognised": 0},
            "lunch":     {"total": 0, "recognised": 0, "unrecognised": 0},
            "dinner":    {"total": 0, "recognised": 0, "unrecognised": 0},
            "total":     len(rows),
        }

        for row in rows:
            meal = row.get("meal_type", "").lower()
            if meal not in ("breakfast", "lunch", "dinner"):
                continue
            summary[meal]["total"] += 1
            if row.get("is_recognized"):
                summary[meal]["recognised"] += 1
            else:
                summary[meal]["unrecognised"] += 1

        return {
            "success":      True,
            "date":         td.isoformat(),
            "current_meal": determine_meal_type(),
            "summary":      summary,
        }

    except Exception as exc:
        logger.exception("NOURISH: Error fetching today's entries -- %s", exc)
        return {
            "success": False,
            "error":   str(exc),
            "date":    str(target_date or _now_ist().date()),
        }


def get_entries_by_meal(
    meal_type: str,
    target_date: Optional[date] = None,
    limit: int = 100,
    offset: int = 0,
    recognised_only: bool = False,
) -> Dict[str, Any]:
    """
    Return paginated mess entries for a specific meal on a given date.

    Args:
        meal_type:       'breakfast' | 'lunch' | 'dinner'
        target_date:     Date to query (defaults to today IST).
        limit:           Max records (1-200).
        offset:          Pagination offset.
        recognised_only: If True, only return recognised-face entries.

    Returns:
        Dict with {success, meal_type, date, total_returned, entries}
    """
    if meal_type not in ("breakfast", "lunch", "dinner"):
        return {
            "success": False,
            "error":   "meal_type must be 'breakfast', 'lunch', or 'dinner'.",
        }

    try:
        client = get_client()
        td = target_date or _now_ist().date()

        start_iso = datetime.combine(td, time.min, tzinfo=IST_TZ).isoformat()
        end_iso   = datetime.combine(td, time.max, tzinfo=IST_TZ).isoformat()

        query = (
            client.table("mess_entries")
            .select("*")
            .eq("meal_type", meal_type)
            .gte("timestamp", start_iso)
            .lte("timestamp", end_iso)
            .order("timestamp", desc=False)
            .range(offset, offset + limit - 1)
        )

        if recognised_only:
            query = query.eq("is_recognized", True)

        res = query.execute()
        entries = res.data or []

        return {
            "success":        True,
            "meal_type":      meal_type,
            "date":           td.isoformat(),
            "total_returned": len(entries),
            "offset":         offset,
            "limit":          limit,
            "entries":        entries,
        }

    except Exception as exc:
        logger.exception("NOURISH: Error fetching meal entries -- %s", exc)
        return {
            "success":   False,
            "meal_type": meal_type,
            "error":     str(exc),
        }
