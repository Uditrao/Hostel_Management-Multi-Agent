"""
HERALD -- Scheduler Jobs (Phase 5)
===================================
APScheduler background jobs for the Orchestrator Agent:

  * run_herald_nightly_job()   -- runs the full orchestrator at midnight IST
  * start_herald_scheduler()   -- starts the AsyncIOScheduler at FastAPI startup
  * shutdown_herald_scheduler()-- cleans up the scheduler at FastAPI shutdown
"""

from __future__ import annotations

import logging
from datetime import timezone, timedelta

from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger

logger = logging.getLogger("hostel.herald.scheduler")

IST_TZ = timezone(timedelta(hours=5, minutes=30))

_scheduler: AsyncIOScheduler | None = None
HERALD_JOB_ID = "herald_nightly_orchestrator_job"


async def run_herald_nightly_job() -> dict:
    """
    Nightly orchestrator run: execute all three HERALD anomaly checks.
    Scheduled at midnight IST (00:00 IST = 18:30 UTC previous day).
    """
    logger.info("HERALD: Nightly orchestrator job starting...")
    try:
        from agents.herald.orchestrator import run_orchestrator
        result = run_orchestrator()
        if result.get("success"):
            logger.info(
                "HERALD nightly job: %d new flags (att=%d | mess=%d | complaints=%d)",
                result.get("new_flags", 0),
                result.get("breakdown", {}).get("attendance_missed", 0),
                result.get("breakdown", {}).get("mess_missed_streak", 0),
                result.get("breakdown", {}).get("unresolved_complaint", 0),
            )
        else:
            logger.error("HERALD nightly job error: %s", result.get("error"))
        return result
    except Exception as exc:
        logger.exception("HERALD: Unhandled exception in nightly job -- %s", exc)
        return {"success": False, "error": str(exc)}


def start_herald_scheduler() -> AsyncIOScheduler:
    """
    Initialise and start the AsyncIOScheduler for HERALD.
    The nightly orchestrator runs at 00:00 IST every day.
    """
    global _scheduler
    if _scheduler is not None and _scheduler.running:
        return _scheduler

    _scheduler = AsyncIOScheduler()

    # Midnight IST = hour=0, minute=0, timezone=Asia/Kolkata
    # Using UTC offset directly since pytz may not be installed
    trigger = CronTrigger(
        hour=0,
        minute=0,
        timezone="Asia/Kolkata",
    )

    _scheduler.add_job(
        run_herald_nightly_job,
        trigger=trigger,
        id=HERALD_JOB_ID,
        replace_existing=True,
        name="HERALD Nightly Anomaly Detection & Warden Briefing",
    )

    _scheduler.start()
    logger.info(
        "HERALD Scheduler started (nightly anomaly job registered at 00:00 IST)."
    )
    return _scheduler


def shutdown_herald_scheduler() -> None:
    """Shut down the HERALD scheduler cleanly."""
    global _scheduler
    if _scheduler is not None and _scheduler.running:
        _scheduler.shutdown(wait=False)
        logger.info("HERALD Scheduler stopped.")
        _scheduler = None
