"""
HERALD -- Orchestrator Core Logic (Phase 5)
==========================================
Cross-agent anomaly detection. Queries attendance, mess, and complaints tables
to surface actionable flags for the Warden dashboard.

Flag types (must match DB CHECK constraint in schema.sql):
  * attendance_missed      -- student has zero attendance entries in the last 3 days
  * mess_missed_streak     -- student has zero mess entries in the last 6 meals
  * unresolved_complaint   -- a high/critical complaint has been open for > 24 hours

Each flag is stored in anomaly_flags with a UNIQUE constraint on
(student_id, type, DATE(created_at)) so the same flag is never raised twice
on the same day.

Public API
----------
  run_orchestrator()           -> run all checks; return summary
  get_anomaly_flags()          -> warden views unread/all flags
  mark_flag_seen(flag_id)      -> warden dismisses a flag
  get_herald_stats()           -> quick counts for dashboard
"""

from __future__ import annotations

import logging
import re
import uuid
from datetime import datetime, timedelta, timezone, time
from typing import Any, Dict, List, Optional

from db.supabase_client import get_client

logger = logging.getLogger("hostel.herald.orchestrator")

# -- Constants ------------------------------------------------------------------

IST_OFFSET            = timezone(timedelta(hours=5, minutes=30))
ATTEND_LOOKBACK_DAYS  = 3     # flag if zero attendance in this many days
MESS_LOOKBACK_MEALS   = 6     # flag if zero mess entries across this many recent meal slots
COMPLAINT_STALE_HOURS = 24    # flag high/critical complaint open longer than this


# -- Internal helpers -----------------------------------------------------------

def _now_ist() -> datetime:
    return datetime.now(tz=IST_OFFSET)


def _clean_uuid(val: Optional[str]) -> Optional[str]:
    if not val:
        return None
    try:
        return str(uuid.UUID(str(val).strip()))
    except (ValueError, AttributeError):
        return None


def _get_students_on_leave(client, now: datetime) -> set:
    """Return student_ids with active approved leave / outpass for immunity."""
    try:
        now_iso = now.isoformat()
        res = (
            client.table("student_outpasses")
            .select("student_id")
            .eq("status", "approved")
            .lte("departure_datetime", now_iso)
            .gte("expected_return_datetime", now_iso)
            .execute()
        )
        return {r["student_id"] for r in (res.data or []) if r.get("student_id")}
    except Exception:
        # Table not yet mounted in Phase 10 — safe fallback
        return set()


def _is_new_student(student: dict, now: datetime) -> bool:
    """Return True if student was enrolled less than ATTEND_LOOKBACK_DAYS ago (grace period)."""
    enrolled_at_str = student.get("enrolled_at")
    if not enrolled_at_str:
        return False
    try:
        enrolled_dt = datetime.fromisoformat(enrolled_at_str.replace("Z", "+00:00"))
        return (now - enrolled_dt).total_seconds() < (ATTEND_LOOKBACK_DAYS * 86400)
    except Exception:
        return False


def _extract_student_from_detail(detail: str) -> Optional[Dict[str, Optional[str]]]:
    """Fallback extractor when direct student FK join is not populated."""
    if not detail:
        return None
    match = re.search(
        r"(?:by\s+)?([A-Za-z0-9\s]+?)\s*\(Roll:\s*([^,\)]+)(?:,\s*Room:\s*([^,\)]+))?\)",
        detail,
    )
    if match:
        name = match.group(1).strip()
        name = re.sub(r"^(?:CRITICAL|HIGH|MEDIUM|LOW)\s+\w+\s+complaint\s+by\s+", "", name, flags=re.I).strip()
        name = re.sub(r"^(?:CRITICAL DUAL ABSENCE|RESIDENT WELFARE ALERT|GATE ATTENDANCE DEFICIT):\s*", "", name, flags=re.I).strip()
        roll = match.group(2).strip() if match.group(2) else None
        room = match.group(3).strip() if match.group(3) else None
        return {"name": name, "roll_no": roll, "room_no": room}
    return None


def _insert_flag_safe(
    client,
    student_id: Optional[str],
    flag_type: str,
    detail: str,
) -> Optional[Dict[str, Any]]:
    """
    Insert an anomaly flag with active deduplication.
    If an unseen flag or a flag created today already exists for this student & type:
      - If detail differs, update the existing row with the latest detail.
      - If detail is identical, skip inserting a duplicate row.
    Returns the row dict or None on duplicate / error.
    """
    clean_sid = _clean_uuid(student_id)
    now = _now_ist()
    today_start_iso = datetime.combine(now.date(), time.min, tzinfo=IST_OFFSET).isoformat()

    try:
        # Query for existing flags for this student & type
        query = client.table("anomaly_flags").select("*").eq("type", flag_type)
        if clean_sid:
            query = query.eq("student_id", clean_sid)
        else:
            query = query.eq("detail", detail)

        existing_res = query.order("created_at", desc=True).limit(5).execute()
        existing_rows = existing_res.data or []

        for row in existing_rows:
            row_seen = row.get("seen_by_warden", False)
            row_created = row.get("created_at", "")
            is_today = row_created >= today_start_iso if row_created else False

            # If flag is active (unseen) or was already created today:
            if not row_seen or is_today:
                if row.get("detail") != detail:
                    # Update existing flag with latest detail
                    upd_res = (
                        client.table("anomaly_flags")
                        .update({"detail": detail, "created_at": now.isoformat()})
                        .eq("id", row["id"])
                        .execute()
                    )
                    logger.info("HERALD flag detail updated: id=%s type=%s", row["id"], flag_type)
                    return upd_res.data[0] if upd_res.data else row

                # Identical flag already active for today — skip duplicate
                logger.info(
                    "HERALD flag already exists (duplicate skipped): type=%s student=%s",
                    flag_type, clean_sid or "N/A",
                )
                return None

        # Insert fresh flag
        payload: Dict[str, Any] = {
            "type":           flag_type,
            "detail":         detail,
            "seen_by_warden": False,
        }
        if clean_sid:
            payload["student_id"] = clean_sid

        res = client.table("anomaly_flags").insert(payload).execute()
        rows = res.data or []
        if rows:
            logger.info(
                "HERALD flag inserted: type=%s student=%s",
                flag_type, student_id or "N/A",
            )
            return rows[0]
        return None
    except Exception as exc:
        logger.debug(
            "HERALD: flag insert skipped (error or constraint) type=%s student=%s: %s",
            flag_type, student_id, exc,
        )
        return None


# -- Check 1: Attendance Missed & Dual Absence Correlation ------------------

def _check_attendance_missed(client) -> List[Dict[str, Any]]:
    """
    Flag enrolled students with ZERO attendance_logs entries in the last ATTEND_LOOKBACK_DAYS.
    Correlates with dining activity:
      - If missing BOTH gate (3d) AND mess (6 meals / 48h) -> CRITICAL DUAL ABSENCE (emergency)
      - If missing gate BUT eating normally at mess -> GATE ATTENDANCE DEFICIT
    Suppressed for students with active approved leave (immunity) or in grace period (<3d).
    """
    now = _now_ist()
    cutoff_iso = (now - timedelta(days=ATTEND_LOOKBACK_DAYS)).isoformat()
    new_flags: List[Dict[str, Any]] = []

    # Clean up legacy single-meal false alarms if any exist
    try:
        client.table("anomaly_flags").delete().ilike("detail", "%1 meal%").execute()
    except Exception:
        pass

    try:
        students_res = client.table("students").select("id, name, roll_no, room_no, enrolled_at").execute()
        students = students_res.data or []

        # Gate attendees in window
        att_res = (
            client.table("attendance_logs")
            .select("student_id")
            .gte("timestamp", cutoff_iso)
            .execute()
        )
        attended_ids = {row["student_id"] for row in (att_res.data or []) if row.get("student_id")}

        # Dining activity in window
        mess_res = (
            client.table("mess_entries")
            .select("student_id, meal_type, timestamp")
            .eq("is_recognized", True)
            .gte("timestamp", cutoff_iso)
            .execute()
        )
        mess_data = mess_res.data or []
        _meal_rank = {"breakfast": 1, "lunch": 2, "dinner": 3}
        distinct_slots = list({
            (row["meal_type"], row["timestamp"][:10])
            for row in mess_data
            if row.get("timestamp") and row.get("meal_type")
        })
        distinct_slots.sort(
            key=lambda slot: (slot[1], _meal_rank.get(slot[0], 0)),
            reverse=True,
        )
        has_full_meal_history = len(distinct_slots) >= MESS_LOOKBACK_MEALS
        recent_slots = distinct_slots[:MESS_LOOKBACK_MEALS]
        recent_slot_set = set(recent_slots)
        students_who_ate = {
            row["student_id"]
            for row in mess_data
            if (row["meal_type"], row["timestamp"][:10]) in recent_slot_set
            and row.get("student_id")
        }

        # Immunity check: students on approved leave
        students_on_leave = _get_students_on_leave(client, now)

        for student in students:
            sid = student.get("id")
            if not sid:
                continue

            # Immunity: on approved leave
            if sid in students_on_leave:
                continue

            # Grace period: enrolled less than 3 days ago
            if _is_new_student(student, now):
                continue

            # Student has not marked gate attendance
            if sid not in attended_ids:
                name = student.get("name", "Unknown")
                roll = student.get("roll_no", "?")
                room = student.get("room_no", "?")

                if has_full_meal_history:
                    # Case 1: Missing BOTH Gate AND Mess (6 meals / 48h) -> CRITICAL DUAL ABSENCE
                    if sid not in students_who_ate:
                        detail = (
                            f"CRITICAL DUAL ABSENCE: {name} (Roll: {roll}, Room: {room}) "
                            f"has neither marked gate attendance in {ATTEND_LOOKBACK_DAYS} days "
                            f"nor eaten in the last {MESS_LOOKBACK_MEALS} meals (~48h). "
                            f"Immediate room inspection and parent contact required."
                        )
                    else:
                        # Case 2: Missing gate BUT dining normally -> GATE ATTENDANCE DEFICIT
                        detail = (
                            f"GATE ATTENDANCE DEFICIT: {name} (Roll: {roll}, Room: {room}) "
                            f"has not marked gate attendance in the last {ATTEND_LOOKBACK_DAYS} days "
                            f"(normal dining activity observed)."
                        )
                else:
                    # Fewer than 6 meal slots exist in DB -> standard 3-day gate deficit
                    detail = (
                        f"{name} (Roll: {roll}, Room: {room}) "
                        f"has not marked attendance in the last {ATTEND_LOOKBACK_DAYS} days."
                    )

                row = _insert_flag_safe(client, sid, "attendance_missed", detail)
                if row:
                    new_flags.append(row)

        logger.info(
            "HERALD attendance check: %d enrolled, %d attended in window, %d new flags",
            len(students), len(attended_ids), len(new_flags),
        )
    except Exception as exc:
        logger.exception("HERALD: Error in attendance missed check -- %s", exc)

    return new_flags


# -- Check 2: Mess Missed Streak (Resident Medical Distress) ------------------

def _check_mess_missed_streak(client) -> List[Dict[str, Any]]:
    """
    Flag students with ZERO recognised mess_entries across at least MESS_LOOKBACK_MEALS (~48h)
    who ARE present in the hostel (verified by gate attendance) -> RESIDENT WELFARE ALERT.
    (Students who missed both gate and mess are already flagged with CRITICAL DUAL ABSENCE).
    Suppressed for students with active approved leave or in grace period (<3d).
    """
    new_flags: List[Dict[str, Any]] = []

    # Clean up legacy single-meal false alarms if any exist
    try:
        client.table("anomaly_flags").delete().ilike("detail", "%1 meal%").execute()
    except Exception:
        pass

    try:
        now = _now_ist()
        lookback_iso = (now - timedelta(days=3)).isoformat()  # 3 days covers up to 9 meals

        mess_res = (
            client.table("mess_entries")
            .select("student_id, meal_type, timestamp")
            .eq("is_recognized", True)
            .gte("timestamp", lookback_iso)
            .execute()
        )
        mess_data = mess_res.data or []

        # Distinct (meal_type, date) slots that actually occurred, chronologically newest first
        _meal_rank = {"breakfast": 1, "lunch": 2, "dinner": 3}
        distinct_slots = list({
            (row["meal_type"], row["timestamp"][:10])
            for row in mess_data
            if row.get("timestamp") and row.get("meal_type")
        })
        distinct_slots.sort(
            key=lambda slot: (slot[1], _meal_rank.get(slot[0], 0)),
            reverse=True,
        )

        # Guard: require at least MESS_LOOKBACK_MEALS (6) distinct slots on record
        if len(distinct_slots) < MESS_LOOKBACK_MEALS:
            logger.info(
                "HERALD: Only %d mess slots recorded in lookback window (need %d) -- skipping streak check.",
                len(distinct_slots), MESS_LOOKBACK_MEALS,
            )
            return new_flags

        recent_slots = distinct_slots[:MESS_LOOKBACK_MEALS]
        recent_slot_set = set(recent_slots)
        students_who_ate = {
            row["student_id"]
            for row in mess_data
            if (row["meal_type"], row["timestamp"][:10]) in recent_slot_set
            and row.get("student_id")
        }

        # Check gate attendance (student is verified active inside hostel)
        att_res = (
            client.table("attendance_logs")
            .select("student_id")
            .gte("timestamp", lookback_iso)
            .execute()
        )
        students_at_hostel = {row["student_id"] for row in (att_res.data or []) if row.get("student_id")}

        students_res = client.table("students").select("id, name, roll_no, room_no, enrolled_at").execute()
        students = students_res.data or []

        # Immunity check: students on approved leave
        students_on_leave = _get_students_on_leave(client, now)

        for student in students:
            sid = student.get("id")
            if not sid:
                continue

            # Immunity: on approved leave
            if sid in students_on_leave:
                continue

            # Grace period
            if _is_new_student(student, now):
                continue

            # Medical distress: present in hostel BUT has missed 6 consecutive meals (~48h)
            if sid in students_at_hostel and sid not in students_who_ate:
                name = student.get("name", "Unknown")
                roll = student.get("roll_no", "?")
                room = student.get("room_no", "?")
                detail = (
                    f"RESIDENT WELFARE ALERT: {name} (Roll: {roll}, Room: {room}) "
                    f"is verified inside hostel premises but has missed {MESS_LOOKBACK_MEALS} consecutive meals (~48h). "
                    f"In-room medical check recommended."
                )
                row = _insert_flag_safe(client, sid, "mess_missed_streak", detail)
                if row:
                    new_flags.append(row)

        logger.info(
            "HERALD mess streak check: %d slots, %d students ate, %d new flags",
            len(recent_slots), len(students_who_ate), len(new_flags),
        )
    except Exception as exc:
        logger.exception("HERALD: Error in mess missed streak check -- %s", exc)

    return new_flags


# -- Check 3: Unresolved High/Critical Complaints ------------------------------

def _check_unresolved_complaints(client) -> List[Dict[str, Any]]:
    """
    Flag any high or critical complaint that has been open for more than
    COMPLAINT_STALE_HOURS hours without being assigned or resolved.
    """
    new_flags: List[Dict[str, Any]] = []

    try:
        now = _now_ist()
        stale_cutoff_iso = (now - timedelta(hours=COMPLAINT_STALE_HOURS)).isoformat()

        res = (
            client.table("complaints")
            .select(
                "id, student_id, category, urgency, created_at, "
                "students(name, roll_no, room_no)"
            )
            .eq("status", "open")
            .in_("urgency", ["high", "critical"])
            .lte("created_at", stale_cutoff_iso)
            .execute()
        )
        complaints = res.data or []

        for complaint in complaints:
            sid      = complaint.get("student_id")
            cid      = complaint.get("id", "unknown")
            urgency  = complaint.get("urgency", "high")
            category = complaint.get("category", "other")
            student  = complaint.get("students") or {}
            name     = student.get("name", "Unknown")
            roll_no  = student.get("roll_no", "?")

            created_raw = complaint.get("created_at", "")
            try:
                created_dt = datetime.fromisoformat(created_raw.replace("Z", "+00:00"))
                hours_open = round((now - created_dt).total_seconds() / 3600, 1)
            except Exception:
                hours_open = COMPLAINT_STALE_HOURS

            detail = (
                f"{urgency.upper()} {category} complaint by {name} "
                f"(Roll: {roll_no}) has been open for {hours_open}h. "
                f"Complaint ID: {cid}."
            )
            row = _insert_flag_safe(client, sid, "unresolved_complaint", detail)
            if row:
                new_flags.append(row)

        logger.info(
            "HERALD complaint check: %d stale open high/critical, %d new flags",
            len(complaints), len(new_flags),
        )
    except Exception as exc:
        logger.exception("HERALD: Error in unresolved complaints check -- %s", exc)

    return new_flags


# -- Public: Run Orchestrator --------------------------------------------------

def run_orchestrator() -> Dict[str, Any]:
    """
    Execute all three anomaly checks and return a run summary.

    Called by:
      * APScheduler nightly cron (midnight IST)
      * POST /herald/run  (Warden on-demand trigger)

    Returns:
        {
          "success": bool,
          "run_at": str,
          "new_flags": int,
          "breakdown": {"attendance_missed": int, "mess_missed_streak": int,
                        "unresolved_complaint": int},
          "flags": [...],
        }
    """
    run_at = _now_ist().isoformat()
    logger.info("HERALD: Orchestrator run started at %s", run_at)

    try:
        client = get_client()
    except Exception as exc:
        logger.error("HERALD: Cannot connect to DB -- %s", exc)
        return {"success": False, "error": str(exc), "run_at": run_at}

    att_flags       = _check_attendance_missed(client)
    mess_flags      = _check_mess_missed_streak(client)
    complaint_flags = _check_unresolved_complaints(client)

    all_flags = att_flags + mess_flags + complaint_flags

    logger.info(
        "HERALD: Run complete -- %d new flags (att=%d | mess=%d | complaints=%d)",
        len(all_flags), len(att_flags), len(mess_flags), len(complaint_flags),
    )

    return {
        "success":   True,
        "run_at":    run_at,
        "new_flags": len(all_flags),
        "breakdown": {
            "attendance_missed":    len(att_flags),
            "mess_missed_streak":   len(mess_flags),
            "unresolved_complaint": len(complaint_flags),
        },
        "flags": all_flags,
    }


# -- Public: Warden View Anomalies --------------------------------------------

def get_anomaly_flags(
    unseen_only: bool = False,
    flag_type:   Optional[str] = None,
    limit:       int  = 100,
    offset:      int  = 0,
) -> Dict[str, Any]:
    """
    Fetch anomaly flags for the Warden dashboard.

    Args:
        unseen_only: Return only unseen flags.
        flag_type:   Optional type filter.
        limit:       Max rows.
        offset:      Pagination offset.
    """
    valid_types = {"attendance_missed", "mess_missed_streak", "unresolved_complaint"}

    if flag_type and flag_type not in valid_types:
        return {
            "success": False,
            "message": f"Invalid flag_type '{flag_type}'. Valid: {', '.join(sorted(valid_types))}.",
            "flags":   [],
        }

    try:
        client = get_client()

        query = (
            client.table("anomaly_flags")
            .select("*, students(name, roll_no, room_no)")
            .order("created_at", desc=True)
        )
        if unseen_only:
            query = query.eq("seen_by_warden", False)
        if flag_type:
            query = query.eq("type", flag_type)

        query = query.range(offset, offset + limit - 1)
        res   = query.execute()
        flags = res.data or []

        # Normalize student relationship and fallback extract from detail if needed
        for f in flags:
            stu = f.get("students") or f.get("student")
            if isinstance(stu, list) and len(stu) > 0:
                stu = stu[0]
            elif not isinstance(stu, dict):
                stu = None

            if not stu or not stu.get("name") or stu.get("name") == "Unknown":
                extracted = _extract_student_from_detail(f.get("detail", ""))
                if extracted:
                    stu = {**(stu or {}), **extracted}

            f["student"] = stu or {"name": "Hostel Resident"}
            f["students"] = f["student"]

        # Filter out legacy single-meal false alarms
        flags = [f for f in flags if "1 meal" not in f.get("detail", "").lower()]

        # Deduplicate rows by student and flag type (keep newest record)
        seen_keys = set()
        deduped_flags = []
        dup_ids_to_clean = []
        for f in flags:
            stu = f.get("student") or {}
            sid = f.get("student_id") or stu.get("roll_no") or f.get("detail", "")[:35]
            ftype = f.get("type")
            key = (sid, ftype)
            if key not in seen_keys:
                seen_keys.add(key)
                deduped_flags.append(f)
            else:
                dup_ids_to_clean.append(f["id"])

        flags = deduped_flags

        # Silently clean up redundant duplicate rows from Supabase
        if dup_ids_to_clean:
            try:
                client.table("anomaly_flags").delete().in_("id", dup_ids_to_clean).execute()
            except Exception:
                pass

        unseen_count = sum(1 for f in flags if not f.get("seen_by_warden"))

        return {
            "success":       True,
            "total":         len(flags),
            "unseen_count":  unseen_count,
            "flags":         flags,
            "filter_applied": {
                "unseen_only": unseen_only,
                "flag_type":   flag_type,
            },
        }

    except Exception as exc:
        logger.exception("HERALD: Error fetching anomaly flags -- %s", exc)
        return {"success": False, "message": str(exc), "flags": []}


# -- Public: Mark Flag As Seen ------------------------------------------------

def mark_flag_seen(flag_id: str) -> Dict[str, Any]:
    """
    Mark a single anomaly flag as seen by the Warden.

    Returns:
        {success, flag, message}
    """
    clean_fid = _clean_uuid(flag_id)
    if not clean_fid:
        return {"success": False, "message": "Invalid flag_id. Must be a valid UUID."}

    try:
        client = get_client()

        check_res = (
            client.table("anomaly_flags")
            .select("id, seen_by_warden")
            .eq("id", clean_fid)
            .limit(1)
            .execute()
        )
        if not check_res.data:
            return {"success": False, "message": f"Flag '{clean_fid}' not found."}

        if check_res.data[0].get("seen_by_warden"):
            return {
                "success": True,
                "message": "Flag was already marked as seen.",
                "flag":    check_res.data[0],
            }

        res = (
            client.table("anomaly_flags")
            .update({"seen_by_warden": True})
            .eq("id", clean_fid)
            .execute()
        )
        if not res.data:
            return {"success": False, "message": "Update returned no data."}

        logger.info("HERALD: Flag marked seen: id=%s", clean_fid)
        return {"success": True, "message": "Flag marked as seen.", "flag": res.data[0]}

    except Exception as exc:
        logger.exception("HERALD: Error marking flag seen -- %s", exc)
        return {"success": False, "message": str(exc)}


# -- Public: Herald Stats -----------------------------------------------------

def get_herald_stats() -> Dict[str, Any]:
    """
    Aggregate counts of anomaly flags for the Warden dashboard card.

    Returns:
        {success, total_flags, unseen, by_type, unseen_by_type}
    """
    try:
        client = get_client()
        res    = client.table("anomaly_flags").select("type, seen_by_warden").execute()
        data   = res.data or []

        types = ["attendance_missed", "mess_missed_streak", "unresolved_complaint"]
        return {
            "success":     True,
            "total_flags": len(data),
            "unseen":      sum(1 for f in data if not f.get("seen_by_warden")),
            "by_type": {
                t: sum(1 for f in data if f.get("type") == t) for t in types
            },
            "unseen_by_type": {
                t: sum(1 for f in data if f.get("type") == t and not f.get("seen_by_warden"))
                for t in types
            },
        }

    except Exception as exc:
        logger.exception("HERALD: Error fetching stats -- %s", exc)
        return {"success": False, "message": str(exc)}
