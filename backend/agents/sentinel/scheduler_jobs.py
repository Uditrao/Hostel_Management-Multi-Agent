"""
SENTINEL — Scheduler Jobs
==========================
Automated background tasks for the Attendance Agent using APScheduler:

  • run_defaulter_check_job()    — Daily attendance cutoff evaluation; identifies
                                   defaulters after gate window closes.
  • start_sentinel_scheduler()   — Starts the background scheduler at FastAPI startup.
  • shutdown_sentinel_scheduler()— Cleans up and shuts down scheduler at FastAPI shutdown.
  • reschedule_cutoff_job()      — Dynamically updates the daily cutoff trigger when
                                   the Warden modifies the attendance window end_time.
"""

from __future__ import annotations

import logging
from datetime import datetime
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger

from agents.sentinel.attendance import (
    get_attendance_window,
    get_defaulters,
    _get_current_ist_datetime,
    _parse_time,
    IST_TZ,
)

logger = logging.getLogger("hostel.sentinel.scheduler")

_scheduler: AsyncIOScheduler | None = None
DEFUALTER_JOB_ID = "sentinel_daily_cutoff_job"


async def run_defaulter_check_job() -> dict:
    """
    Executes the daily defaulters assessment at window closing.
    Calculates who missed attendance today and logs summary metrics.
    """
    now_ist = _get_current_ist_datetime()
    logger.info("🛡️ SENTINEL Cutoff Job: Running daily attendance defaulters check at %s…", now_ist)

    try:
        result = get_defaulters(target_date=now_ist.date())
        if result.get("success"):
            logger.info(
                "🛡️ SENTINEL Summary: %d enrolled | %d present | %d late | %d defaulters (%.1f%% attendance)",
                result.get("total_enrolled", 0),
                result.get("present_count", 0),
                result.get("late_count", 0),
                result.get("defaulter_count", 0),
                result.get("attendance_rate", 0.0),
            )
        else:
            logger.error("🛡️ SENTINEL Defaulter check error: %s", result.get("error"))
        return result
    except Exception as exc:
        logger.exception("🛡️ SENTINEL: Unhandled exception in defaulter check job — %s", exc)
        return {"success": False, "error": str(exc)}


def _get_cron_trigger_for_window() -> CronTrigger:
    """Read window end_time and return a CronTrigger in IST timezone."""
    try:
        window = get_attendance_window()
        end_time_obj = _parse_time(window.get("end_time", "09:00:00"))
        # Run at window end_time every day
        return CronTrigger(
            hour=end_time_obj.hour,
            minute=end_time_obj.minute,
            timezone=IST_TZ,
        )
    except Exception as exc:
        logger.warning("SENTINEL: Could not read window for cron trigger, using default (09:00 IST): %s", exc)
        return CronTrigger(hour=9, minute=0, timezone=IST_TZ)


def start_sentinel_scheduler() -> AsyncIOScheduler:
    """
    Initialize and start the AsyncIOScheduler for SENTINEL.
    """
    global _scheduler
    if _scheduler is not None and _scheduler.running:
        return _scheduler

    _scheduler = AsyncIOScheduler()
    trigger = _get_cron_trigger_for_window()

    _scheduler.add_job(
        run_defaulter_check_job,
        trigger=trigger,
        id=DEFUALTER_JOB_ID,
        replace_existing=True,
        name="SENTINEL Daily Attendance Cutoff & Defaulters Check",
    )

    _scheduler.start()
    logger.info("✅ SENTINEL Scheduler started (Daily attendance cutoff job registered).")
    return _scheduler


def reschedule_cutoff_job() -> None:
    """
    Reschedule the cutoff job with the updated attendance window end_time.
    """
    global _scheduler
    if _scheduler is None or not _scheduler.running:
        return

    trigger = _get_cron_trigger_for_window()
    _scheduler.reschedule_job(DEFUALTER_JOB_ID, trigger=trigger)
    logger.info("🔄 SENTINEL Scheduler: Cutoff job rescheduled to new window end_time.")


def shutdown_sentinel_scheduler() -> None:
    """
    Shut down the scheduler cleanly.
    """
    global _scheduler
    if _scheduler is not None and _scheduler.running:
        _scheduler.shutdown(wait=False)
        logger.info("🛑 SENTINEL Scheduler stopped.")
        _scheduler = None
