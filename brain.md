# BRAIN.MD — SYSTEM STATE & REPOSITORY BLUEPRINT
> **Single Source of Truth** for the Hostel Management Multi-Agent System.  
> Read this file first to maintain state awareness, avoid unnecessary file scans, and preserve context tokens.

---

## 1. System Architecture & Tech Stack

| Layer | Technology | Key Responsibility / Configuration |
|---|---|---|
| **API Runtime** | Python 3.11+ / FastAPI | Async ASGI server, lifespan model warm-up, CORS, modular agent routing |
| **Database** | Supabase (PostgreSQL 15 + `pgvector`) | Relational store + 512-d vector index (`ivfflat`, `vector_cosine_ops`), RPC `match_face()` |
| **Authentication** | Supabase Auth + JWT | HS256 local verification via `SUPABASE_JWT_SECRET` with remote fallback; Role-based guards |
| **Vision Biometrics** | DeepFace (`Facenet512` + OpenCV) | 512-float face embedding extraction; cosine distance threshold $\le 0.45$ (similarity $\ge 0.55$) |
| **Multimodal LLM** | Google Gemini API (REST) | Menu PDF understanding with 5-tier fallback: `gemini-3.5-flash-lite`, `3.5-flash`, `flash-latest`, `2.0-flash`, `1.5-flash` |
| **Fast Structured NLP** | Groq API (`llama-3.3-70b-versatile` / `llama-3.1-8b`) | Sub-second JSON schema parsing for FIXR complaint classification and NOURISH inventory commands |
| **Task Scheduler** | APScheduler | Background jobs: 22:00 IST curfew check, defaulters tabulation, HERALD daily digests |
| **Frontend** | React 18 (Vite) + Tailwind CSS + Lucide | Role-based SPA (Student, Warden, Mess Staff); Axios with Supabase Bearer token interceptor |
| **Kiosk Client** | Python OpenCV (`camera_client/`) | Physical gate and mess camera integration with kiosk secret header |

---

## 2. Agent Ecosystem & Responsibilities

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

1. **IRIS (`/iris`)**: Biometric identity engine. Enrolls faces (webcam/upload), extracts 512-d embeddings, queries `match_face` RPC.
2. **SENTINEL (`/sentinel`)**: Movement and curfew guardian. Logs gate events (`present`/`late`), runs 22:00 IST defaulter scheduler.
3. **NOURISH (`/nourish`)**: Nutrition & dining engine. Enforces single-meal access, runs Mess Entry Kiosk (`/mess/kiosk`), parses weekly menu PDFs, executes NLP stock commands.
4. **FIXR (`/fixr`)**: Maintenance dispatcher. Classifies complaint category and urgency via LLM; assigns technician tickets.
5. **HERALD (`/herald`)**: Safety orchestrator. Cross-checks gate vs. meal logs to flag anomalies (e.g. resident present but 3 missed meals).

---

## 3. Directory Mapping & Codebase Index

```
Sem5_AI-Project/
├── .antigravityignore               # Token-saver ignore list (venv, node_modules, build artifacts)
├── brain.md                         # [YOU ARE HERE] Single source of truth / state blueprint
├── PROJECT_SUMMARY.md               # 2-3 page high-level narrative summary of the project
├── EXTENDED_PROJECT_PLAN.md         # Master technical blueprint for Phases 9–12 (Outpasses, ML turnout)
├── README.md                        # Public repository documentation & setup guide
├── camera_client/                   # Local OpenCV capture kiosk
│   ├── capture.py                   # Camera feed, face detection box, spacebar/auto capture
│   └── config.py                    # Kiosk API endpoint & secret configuration
├── backend/
│   ├── main.py                      # FastAPI app entry point, lifespan, CORS, router mounts
│   ├── .env                         # Secrets (SUPABASE, GEMINI_API_KEY, GROQ_API_KEY, JWT secret)
│   ├── agents/
│   │   ├── iris/                    # Face recognition (face_engine.py, enrollment.py, recognition.py, router.py)
│   │   ├── sentinel/                # Attendance & gate rules (attendance.py, curfew.py, router.py)
│   │   ├── nourish/                 # Mess engine (entry.py, inventory.py, menu.py, nlp_command.py, router.py)
│   │   ├── fixr/                    # Maintenance triage (triage.py, router.py)
│   │   └── herald/                  # Anomaly orchestrator (anomalies.py, digest.py, router.py)
│   ├── auth/                        # JWT verification, dependencies (require_role, get_kiosk_or_warden)
│   ├── db/                          # Supabase client singleton, schema.sql, schema_alter_v2.sql, models.py
│   ├── llm/                         # Gemini REST client, Groq client, inventory_nlp.py (synonyms mapping)
│   └── scheduler/                   # APScheduler jobs (curfew evaluations, defaulters, daily digest)
└── frontend/
    ├── src/
    │   ├── App.jsx                  # React Router root configuration with role-protected layouts
    │   ├── context/AuthContext.jsx  # Supabase auth state, session lifecycle, token auto-refresh
    │   ├── services/api.js          # Axios instance with Bearer interceptor & custom timeouts
    │   ├── components/              # Common components (Navbar, Sidebar, LoadingSpinner, ProtectedRoute)
    │   └── pages/
    │       ├── LoginPage.jsx        # Credentials login with role-redirect & session recovery
    │       ├── student/             # Dashboard, FaceEnrollmentPage, AttendancePage, ComplaintsPage
    │       ├── mess/                # MessDashboard, MessKioskPage, InventoryPage, MenuUploadPage, NlpCommandPage
    │       └── warden/              # WardenDashboard, GateKioskPage, ApprovalsPage, DefaultersPage, AnomaliesPage
```

---

## 4. Key Workflows & Data Flows

### A. Face Enrollment & Verification
1. User registers $\rightarrow$ Profile requires Warden approval (`/warden/approvals`).
2. Approved student opens `/student/enroll` $\rightarrow$ Captures webcam frame $\rightarrow$ Calls `POST /iris/enroll`.
3. Backend extracts 512-d vector using `Facenet512` $\rightarrow$ Stores into `students.face_embedding`.
4. Kiosk captures frame $\rightarrow$ Calls `POST /iris/recognize` $\rightarrow$ Calls Supabase `match_face()` RPC.

### B. Dining Hall Kiosk & Live Head Count Engine (NOURISH)
1. Mess Staff opens `/mess/kiosk` at meal times $\rightarrow$ Active session detected or overridden (`breakfast`, `lunch`, `dinner`).
2. Webcam scans student face $\rightarrow$ Calls `/iris/recognize` $\rightarrow$ Forwards to `POST /nourish/mess-event`.
3. Decision:
   - **Allowed**: Ground-truth head count increments (`count++`), logs to `mess_entries`, success chime plays.
   - **Already Entered**: Rejected with warning chime (`"Already ate Lunch today at 12:45 PM"`).
   - **Unrecognized**: Rejection buzzer (`"Access Denied"`), logs attempt with `flagged_image_url`.
4. Manual Search Fallback allows instant search by Roll No / Name to grant meal access if lighting/camera is obscured.

### C. Menu PDF Upload & Ingestion
1. Mess Staff uploads weekly menu PDF at `/mess/menu` $\rightarrow$ Calls `POST /nourish/menu/upload`.
2. Backend runs fallback chain (`gemini-3.5-flash-lite` $\rightarrow$ `3.5-flash` $\rightarrow$ `flash-latest` $\rightarrow$ `2.0-flash` $\rightarrow$ `1.5-flash`).
3. Extracted JSON contains dish list and per-student ingredient ratios $\rightarrow$ Stored in `mess_menu`.
4. Frontend displays structured preview for confirmation and saving.

### D. Inventory Stock Operations & NLP
1. Stock update via UI or NLP bar $\rightarrow$ Normalized via `ITEM_SYNONYMS` (`chawal` $\rightarrow$ `rice`, `atta` $\rightarrow$ `flour`).
2. Updates `inventory.quantity_available`.
3. Pydantic schemas enforce non-negative quantities (`ge=0`).

---

## 5. Active Context & Next Steps (Pending Features)

### 📌 Development Status:
1. **Dynamic Meal Head Counts**: ✅ **COMPLETED**
   - Implemented via the dedicated **Mess Dining Kiosk** (`/mess/kiosk`).
   - Features real-time face scan check-in, duplicate prevention, audio feedback, live counters, and manual lookup.
2. **Menu $\leftrightarrow$ Inventory Proactive Stock Check & Prioritized Alerts**: ✅ **COMPLETED**
   - Implemented `check_and_generate_forecast_alerts()` evaluating both:
     - 🔴 **Today's Immediate Shortages** (same-day cooking emergency for upcoming lunch/dinner).
     - 🟠 **Tomorrow's Advance Market Procurement List** (24-hour advance warning to buy before tomorrow's prep starts).
   - Live **"Kitchen Procurement & Stock Radar"** widget with dual-tab interface active on the Mess Dashboard (`MessDashboard.jsx`).
3. **Hybrid Kitchen Stock Issue (Pre-filled Depletion)**: ✅ **COMPLETED**
   - Bridges the gap between storeroom issue and consumption with a hybrid pre-filled flow.
   - Automatically pre-fills recipe quantities from `mess_menu` $\times$ expected headcount.
   - Mess manager can review and adjust actual quantities before issuing to the kitchen (`POST /nourish/depletion/custom`).
   - Gram-to-Kg unit conversion, live stock availability display, and automated threshold alerts.
4. **Post-Meal Food Wastage Counter & Analytics**: ✅ **COMPLETED**
   - Interactive counter on the Mess Dashboard to log post-meal leftover food in kg (`POST /nourish/wastage`).
   - Computes real-time per-diner waste metric (`g / student`) with live severity ratings (Optimal $\le 3$kg, Moderate $3-8$kg, High $> 8$kg).
   - SQL schema migration created at `backend/db/schema_alter_v3_wastage.sql` with graceful fallback cache.
   - Prepares ground-truth waste data for future ML turnout prediction models and cooking advisory algorithms.

### 🔮 Extended Architecture & Advanced ML Pipeline:
- **Phase 9: Warden Academic & Event Schedule Manager**: Warden Portal UI to record Exams, Vacations, and Festivals with date ranges into `academic_calendar`.
- **Phase 10: Student Digital Outpass & Leave Workflow (SENTINEL)**: Student application with parent contact info $\rightarrow$ Warden verification & one-click approval $\rightarrow$ Off-campus strength auto-feeds NOURISH dining forecasts.
- **Phase 11: Synthetic Dataset & Predictive ML Turnout Engine (NOURISH-Oracle)**:
  - 90-day multi-factor time-series dataset (exams, outpasses, dish popularity, wastage dampener).
  - LightGBM / Random Forest turnout regression model with asymmetric loss (penalty for food shortage).
  - Dynamic cooking advisory (`predicted_turnout + adaptive_safety_buffer`) integrated into the Kitchen Issue Panel.
- **Phase 12: External Notifications & Hardware Client**: WhatsApp / SMS procurement digest and OpenCV turnstile relay integration.

---

## 6. Strict Development Rules & Constraints

1. **State Preservation First**: Read `brain.md` before making architectural assumptions or exploratory scans.
2. **Timezone Rule**: All dates, curfew deadlines, and meal windows must use `Asia/Kolkata` (IST, UTC+5:30).
3. **Database Schema Consistency**:
   - The PostgreSQL column in table `inventory` is `quantity_available` (aliased to `quantity` in API responses).
   - In Pydantic models, allow zero quantities (`ge=0`).
4. **LLM Fallback & Timeouts**:
   - Multimodal PDF processing with Gemini must maintain the 5-model candidate fallback list and 120s HTTPX/Axios timeout.
   - Groq API is prioritized for fast JSON NLP tasks (complaint triage, NLP commands).
5. **Session Safety**:
   - Do not trigger infinite 401 redirect loops; if a token is stale or user was deleted from DB, auto-clear session and redirect cleanly to `/login`.
