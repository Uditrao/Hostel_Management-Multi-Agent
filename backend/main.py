"""
Hostel Management Multi-Agent System — FastAPI Entry Point
Agents: IRIS | SENTINEL | NOURISH | FIXR | HERALD
"""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
import logging

from db.supabase_client import check_connection

# ─── Logging ──────────────────────────────────────────────────────────────────
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s  %(levelname)-8s  %(name)s — %(message)s",
    datefmt="%H:%M:%S",
)
logger = logging.getLogger("hostel.main")


# ─── Lifespan (startup / shutdown) ────────────────────────────────────────────
@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("🚀 Hostel Management System starting up …")
    ok = check_connection()
    if ok:
        logger.info("✅ Supabase connection verified.")
    else:
        logger.warning("⚠️  Supabase connection FAILED — check your .env keys.")

    # Start SENTINEL scheduler
    try:
        from agents.sentinel.scheduler_jobs import start_sentinel_scheduler, shutdown_sentinel_scheduler
        start_sentinel_scheduler()
    except Exception as exc:
        logger.warning("⚠️  Could not start SENTINEL scheduler: %s", exc)

    yield

    # Clean shutdown of scheduler
    try:
        from agents.sentinel.scheduler_jobs import shutdown_sentinel_scheduler
        shutdown_sentinel_scheduler()
    except Exception:
        pass

    logger.info("🛑 Hostel Management System shutting down.")


# ─── App ──────────────────────────────────────────────────────────────────────
app = FastAPI(
    title="Hostel Management Multi-Agent System",
    description=(
        "Multi-agent backend: IRIS (vision), SENTINEL (attendance), "
        "NOURISH (mess), FIXR (maintenance), HERALD (orchestrator)."
    ),
    version="0.1.0",
    lifespan=lifespan,
)

# ─── CORS ─────────────────────────────────────────────────────────────────────
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:3000"],  # Vite + CRA
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ─── Health Check ─────────────────────────────────────────────────────────────
@app.get("/health", tags=["System"])
async def health():
    """Liveness probe — returns OK if the server is running."""
    return {"status": "ok", "system": "Hostel Management Multi-Agent System"}


# ─── Routers (uncomment as each Phase is completed) ───────────────────────────
from agents.iris.router      import router as iris_router
from agents.sentinel.router  import router as sentinel_router
# from agents.nourish.router   import router as nourish_router
# from agents.fixr.router      import router as fixr_router
# from agents.herald.router    import router as herald_router
# from auth.router             import router as auth_router

app.include_router(iris_router,      prefix="/iris",     tags=["IRIS — Vision"])
app.include_router(sentinel_router,  prefix="/sentinel", tags=["SENTINEL — Attendance"])
# app.include_router(nourish_router,   prefix="/nourish",  tags=["NOURISH — Mess"])
# app.include_router(fixr_router,      prefix="/fixr",     tags=["FIXR — Maintenance"])
# app.include_router(herald_router,    prefix="/herald",   tags=["HERALD — Orchestrator"])
# app.include_router(auth_router,      prefix="/auth",     tags=["Auth"])
