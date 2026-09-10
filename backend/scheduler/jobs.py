"""
Consolidated Scheduler (Phase 5)
=================================
All APScheduler background jobs for the Hostel Management System are
registered here and started/stopped from main.py lifespan.

Jobs:
  * SENTINEL daily cutoff job   -- marks defaulters after attendance window closes
  * HERALD nightly anomaly run  -- cross-agent anomaly detection at midnight IST

The SENTINEL defaulter job is still owned by its own module
(agents/sentinel/scheduler_jobs.py) because it needs to be rescheduled
dynamically when the Warden updates the attendance window.
This module starts both schedulers cleanly on startup.
"""

from __future__ import annotations

import logging

logger = logging.getLogger("hostel.scheduler.jobs")


def start_all_schedulers() -> None:
    """
    Start both SENTINEL and HERALD background schedulers.
    Called from main.py lifespan on application startup.
    """
    # ── SENTINEL scheduler (already handles its own APScheduler instance) ──
    try:
        from agents.sentinel.scheduler_jobs import start_sentinel_scheduler
        start_sentinel_scheduler()
        logger.info("Consolidated scheduler: SENTINEL scheduler started.")
    except Exception as exc:
        logger.warning("Consolidated scheduler: Could not start SENTINEL scheduler: %s", exc)

    # ── HERALD nightly cron ─────────────────────────────────────────────────
    try:
        from agents.herald.scheduler_jobs import start_herald_scheduler
        start_herald_scheduler()
        logger.info("Consolidated scheduler: HERALD scheduler started.")
    except Exception as exc:
        logger.warning("Consolidated scheduler: Could not start HERALD scheduler: %s", exc)


def shutdown_all_schedulers() -> None:
    """
    Cleanly shut down both schedulers.
    Called from main.py lifespan on application shutdown.
    """
    try:
        from agents.sentinel.scheduler_jobs import shutdown_sentinel_scheduler
        shutdown_sentinel_scheduler()
    except Exception:
        pass

    try:
        from agents.herald.scheduler_jobs import shutdown_herald_scheduler
        shutdown_herald_scheduler()
    except Exception:
        pass

    logger.info("Consolidated scheduler: all schedulers shut down.")
