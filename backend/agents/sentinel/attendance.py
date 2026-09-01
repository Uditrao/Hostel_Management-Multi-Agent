"""
SENTINEL — Attendance Logic
============================
Core business logic for the Attendance Agent:

  • record_gate_attendance()   — process gate identity event from IRIS/kiosk,
                                 enforce time window (present vs late),
                                 and idempotently log attendance.
  • get_student_attendance()   — fetch attendance history for a student.
  • get_defaulters()           — compute defaulters (students with no log) for a date.
  • get_attendance_window()    — retrieve active attendance time window.
  • update_attendance_window() — warden updates window times & active days.
"""

from __future__ import annotations

import logging
from datetime import datetime, date, time, timezone, timedelta
from typing import Optional, List, Dict, Any

from db.supabase_client import get_client

logger = logging.getLogger("hostel.sentinel.attendance")

# Timezone matching Postgres schema index (Asia/Kolkata / IST: UTC+05:30)
IST_TZ = timezone(timedelta(hours=5, minutes=30))

# Default attendance window fallback
DEFAULT_WINDOW = {
    "start_time": "07:00:00",
    "end_time": "09:00:00",
    "active_days": ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat"],
}


def _get_current_ist_datetime() -> datetime:
    """Return the current datetime in Asia/Kolkata timezone."""
    return datetime.now(IST_TZ)


def _parse_time(t: Any) -> time:
    """Parse time object or string formatted as HH:MM or HH:MM:SS."""
    if isinstance(t, time):
        return t
    t_str = str(t).strip()
    parts = t_str.split(":")
    hour = int(parts[0])
    minute = int(parts[1]) if len(parts) > 1 else 0
    second = int(parts[2].split(".")[0]) if len(parts) > 2 else 0
    return time(hour, minute, second)


# ── Attendance Window CRUD ───────────────────────────────────────────────────

def get_attendance_window() -> Dict[str, Any]:
    """
    Retrieve the configured attendance window from Supabase.
    If no window is configured, returns and seeds the default window.
    """
    try:
        client = get_client()
        result = client.table("attendance_window").select("*").limit(1).execute()
        if result.data and len(result.data) > 0:
            return result.data[0]

        # Seed default if empty
        insert_res = (
            client.table("attendance_window")
            .insert(DEFAULT_WINDOW)
            .execute()
        )
        if insert_res.data:
            return insert_res.data[0]
        return DEFAULT_WINDOW
    except Exception as exc:
        logger.exception("SENTINEL: Error retrieving attendance window — %s", exc)
        return DEFAULT_WINDOW


def update_attendance_window(
    start_time: str,
    end_time: str,
    active_days: List[str],
) -> Dict[str, Any]:
    """
    Update the attendance window configuration (Warden action).
    """
    try:
        client = get_client()
        existing = client.table("attendance_window").select("id").limit(1).execute()

        payload = {
            "start_time": str(start_time),
            "end_time": str(end_time),
            "active_days": active_days,
        }

        if existing.data and len(existing.data) > 0:
            window_id = existing.data[0]["id"]
            result = (
                client.table("attendance_window")
                .update(payload)
                .eq("id", window_id)
                .execute()
            )
        else:
            result = client.table("attendance_window").insert(payload).execute()

        if result.data:
            logger.info("SENTINEL: Attendance window updated successfully.")
            return {"success": True, "window": result.data[0]}
        return {"success": False, "message": "Failed to update attendance window."}

    except Exception as exc:
        logger.exception("SENTINEL: Error updating attendance window — %s", exc)
        return {"success": False, "message": str(exc)}


# ── Gate Attendance Logging ───────────────────────────────────────────────────

def record_gate_attendance(event: Dict[str, Any]) -> Dict[str, Any]:
    """
    Process an identity event at the hostel gate:
      1. Validates recognition status and student_id.
      2. Checks if attendance was already logged for today (idempotent).
      3. Evaluates current time against the attendance window → 'present' or 'late'.
      4. Inserts into attendance_logs table.

    Args:
        event: Dict containing at least:
               {"recognized": bool, "student_id": str, ...}

    Returns:
        Dict with {success, already_marked, status, log, message, student}
    """
    if not event.get("recognized") or not event.get("student_id"):
        return {
            "success": False,
            "already_marked": False,
            "status": "unrecognized",
            "message": "Unrecognized face or missing student_id. Attendance not marked.",
        }

    student_id = str(event["student_id"]).strip()
    client = get_client()

    now_ist = _get_current_ist_datetime()
    today_date_str = now_ist.date().isoformat()
    day_name = now_ist.strftime("%a")  # 'Mon', 'Tue', etc.
    current_time = now_ist.time()

    # 1. Check if student already marked today in IST
    # Compute day start and end in UTC/ISO for query
    start_of_day_iso = datetime.combine(now_ist.date(), time.min, tzinfo=IST_TZ).isoformat()
    end_of_day_iso = datetime.combine(now_ist.date(), time.max, tzinfo=IST_TZ).isoformat()

    try:
        existing = (
            client.table("attendance_logs")
            .select("*")
            .eq("student_id", student_id)
            .gte("timestamp", start_of_day_iso)
            .lte("timestamp", end_of_day_iso)
            .limit(1)
            .execute()
        )

        if existing.data and len(existing.data) > 0:
            existing_log = existing.data[0]
            logger.info(
                "SENTINEL: Attendance already marked today for student=%s (status=%s)",
                student_id,
                existing_log.get("status"),
            )
            return {
                "success": True,
                "already_marked": True,
                "status": existing_log.get("status"),
                "student_id": student_id,
                "student_name": event.get("student_name"),
                "roll_no": event.get("roll_no"),
                "log": existing_log,
                "message": f"Attendance was already marked as '{existing_log.get('status')}' for today ({today_date_str}).",
            }

        # 2. Check attendance window to determine status ('present' vs 'late')
        window = get_attendance_window()
        window_start = _parse_time(window.get("start_time", "07:00:00"))
        window_end = _parse_time(window.get("end_time", "09:00:00"))
        active_days = window.get("active_days", ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat"])

        # Determine attendance status:
        # If today is an active day and entry is between window_start and window_end: 'present'
        # Otherwise: 'late'
        if day_name in active_days and (window_start <= current_time <= window_end):
            status = "present"
        else:
            status = "late"

        # 3. Insert new attendance log
        insert_payload = {
            "student_id": student_id,
            "timestamp": now_ist.isoformat(),
            "status": status,
            "method": "face",
        }

        insert_res = client.table("attendance_logs").insert(insert_payload).execute()
        if not insert_res.data or len(insert_res.data) == 0:
            return {
                "success": False,
                "already_marked": False,
                "message": "Failed to insert attendance log into database.",
            }

        created_log = insert_res.data[0]
        logger.info(
            "SENTINEL ✅ Marked attendance: student=%s status=%s at %s",
            student_id,
            status,
            now_ist.strftime("%H:%M:%S"),
        )

        return {
            "success": True,
            "already_marked": False,
            "status": status,
            "student_id": student_id,
            "student_name": event.get("student_name"),
            "roll_no": event.get("roll_no"),
            "log": created_log,
            "message": f"Attendance successfully marked as '{status}'.",
        }

    except Exception as exc:
        logger.exception("SENTINEL: Database error recording attendance — %s", exc)
        return {
            "success": False,
            "already_marked": False,
            "message": f"Error recording attendance: {exc}",
        }


# ── Attendance Querying ───────────────────────────────────────────────────────

def get_student_attendance(
    student_id: str,
    limit: int = 50,
) -> Dict[str, Any]:
    """
    Retrieve attendance logs for a specific student, sorted by newest first.
    """
    try:
        client = get_client()
        result = (
            client.table("attendance_logs")
            .select("*")
            .eq("student_id", student_id)
            .order("timestamp", desc=True)
            .limit(limit)
            .execute()
        )

        logs = result.data or []
        present_count = sum(1 for log in logs if log.get("status") == "present")
        late_count = sum(1 for log in logs if log.get("status") == "late")

        return {
            "success": True,
            "student_id": student_id,
            "total_records": len(logs),
            "present_count": present_count,
            "late_count": late_count,
            "logs": logs,
        }

    except Exception as exc:
        logger.exception("SENTINEL: Error retrieving student attendance — %s", exc)
        return {
            "success": False,
            "student_id": student_id,
            "error": str(exc),
            "logs": [],
        }


# ── Defaulters Calculation ───────────────────────────────────────────────────

def get_defaulters(target_date: Optional[date] = None) -> Dict[str, Any]:
    """
    Find all enrolled students who have not logged attendance on `target_date`.
    Defaults to today's date in IST.
    """
    try:
        client = get_client()

        if target_date is None:
            target_date = _get_current_ist_datetime().date()

        date_str = target_date.isoformat()
        start_iso = datetime.combine(target_date, time.min, tzinfo=IST_TZ).isoformat()
        end_iso = datetime.combine(target_date, time.max, tzinfo=IST_TZ).isoformat()

        # 1. Fetch all approved/enrolled students
        students_res = (
            client.table("students")
            .select("id, roll_no, name, room_no")
            .execute()
        )
        all_students = students_res.data or []

        # 2. Fetch all attendance logs for the target date
        logs_res = (
            client.table("attendance_logs")
            .select("student_id, status, timestamp")
            .gte("timestamp", start_iso)
            .lte("timestamp", end_iso)
            .execute()
        )
        logs = logs_res.data or []

        # Create mapping of student_id to their logged status
        attended_ids = {log["student_id"]: log["status"] for log in logs if "student_id" in log}

        # 3. Identify defaulters (students without an attendance log)
        defaulters = []
        present_count = 0
        late_count = 0

        for student in all_students:
            s_id = student["id"]
            if s_id in attended_ids:
                if attended_ids[s_id] == "present":
                    present_count += 1
                elif attended_ids[s_id] == "late":
                    late_count += 1
            else:
                defaulters.append({
                    "student_id": s_id,
                    "roll_no": student.get("roll_no"),
                    "name": student.get("name"),
                    "room_no": student.get("room_no"),
                    "date": date_str,
                    "status": "absent",
                })

        return {
            "success": True,
            "date": date_str,
            "total_enrolled": len(all_students),
            "present_count": present_count,
            "late_count": late_count,
            "defaulter_count": len(defaulters),
            "attendance_rate": (
                round((present_count + late_count) / len(all_students) * 100, 1)
                if all_students else 0.0
            ),
            "defaulters": defaulters,
        }

    except Exception as exc:
        logger.exception("SENTINEL: Error calculating defaulters — %s", exc)
        return {
            "success": False,
            "date": str(target_date),
            "error": str(exc),
            "defaulters": [],
        }
