"""
Hostel Management Multi-Agent System — FastAPI Entry Point
Agents: IRIS | SENTINEL | NOURISH | FIXR | HERALD | AUTH (Phase 6)
"""

import os
import logging

# ── Low-Memory & CPU-Only Configuration for Cloud Deployments (Render 512MB RAM) ──
os.environ["CUDA_VISIBLE_DEVICES"] = "-1"           # Disable GPU scanning
os.environ["TF_CPP_MIN_LOG_LEVEL"] = "3"            # Mute TensorFlow C++ logs
os.environ["TF_ENABLE_ONEDNN_OPTS"] = "0"           # Disable memory-heavy oneDNN
os.environ["OMP_NUM_THREADS"] = "1"                 # Limit OpenMP threads
os.environ["TF_NUM_INTRAOP_THREADS"] = "1"          # Limit intra-op threads
os.environ["TF_NUM_INTEROP_THREADS"] = "1"          # Limit inter-op threads
from contextlib import asynccontextmanager

from dotenv import load_dotenv
load_dotenv()

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.openapi.utils import get_openapi
from fastapi.security import HTTPBearer

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

    # IRIS loads on-demand with restricted memory to avoid 512MB RAM exhaustion
    logger.info("IRIS: Low-memory CPU face engine configured.")

    # Start all background schedulers (SENTINEL + HERALD)
    try:
        from scheduler.jobs import start_all_schedulers
        start_all_schedulers()
    except Exception as exc:
        logger.warning("Could not start schedulers: %s", exc)

    yield

    # Clean shutdown of all schedulers
    try:
        from scheduler.jobs import shutdown_all_schedulers
        shutdown_all_schedulers()
    except Exception:
        pass

    logger.info("Hostel Management System shutting down.")


# ─── App ──────────────────────────────────────────────────────────────────────
app = FastAPI(
    title="Hostel Management Multi-Agent System",
    description=(
        "Multi-agent backend: IRIS (vision), SENTINEL (attendance), "
        "NOURISH (mess), FIXR (maintenance), HERALD (orchestrator), "
        "AUTH (Supabase JWT + role guards). "
        "Click the 🔒 Authorize button to enter your Bearer token."
    ),
    version="0.2.0",
    lifespan=lifespan,
)

# ─── CORS ─────────────────────────────────────────────────────────────────────
# Allows local dev, custom domain, and any Vercel production/preview deployment
cors_origins_env = os.getenv("ALLOWED_ORIGINS", "")
custom_origins = [o.strip() for o in cors_origins_env.split(",") if o.strip()]

app.add_middleware(
    CORSMiddleware,
    allow_origins=custom_origins or [
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:3000",
        "http://127.0.0.1:3000",
    ],
    allow_origin_regex=r"https?://.*(vercel\.app|localhost|127\.0\.0\.1)(:\d+)?",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ─── Health Check ─────────────────────────────────────────────────────────────
@app.get("/health", tags=["System"])
async def health():
    """Liveness probe — returns OK if the server is running."""
    return {"status": "ok", "system": "Hostel Management Multi-Agent System"}


# ─── Routers ──────────────────────────────────────────────────────────────────
from agents.iris.router      import router as iris_router
from agents.sentinel.router  import router as sentinel_router
from agents.nourish.router   import router as nourish_router
from agents.fixr.router      import router as fixr_router
from agents.herald.router    import router as herald_router
from auth.router             import router as auth_router

app.include_router(auth_router,      prefix="/auth",     tags=["AUTH — Auth & Roles"])
app.include_router(iris_router,      prefix="/iris",     tags=["IRIS — Vision"])
app.include_router(sentinel_router,  prefix="/sentinel", tags=["SENTINEL — Attendance"])
app.include_router(nourish_router,   prefix="/nourish",  tags=["NOURISH — Mess"])
app.include_router(fixr_router,      prefix="/fixr",     tags=["FIXR — Maintenance"])
app.include_router(herald_router,    prefix="/herald",   tags=["HERALD — Orchestrator"])
