# BRAIN.MD — SYSTEM STATE, ARCHITECTURE & DEVELOPER BLUEPRINT
> **Single Source of Truth** for the Hostel Management Multi-Agent System.  
> Read this file first in any new conversation to maintain full context awareness, understand architectural decisions, and prevent regression.

---

## 1. System Architecture & Tech Stack

| Layer | Technology | Key Responsibility / Production Configuration |
|---|---|---|
| **API Runtime** | Python 3.11.9 / FastAPI | Async ASGI server, Lifespan scheduler, CORS matching `*.vercel.app` & localhost |
| **Hosting (API)** | **Render** (Free Tier) | `https://hostel-management-multi-agent-api.onrender.com` (Hard physical ceiling: 512 MB RAM) |
| **Hosting (Client)** | **Vercel** | SPA React application with rewrite rules in `frontend/vercel.json` |
| **Database** | Supabase (PostgreSQL 15 + `pgvector`) | Relational store + 512-d vector index (`ivfflat`, `vector_cosine_ops`), RPC `match_face()` |
| **Authentication** | Supabase Auth + JWT | HS256 local verification via `SUPABASE_JWT_SECRET` with remote fallback; Role guards (`student`, `warden`, `mess_staff`) |
| **Vision Biometrics** | **FaceNet ONNX (512-d)** | `haikalmumtaz/facenet-onnx` run via `onnxruntime` + OpenCV Haar Cascade (~40MB RAM, ~50ms latency) |
| **Multimodal LLM** | Google Gemini API (REST) | Menu PDF understanding with 5-tier fallback (`gemini-2.0-flash`, `1.5-flash`, etc.) |
| **Structured NLP** | Groq API (`llama-3.3-70b-versatile`) | Fast JSON schema parsing for FIXR complaint classification and NOURISH inventory commands |
| **Task Scheduler** | APScheduler | Background jobs: dynamic gate curfew cutoff evaluation, defaulters tabulation, HERALD digests |
| **Frontend** | React 18 (Vite) + Tailwind CSS + Lucide | Role-based SPA; Axios interceptor with custom 120s timeout for vision/multimodal calls |

---

## 2. Critical Architectural Pivot: DeepFace $\rightarrow$ FaceNet ONNX

### Why the Change Was Made:
1. **The Render Free Tier Ceiling**: Render provides **512 MB physical RAM**.
2. **DeepFace + TensorFlow Blocker**:
   - Initial implementation used `deepface` with `Facenet512` on a TensorFlow/Keras backend.
   - Importing TensorFlow, building the Inception-ResNet-v1 computational graph, and loading weights consumed **550 MB – 650 MB RAM**.
   - The Linux kernel instantly fired an uncatchable Out-Of-Memory (OOM) `SIGKILL (kill -9)`.
   - Result: Render crashed into an infinite reboot loop (`live -> crash -> live`), causing 30,000ms frontend timeouts.
3. **The Solution (FaceNet ONNX)**:
   - Converted the face embedding engine to **ONNX Runtime** (`haikalmumtaz/facenet-onnx`).
   - Removed `deepface`, `tf-keras`, and `werkzeug` completely from `requirements.txt`.
   - Pre-caches `facenet.onnx` (89.6 MB) via `download_weights.py` during build and local check in `face_engine.py`.
   - **RAM Footprint**: Dropped from **~600 MB** to **~40 MB** (Total process memory ~140 MB, leaving 370+ MB headroom on Render).
   - **Inference Speed**: Dropped from **~6,000 ms** to **~50 ms** on CPU.
   - **Database Compatibility**: **100% Identical** — outputs an L2-normalized 512-dimensional vector matching Supabase `VECTOR(512)` and `match_face()` RPC.

---

## 3. Curfew & Attendance Logic (SENTINEL)

### Database Table: `attendance_window`
* Columns: `id (UUID)`, `start_time (TIME)`, `end_time (TIME)`, `active_days (TEXT[])`.
* Default Fallback: `start_time = '19:00:00'`, `end_time = '22:30:00'`, `active_days = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun']`.

### Evaluation Rules in `record_gate_attendance()`:
1. **On-Time Check-in (`✓ PRESENT`)**:
   - Any check-in occurring **on or before `end_time`** (including earlier in the evening/day) is marked as `present`.
2. **Late Check-in (`⚠️ LATE ENTRY`)**:
   - A check-in is only tagged as `late` if the student arrives **after `end_time`** on an active curfew day.
3. **Overnight Windows**:
   - Handled cleanly when `start_time > end_time` (e.g. `21:00` to `01:00` next morning).
4. **Warden Control**:
   - Warden can adjust timings and active days anytime from the **Warden Dashboard** or **Gate Kiosk** via `AttendanceWindowModal.jsx` (`PUT /sentinel/window` via `sentinelApi` / `wardenApi`).
   - Updates reschedule the APScheduler cutoff job dynamically.
5. **Smart Idempotency & Status Upgrades**:
   - If a student was tagged as `late` earlier in the day (e.g. afternoon movement), scanning on-time during the official curfew window automatically **upgrades** their record from `late` $\rightarrow$ `✓ PRESENT`.
   - If a student was already marked `present`, subsequent re-scans preserve their `present` status (prevents accidental downgrades).

---

## 4. Multi-Agent Ecosystem Overview

```
                               ┌─────────────────────────────────────────┐
                               │       HERALD (Orchestrator Agent)       │
                               │  Cross-Agent Anomaly & Welfare Engine   │
                               └────────────────────┬────────────────────┘
                                                    │
             ┌──────────────────────┬───────────────┴──────────────┬──────────────────────┐
             ▼                      ▼                              ▼                      ▼
      ┌──────────────┐      ┌──────────────┐                ┌──────────────┐      ┌──────────────┐
      │  IRIS (Eye)  │      │   SENTINEL   │                │   NOURISH    │      │  FIXR (Fix)  │
      │  Biometrics  │      │  Attendance  │                │ Mess/Supply  │      │ Maintenance  │
      └──────────────┘      └──────────────┘                └──────────────┘      └──────────────┘
```

1. **IRIS (`/iris`)**: Contactless facial biometric engine.
   - Files: `backend/agents/iris/face_engine.py`, `enrollment.py`, `recognition.py`, `router.py`.
   - Functions: `get_embedding()`, `get_averaged_embedding()`.
   - Match Threshold: Cosine similarity $\ge 0.55$ (distance $\le 0.45$).
2. **SENTINEL (`/sentinel`)**: Gate attendance and curfew guardian.
   - Files: `backend/agents/sentinel/attendance.py`, `scheduler_jobs.py`, `router.py`.
   - Functions: `record_gate_attendance()`, `get_defaulters()`, `update_attendance_window()`.
3. **NOURISH (`/nourish`)**: Dining logistics & mess operations.
   - Files: `backend/agents/nourish/entry.py`, `inventory.py`, `menu.py`, `nlp_command.py`, `router.py`.
   - Features: Mess kiosk duplicate prevention, weekly PDF menu parsing with Gemini, stock depletion, food wastage logger, item-deduplicated low-stock alerts with live stock level enrichment.
4. **FIXR (`/fixr`)**: Autonomous maintenance triage.
   - Files: `backend/agents/fixr/complaints.py`, `groq_client.py`, `router.py`.
   - Features: Categorization (plumbing, electrical, civil, etc.) and urgency scoring via Groq Llama 3.3.
5. **HERALD (`/herald`)**: Cross-agent safety orchestrator.
   - Files: `backend/agents/herald/orchestrator.py`, `router.py`.
   - Features: Multi-agent anomaly correlation with 3-tier synthesis:
     - `CRITICAL DUAL ABSENCE`: Student missing from both Gate (3d) and Mess (6 meals / 48h) with zero approved leave.
     - `RESIDENT WELFARE ALERT`: Verified inside hostel premises but missed 6 consecutive meals (~48h) (in-room medical/sickness check).
     - `GATE ATTENDANCE DEFICIT`: Eating normally in mess but zero gate scans for 3 days.
     - Guards: Grace period for students enrolled <3 days, minimum 6-meal history guard, and outpass leave immunity.
6. **NOURISH Sub-Agents (Roadmap)**:
   - `NOURISH-Oracle`: ML Turnout demand forecasting engine (XGBoost / Random Forest).
   - `NOURISH-Gusto`: Student dining feedback, sentiment analysis, and dynamic Dish Popularity Index (DPI).

---

## 5. Directory Structure Reference

```
Sem5_AI-Project/
├── brain.md                         # [YOU ARE HERE] Single source of truth / state blueprint
├── README.md                        # Public repository documentation & setup guide
├── .python-version                  # Pinned to 3.11.9 (prevents Render Python 3.14 build errors)
├── backend/
│   ├── main.py                      # FastAPI app entry point, lifespan, CORS, router mounts
│   ├── download_weights.py          # Pre-caches facenet.onnx during Render build
│   ├── requirements.txt             # Lightweight dependencies (onnxruntime, opencv, fastapi)
│   ├── agents/
│   │   ├── iris/                    # Face recognition (face_engine.py, enrollment.py, recognition.py)
│   │   │   └── models/facenet.onnx  # Local cached ONNX weights (89.6 MB)
│   │   ├── sentinel/                # Curfew windows, gate attendance, defaulter scheduler
│   │   ├── nourish/                 # Dining kiosk, menu parser, inventory NLP, wastage
│   │   ├── fixr/                    # Maintenance complaint triage via Groq LLM
│   │   └── herald/                  # Safety orchestrator, anomaly detection heuristics
│   ├── auth/                        # JWT verification, dependencies (require_role, get_kiosk_or_warden)
│   ├── db/                          # Supabase client singleton, schema.sql
│   └── scheduler/                   # APScheduler startup & cron jobs
└── frontend/
    ├── vercel.json                  # SPA rewrite rules
    ├── src/
    │   ├── App.jsx                  # React Router root configuration with role-protected layouts
    │   ├── context/AuthContext.jsx  # Supabase auth state, session lifecycle, token auto-refresh
    │   ├── services/api.js          # Axios instance with Bearer interceptor & custom timeouts
    │   ├── components/warden/       # AttendanceWindowModal.jsx (Warden curfew editor)
    │   └── pages/
    │       ├── student/             # Dashboard, FaceEnrollmentPage, AttendancePage, ComplaintsPage
    │       ├── mess/                # MessDashboard, MessKioskPage, InventoryPage, MenuUploadPage
    │       └── warden/              # WardenDashboard, GateKioskPage, ApprovalsPage, DefaultersPage
```

---

## 6. Strict Development Rules for Future Chats

1. **Do NOT Re-introduce TensorFlow/DeepFace**:
   - Never import `tensorflow`, `keras`, or `deepface` in the backend. Render free tier has a hard **512 MB RAM ceiling**. Keep using `onnxruntime` and OpenCV.
2. **Timezone Policy**:
   - Always use `Asia/Kolkata` (IST, UTC+5:30) for attendance records, curfew deadlines, and meal windows.
3. **Database Schema Consistency**:
   - Face embeddings must always be **512-dimensional L2-normalized float lists** to match Postgres `VECTOR(512)`.
4. **Vercel Frontend Build Check**:
   - Always verify frontend changes with `npm --prefix frontend run build` before pushing.
5. **No Infinite Redirect Loops**:
   - If an auth token is invalid or expired, clear localStorage/cookies and redirect cleanly to `/login`.
