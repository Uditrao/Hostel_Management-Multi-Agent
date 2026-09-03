# 🏛️ Hostel Management Multi-Agent System — Implementation Plan

## 0. Blueprint Review & Gap Analysis

After fully reviewing the blueprint, here are the **gaps, missing details, and improvements** I've added or will address:

| # | Issue Found | Fix Applied |
|---|---|---|
| 1 | No `.env` / secrets management mentioned | Added `.env` pattern + `python-dotenv` to all agents |
| 2 | No error handling strategy for LLM failures | Added fallback/retry logic in each LLM client |
| 3 | No CORS / middleware config for FastAPI | Added CORS middleware in `main.py` setup |
| 4 | `mess_menu` schema missing a comma after `ingredients JSONB` | Fixed SQL schema |
| 5 | No mention of how the camera client authenticates to the backend | Added API key auth for kiosk → backend calls |
| 6 | `pgvector` cosine distance threshold not defined anywhere | Defined tunable constant `FACE_SIMILARITY_THRESHOLD = 0.55` |
| 7 | No mention of how to handle multiple enrollments per student (re-enrollment) | Added upsert logic in Vision Agent enrollment |
| 8 | Orchestrator "on-demand" vs "scheduled" behaviour not reconciled | Clarified: scheduled nightly + on-demand API endpoint for Warden |
| 9 | Frontend stack uses Tailwind but backend is heavy Python — no dev runner | Added `Makefile` / `run.sh` for easy local dev |
| 10 | No README / project setup instructions planned | Added `README.md` as a deliverable |
| 11 | `anomaly_flags` has no unique constraint — same flag can be inserted repeatedly | Added `UNIQUE(student_id, type, DATE(created_at))` |
| 12 | No rate-limiting on face recognition endpoint (abuse vector) | Added simple IP-based rate limit via `slowapi` |

---

## 1. Agent Roster (with Names)

Each agent gets a proper name, a domain, and an identity:

| Codename | Role | Nickname | Responsibility |
|---|---|---|---|
| **IRIS** | Vision Agent | *Iris* — "the eye of the hostel" | Face enrollment, real-time recognition, emitting identity events |
| **SENTINEL** | Attendance Agent | *Sentinel* — always watching the gate | Processes IRIS events, marks present/late, flags defaulters |
| **NOURISH** | Mess Agent | *Nourish* — feeds everyone | Entry gating at mess, inventory tracking, menu parsing, NLP commands |
| **FIXR** | Maintenance Agent | *Fixr* — fixes it fast | Classifies complaints with Groq, routes urgency levels to Warden |
| **HERALD** | Orchestrator Agent | *Herald* — delivers the big picture | Cross-agent anomaly detection, nightly summary, Warden dashboard feed |

---

## 2. Full Build Plan — 10 Phases, One Agent at a Time

> Each Phase has a clear start condition, deliverables, and a test you can run to confirm it's done before moving to the next.

---

### ⚙️ PHASE 0 — Project Scaffold & Infra Setup
**Agent: None (Infrastructure)**
**Goal**: Get Supabase, folder structure, `.env`, and FastAPI skeleton live.

**Tasks**:
- [ ] Create Supabase project → enable `pgvector` → run schema SQL
- [ ] Set up folder structure (`hostel-system/backend/`, `frontend/`)
- [ ] Create `backend/main.py` with FastAPI + CORS
- [ ] Create `backend/db/supabase_client.py` connection helper
- [ ] Create `.env.example` with all required keys
- [ ] `pip install` baseline dependencies + `requirements.txt`
- [ ] Verify: `uvicorn main:app --reload` → `GET /health` returns `{status: ok}`

**Deliverables**:
```
hostel-system/
├── backend/
│   ├── main.py
│   ├── .env
│   ├── requirements.txt
│   └── db/
│       ├── models.py        (Pydantic models for all tables)
│       └── supabase_client.py
└── README.md
```

---

### 👁️ PHASE 1 — IRIS (Vision Agent)
**Agent: IRIS**
**Goal**: Standalone face enrollment + recognition working locally before any API wiring.

**Tasks**:
- [ ] Download MobileFaceNet ONNX model (from insightface model zoo)
- [ ] Build `agents/iris/face_engine.py` — loads ONNX model, generates 128-d embedding
- [ ] Build enrollment flow: webcam → 5 frames → average embedding → store to DB
- [ ] Build recognition flow: single frame → embedding → pgvector cosine search → return match or "unknown"
- [ ] Tune `FACE_SIMILARITY_THRESHOLD` (start 0.55, adjust on test set)
- [ ] Expose via FastAPI:
  - `POST /iris/enroll` — multipart image upload + student_id
  - `POST /iris/recognize` — image → `{student_id or null, confidence, location}`
- [ ] Test: enroll 3 test faces → recognize each → confirm correct match
- [ ] Test unknown face → confirm "unknown" returned

**Deliverables**:
```
backend/agents/iris/
├── face_engine.py       (ONNX inference, embedding generation)
├── enrollment.py        (capture → embed → upsert to students table)
├── recognition.py       (embed → pgvector search → threshold check)
└── router.py            (FastAPI routes: /iris/enroll, /iris/recognize)
```

---

### 🛡️ PHASE 2 — SENTINEL (Attendance Agent)
**Agent: SENTINEL**
**Goal**: Wire IRIS recognition events → attendance_logs; enforce time windows; produce defaulters list.

**Tasks**:
- [ ] Build `agents/sentinel/attendance.py`:
  - On gate recognition event → check if already marked today
  - Check active `attendance_window` times → mark `present` or `late`
  - If already marked → idempotent (skip duplicate)
- [ ] Build `attendance_window` CRUD endpoints (Warden sets gate open/close time)
- [ ] Build APScheduler job: runs at `end_time` → any student with no log today → insert defaulter record
- [ ] Expose via FastAPI:
  - `POST /sentinel/gate-event` — called by IRIS after gate recognition
  - `GET /sentinel/attendance` — student's own attendance log
  - `GET /sentinel/defaulters` — warden-only, today's defaulters
  - `GET /sentinel/window` — get current attendance window
  - `PUT /sentinel/window` — warden updates window
- [ ] Test: simulate a gate event → confirm attendance_log entry; simulate missing student → confirm defaulter after window close

**Deliverables**:
```
backend/agents/sentinel/
├── attendance.py        (mark present/late logic)
├── scheduler_jobs.py    (APScheduler defaulter check)
└── router.py            (FastAPI routes)
```

---

### 🍽️ PHASE 3A — NOURISH Entry Logic (Mess Entry Gating)
**Agent: NOURISH — Part 1**
**Goal**: Gate mess entry using IRIS recognition; log known/unknown entries.

**Tasks**:
- [ ] Build `agents/nourish/entry.py`:
  - On mess recognition event → determine meal type (breakfast/lunch/dinner) from current time
  - Recognized → log entry, allow
  - Unrecognized → save flagged image URL, log unrecognized attempt
  - Duplicate entry same meal → deny with reason
- [ ] Expose via FastAPI:
  - `POST /nourish/mess-event` — called by IRIS after mess recognition
  - `GET /nourish/entries` — today's entries per meal (warden/staff view)
- [ ] Test: recognized student → entry logged; unknown face → flagged image saved

**Deliverables**:
```
backend/agents/nourish/
├── entry.py             (entry gating, duplicate detection)
└── router.py            (FastAPI routes — to be extended in Phase 3B/3C)
```

---

### 📦 PHASE 3B — NOURISH Inventory + Menu (Mess Management)
**Agent: NOURISH — Part 2**
**Goal**: Menu PDF parsing via Gemini; inventory tracking; depletion + alert logic.

**Tasks**:
- [ ] Build `llm/gemini_client.py` — Gemini Flash API wrapper
- [ ] Build `llm/menu_parser.py` — sends PDF to Gemini → gets structured `{meal, dishes, ingredients}` JSON
- [ ] Build inventory depletion logic: after each meal window → `entries × qty_per_student` → subtract from inventory
- [ ] Build alert logic: compare remaining inventory vs upcoming meals → create `inventory_alerts` rows with urgency
- [ ] Expose via FastAPI:
  - `POST /nourish/menu/upload` — PDF upload → parsed result preview → staff confirm → save to `mess_menu`
  - `GET /nourish/menu` — today's menu
  - `GET /nourish/inventory` — current inventory table
  - `POST /nourish/inventory` — manual add/edit item (admin)
  - `GET /nourish/alerts` — active inventory alerts
- [ ] Test: upload a sample mess menu PDF → confirm structured output; simulate 50 students eating → confirm inventory decremented; set low stock → confirm alert created

**Deliverables**:
```
backend/llm/
├── gemini_client.py
└── menu_parser.py
backend/agents/nourish/
├── inventory.py         (depletion math, alert generation)
└── menu.py              (PDF upload handler)
```

---

### 💬 PHASE 3C — NOURISH NLP Command Bar
**Agent: NOURISH — Part 3**
**Goal**: Mess staff can type commands like "add 20kg rice" → parsed by Groq → applied to inventory.

**Tasks**:
- [ ] Build `llm/groq_client.py` — Groq API wrapper with strict JSON schema mode
- [ ] Build `llm/inventory_nlp.py` — prompt + schema: `{item, action: 'add'|'use'|'set', qty, unit}`
- [ ] Apply parsed action to inventory table, log to `inventory_nlp_logs`
- [ ] Expose via FastAPI:
  - `POST /nourish/inventory/command` — `{raw_text}` → parse → apply → return result + log
- [ ] Test: "add 20kg rice", "used 10L milk today", "set sugar stock to 15kg" → verify correct DB mutations

**Deliverables**:
```
backend/llm/
├── groq_client.py
└── inventory_nlp.py
```

---

### 🔧 PHASE 4 — FIXR (Maintenance Agent)
**Agent: FIXR**
**Goal**: Student submits complaint → Groq classifies it → structured ticket appears on Warden portal.

**Tasks**:
- [ ] Build `llm/complaint_classifier.py` — Groq strict JSON schema: `{category, urgency, short_summary}`
- [ ] Build `agents/fixr/complaints.py` — submit complaint → call Groq → store in `complaints` table
- [ ] Expose via FastAPI:
  - `POST /fixr/complaint` — student submits text
  - `GET /fixr/complaints/mine` — student views own complaints + status
  - `GET /fixr/complaints` — warden views all complaints (filterable by category/urgency/status)
  - `PATCH /fixr/complaints/{id}` — warden assigns worker note, updates status
- [ ] Test: submit "my bathroom pipe is leaking badly" → confirm `{plumbing, high, short_summary}` returned; verify it appears on warden view

**Deliverables**:
```
backend/llm/
└── complaint_classifier.py
backend/agents/fixr/
├── complaints.py
└── router.py
```

---

### 🔍 PHASE 5 — HERALD (Orchestrator Agent)
**Agent: HERALD**
**Goal**: Nightly cross-agent anomaly detection + Warden dashboard summary.

**Tasks**:
- [ ] Build `agents/herald/orchestrator.py`:
  - Query `attendance_logs` → students with 0 entries in last 3 days → flag `attendance_missed`
  - Query `mess_entries` → students with 0 entries in last 6 meals → flag `mess_missed_streak`
  - Query `complaints` → `high/critical` open > 24h → flag `unresolved_complaint`
  - Deduplicate: `UNIQUE(student_id, type, DATE)` prevents re-flagging same day
- [ ] Optional: Groq summarizer → turn all flags into 1 paragraph for Warden dashboard
- [ ] APScheduler: nightly cron (midnight) + on-demand endpoint
- [ ] Expose via FastAPI:
  - `GET /herald/anomalies` — warden views unread flags
  - `POST /herald/run` — warden triggers on-demand orchestrator run
  - `PATCH /herald/anomalies/{id}/seen` — mark flag as seen
- [ ] Test: seed DB with missing attendance/mess data → trigger orchestrator → confirm correct flags created

**Deliverables**:
```
backend/agents/herald/
├── orchestrator.py
├── summarizer.py        (optional Groq summary)
└── router.py
backend/scheduler/
└── jobs.py              (all APScheduler jobs consolidated here)
```

---

### 🔐 PHASE 6 — Auth + Role-Gated API
**Goal**: Supabase Auth integration; JWT verification middleware; role-based route guards.

**Tasks**:
- [ ] Build `auth/middleware.py` — verify Supabase JWT on every protected route, extract role
- [ ] Build role decorators: `@require_role('student')`, `@require_role('warden')`, etc.
- [ ] Apply role guards to all existing routers
- [ ] Build student sign-up flow:
  - `POST /auth/signup` — creates Supabase auth user + `users` row (pending warden approval)
  - `PATCH /auth/approve/{user_id}` — warden approves → creates `students` row with roll_no + room
- [ ] Test: student JWT cannot access warden routes; warden JWT can; mess_staff JWT limited to NOURISH routes

**Deliverables**:
```
backend/auth/
├── middleware.py
└── router.py
```

---

### 🖥️ PHASE 7 — Frontend (React + Vite + Tailwind)
**Goal**: Three role-based portals, wired to all backend endpoints.

**Sub-phases**:

#### 7A — Foundation
- [ ] `npm create vite@latest frontend -- --template react`
- [ ] Install Tailwind CSS + shadcn/ui (for clean component library)
- [ ] Set up React Router with route groups: `/student/*`, `/mess/*`, `/warden/*`
- [ ] Supabase JS client — auth context provider
- [ ] Route guards (redirect if wrong role)

#### 7B — Student Portal
- [ ] Login/Signup page
- [ ] Face enrollment page (webcam capture → POST /iris/enroll)
- [ ] Attendance history page
- [ ] Complaint submission form + status tracker

#### 7C — Mess Staff Portal
- [ ] Login page
- [ ] Live inventory table + alert badges
- [ ] PDF menu upload → preview structured result → confirm
- [ ] NLP command bar (text input → show parsed result → apply)
- [ ] Today's entry counts per meal

#### 7D — Warden/Admin Portal
- [ ] Dashboard: attendance %, entry counts, open complaints, active alerts (summary cards)
- [ ] Defaulters list
- [ ] Complaints table (filterable, sortable, assignable)
- [ ] HERALD anomaly feed (unread flags, mark-as-seen)
- [ ] Student approval & enrollment management

---

### 📷 PHASE 8 — Camera Kiosk Client
**Goal**: Local Python script using OpenCV to capture from webcam → call IRIS API → display result.

**Tasks**:
- [ ] Build `camera_client/capture.py`:
  - Loop: capture frame → detect face → send to `/iris/recognize`
  - If gate mode → result triggers `/sentinel/gate-event`
  - If mess mode → result triggers `/nourish/mess-event`
  - Display result on-screen (green = match, red = unknown)
- [ ] Add API key auth header for kiosk → backend calls
- [ ] Test: run locally against hosted backend; confirm end-to-end face → DB entry

**Deliverables**:
```
camera_client/
├── capture.py
├── config.py            (BACKEND_URL, API_KEY, mode: 'gate'|'mess')
└── requirements.txt
```

---

### 🚀 PHASE 9 — Deployment & Polish
- [ ] Deploy FastAPI backend to Render (free tier), connect Supabase
- [ ] Deploy React frontend to Vercel, set env vars
- [ ] End-to-end test with real enrolled faces
- [ ] Write `README.md` with setup instructions
- [ ] Final demo recording

---

## 3. Execution Starting Point — Today

> Per your instruction: **start with IRIS (face recognition) + SENTINEL (attendance)** — Phases 0, 1, and 2.

### What we'll build in the first session:
1. **Phase 0**: Project scaffold, Supabase schema, FastAPI skeleton, `.env`
2. **Phase 1 — IRIS**: MobileFaceNet engine, enrollment, recognition, API routes
3. **Phase 2 — SENTINEL**: Attendance marking, time window logic, defaulter scheduler, API routes

---

## 4. Tech Dependencies Per Phase

```
Phase 0:  fastapi uvicorn python-dotenv supabase pgvector psycopg2-binary
Phase 1:  onnxruntime opencv-python numpy Pillow insightface slowapi
Phase 2:  apscheduler
Phase 3B: google-generativeai
Phase 3C: groq
Phase 4:  groq (shared)
Phase 5:  groq (shared)
Phase 6:  python-jose[cryptography]
Phase 7:  npm — react vite tailwindcss @supabase/supabase-js
Phase 8:  opencv-python requests (camera client local)
```

---

## 5. Open Questions for You Before We Start

> [!IMPORTANT]
> **Q1 — Demo mode?** Will the demo use a real webcam for face recognition, or should I also build a "mock/simulation" mode where you can upload a photo file instead of using a live camera (useful if demoing without a camera)?

> [!IMPORTANT]
> **Q2 — Number of students?** Roughly how many students will be enrolled during demo (5? 20? 50?)? This affects how aggressively I tune the face similarity threshold.

> [!IMPORTANT]
> **Q3 — Supabase setup?** Do you have a Supabase project already created? If yes, share the `SUPABASE_URL` and `SUPABASE_ANON_KEY` (or I'll note where to put them in `.env`). If no, we'll create one together first.

> [!NOTE]
> **Q4 — Gemini + Groq API keys** — Do you already have these? If not, I'll add instructions for getting free-tier keys to the README.

> [!NOTE]
> **Q5 — Windows dev environment** — You're on Windows. I'll use `uvicorn` and Python venv commands compatible with PowerShell throughout.
