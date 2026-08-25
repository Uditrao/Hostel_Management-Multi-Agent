# Hostel Management Multi-Agent System — Project Blueprint

## 1. Project Summary

A hostel management system built as a **multi-agent architecture**, where each agent owns a specific domain, reasons over its own data, and reports into a shared database. A supervisor (Orchestrator/Warden) layer reads across agents to surface anomalies. The system exposes three role-based portals: **Student**, **Mess Staff**, and **Warden/Admin**.

### Agents in the system

| Codename | Agent | Type | Responsibility |
|---|---|---|---|
| **IRIS** 👁️ | Vision Agent | DeepFace / Facenet512 | Face enrollment + recognition for gate attendance & mess entry |
| **SENTINEL** 🛡️ | Attendance Agent | Rule-based | Marks attendance from IRIS events, enforces time window |
| **NOURISH** 🍽️ | Mess Agent | Rule-based + LLM (Gemini for menu PDF, Groq for NLP) | Validates mess entry, tracks consumption, forecasts inventory, parses menu PDFs, handles staff NLP commands |
| **FIXR** 🔧 | Maintenance Agent | LLM-based (Groq, structured output) | Classifies complaints (category + urgency), pushes structured ticket to Warden portal |
| **HERALD** 🔍 | Orchestrator Agent | Rule-based (+ optional LLM summarizer) | Cross-checks attendance/complaints/mess data, flags anomalies, notifies Warden |

---

## 2. Tech Stack (Final Recommendation)

| Layer | Choice | Why |
|---|---|---|
| Face Recognition | **Facenet512** via `deepface` library, `onnxruntime` for ONNX ops | **Why the switch from MobileFaceNet/insightface:** `insightface` requires Microsoft Visual C++ Build Tools to compile Cython extensions on Windows — not viable without a full VS install. `deepface` with Facenet512 installs with plain `pip` on any platform, produces 512-d L2-normalised embeddings, and achieves comparable accuracy. Model weights (~90MB) download automatically on first use to `~/.deepface/weights/`. At 10-20 enrolled students the gallery is small enough that any quality model gives near-perfect separation. |
| Backend | **FastAPI (Python)** | Async support (needed for camera streams + LLM calls), easy to structure as separate agent modules/routers |
| Database | **PostgreSQL with `pgvector` extension**, hosted on **Supabase** | Native vector similarity search for face embeddings (`ORDER BY embedding <-> query_vector`), plus normal relational tables in one place |
| File/Image Storage | **Supabase Storage** (or local `/uploads` during dev) | Stores enrollment photos, flagged "unknown person" captures. Only URLs go in DB. |
| Auth | **Supabase Auth** (role field: `student`, `mess_staff`, `warden`) | One auth system, three portals gated by role |
| Frontend | **React (Vite) + Tailwind** | 3 portals as route groups within one app, or 3 separate apps if you prefer clean separation |
| LLM — Menu Parsing | **Google Gemini API (Flash tier, free)** | Only task that needs native multimodal/PDF file understanding — send the PDF directly, no text-extraction step needed |
| LLM — Complaint Classification & Inventory NLP | **Groq API (free tier)**, using Groq's **strict structured outputs** (`strict: true` JSON schema mode) | Both are short text-in → structured-JSON-out tasks with no document/image input, which is exactly what Groq's constrained-decoding JSON mode is built for — guarantees schema-valid output every time (no malformed parses corrupting inventory data) plus very fast response times. Load is split across two providers instead of relying on one. |
| PDF Parsing (menu) | Send PDF directly to Gemini (native file understanding) → structured JSON | Menu PDF → `{meal: [{dish, ingredients:[{name, qty_per_100_students}]}]}` — no `pdfplumber` step required since Gemini handles the PDF directly |
| Scheduler | `APScheduler` (in FastAPI) or a cron job | Attendance window cutoff check, daily inventory depletion check |
| Camera capture | Local Python script (OpenCV) at gate/mess kiosk → hits backend API | Real-time recognition runs on the local device (realistic — this is how real gate cameras work), backend stays cloud-hosted |

---

## 3. Database Schema (Postgres)

```sql
-- USERS & AUTH
users (
  id UUID PK,
  email TEXT UNIQUE,
  role TEXT CHECK (role IN ('student','mess_staff','warden')),
  created_at TIMESTAMP
)

students (
  id UUID PK REFERENCES users(id),
  roll_no TEXT UNIQUE,
  name TEXT,
  room_no TEXT,
  photo_url TEXT,
  face_embedding VECTOR(512),   -- pgvector; 512-d to match Facenet512 output (updated via schema_alter_v2.sql)
  enrolled_at TIMESTAMP
)

-- ATTENDANCE
attendance_logs (
  id UUID PK,
  student_id UUID REFERENCES students(id),
  timestamp TIMESTAMP,
  status TEXT CHECK (status IN ('present','late')),
  method TEXT DEFAULT 'face'
)

attendance_window (
  id UUID PK,
  start_time TIME,
  end_time TIME,
  active_days TEXT[]   -- e.g. ['Mon','Tue',...]
)

-- MESS
mess_entries (
  id UUID PK,
  student_id UUID REFERENCES students(id),   -- NULL if unknown
  is_recognized BOOLEAN,
  meal_type TEXT CHECK (meal_type IN ('breakfast','lunch','dinner')),
  timestamp TIMESTAMP,
  flagged_image_url TEXT   -- populated only if unrecognized
)

mess_menu (
  id UUID PK,
  meal_type TEXT,
  dish_name TEXT,
  ingredients JSONB   -- [{name:'rice', qty_per_student_grams: 150}, ...]
  effective_date DATE
)

inventory (
  id UUID PK,
  item_name TEXT UNIQUE,
  quantity_available NUMERIC,
  unit TEXT,
  last_updated TIMESTAMP,
  updated_by UUID REFERENCES users(id)
)

inventory_alerts (
  id UUID PK,
  item_name TEXT,
  message TEXT,
  urgency TEXT CHECK (urgency IN ('low','medium','high','critical')),
  created_at TIMESTAMP,
  resolved BOOLEAN DEFAULT FALSE
)

inventory_nlp_logs (
  id UUID PK,
  raw_command TEXT,
  parsed_action JSONB,   -- {"item":"rice","action":"add","qty":20,"unit":"kg"}
  staff_id UUID REFERENCES users(id),
  timestamp TIMESTAMP
)

-- MAINTENANCE
complaints (
  id UUID PK,
  student_id UUID REFERENCES students(id),
  raw_text TEXT,
  category TEXT CHECK (category IN ('electrical','plumbing','carpentry','other')),
  urgency TEXT CHECK (urgency IN ('low','medium','high','critical')),
  status TEXT CHECK (status IN ('open','assigned','resolved')) DEFAULT 'open',
  created_at TIMESTAMP,
  assigned_worker_note TEXT   -- filled manually by warden, free text
)

-- ORCHESTRATOR / ANOMALIES
anomaly_flags (
  id UUID PK,
  student_id UUID REFERENCES students(id),
  type TEXT CHECK (type IN ('attendance_missed','mess_missed_streak','unresolved_complaint')),
  detail TEXT,
  created_at TIMESTAMP,
  seen_by_warden BOOLEAN DEFAULT FALSE
)
```

---

## 4. Portals & Auth Flow

All three portals sit behind Supabase Auth (email/password is enough for a college project). Role stored in `users.role` gates route access on both frontend (route guards) and backend (JWT role check on each endpoint).

### Student Portal
- Sign up (admin/warden approves & links to `students` table with roll no + room)
- One-time **face enrollment** (webcam capture → embedding generated → stored)
- View own attendance history
- Submit maintenance complaint (free text box)
- View own complaint status

### Mess Staff Portal
- View live inventory table
- Receive inventory alerts (low stock notifications, ranked by urgency)
- **Upload mess menu PDF** → system extracts & shows structured dish/ingredient breakdown for confirmation
- **NLP command bar**: type things like *"add 20kg rice"*, *"used 10L milk today"*, *"set sugar stock to 15kg"* → parsed and applied to `inventory` table, logged in `inventory_nlp_logs`
- View today's mess entry count per meal

### Warden/Admin Portal
- Dashboard: today's attendance %, mess entry counts, open complaints, active inventory alerts
- **Attendance defaulters list** (auto-populated after window closes)
- **Complaints table** — full list with category + urgency + student + room, filterable/sortable; warden manually writes who it's assigned to (free text field, no worker-side system as per your scope)
- **Anomaly feed** — orchestrator-generated flags (e.g. "Student X: no gate entry in 3 days", "Student X: missed 4 consecutive meals")
- Approve new student registrations, manage enrollment

---

## 5. Agent Logic — How Each One Actually Works

### 5.1 IRIS — Vision Agent
**Library**: `deepface` (Facenet512 model) + `opencv-python` (frame capture & detection backend)

1. **Enrollment**: capture 3–5 webcam frames OR accept a single uploaded image → Facenet512 generates 512-d embeddings per frame → average all frames + re-normalise → upsert one `VECTOR(512)` into `students.face_embedding`.
2. **Recognition**: incoming frame → Facenet512 embedding → `match_face` Postgres RPC (pgvector cosine distance `<=>`) → best match below distance threshold = identified student; above threshold = "unknown".
   - Threshold: `FACE_SIMILARITY_THRESHOLD=0.55` (cosine similarity) set in `.env`; tune up/down based on false accept/reject rate observed on your enrolled set.
   - First call per server restart takes ~15s while TensorFlow and model weights load; subsequent calls are fast.
3. Emits a structured identity event: `{recognized, student_id, student_name, roll_no, confidence, location: 'gate'|'mess'}` forwarded to SENTINEL or NOURISH.

### 5.2 Attendance Agent
- Listens for `location: 'gate'` events during the active `attendance_window`.
- First valid recognition per student per day = mark present (or late, if after `start_time` but before `end_time`).
- Scheduled job runs at `end_time`: any enrolled student with no log today → inserted into a "defaulters" view the Warden portal reads.

### 5.3 Mess Agent
- On `location: 'mess'` event:
  - Recognized → log entry, allow.
  - Unrecognized → deny, save flagged frame, log as unrecognized attempt.
- After each meal window closes: `entries_count × ingredient_qty_per_student (from mess_menu)` = consumption → subtract from `inventory`.
- Compares remaining inventory against **upcoming** meals in `mess_menu` (this is the "urgency" logic): if an item's remaining stock won't cover the next scheduled meal needing it, create an `inventory_alerts` row with urgency based on how soon the shortfall hits (next meal = critical, next day = high, etc.)
- Menu PDF upload: PDF sent directly to **Gemini** (native file understanding) → structured into `mess_menu.ingredients` JSON → staff confirms in UI before it's saved.
- NLP command bar: staff's raw text → **Groq** (strict structured output / function-calling) → returns structured `{item, action, qty, unit}` → backend applies to `inventory` table, everything logged in `inventory_nlp_logs` for audit trail. Groq's schema-locked JSON mode is a good fit here specifically because it guarantees a valid parse every time, rather than risking a malformed update to inventory data.

### 5.4 Maintenance Agent
- Student submits free text complaint.
- Sent to **Groq** with a strict JSON-schema structured-output prompt: return `{category, urgency, short_summary}`.
- Stored in `complaints`, immediately visible on Warden portal — no worker routing, as you specified.

### 5.5 Orchestrator Agent
- Scheduled job (e.g. runs nightly, or on-demand when Warden opens dashboard):
  - Query attendance_logs: any student with 0 gate entries in last N days → `anomaly_flags` (attendance_missed)
  - Query mess_entries: any student with 0 entries across last N meals → `anomaly_flags` (mess_missed_streak)
  - Query complaints: any `urgency = critical/high` still `open` after X hours → `anomaly_flags` (unresolved_complaint)
- Optional nice touch: use Groq (fast, cheap for this kind of short generation) to turn the raw flags into one readable daily summary paragraph for the Warden dashboard ("3 students have not been seen at gate or mess in 3+ days: ... 2 high-urgency complaints remain unresolved: ...").

---

## 6. Honesty Note for Your Report/Viva

Be upfront about what's genuinely ML/AI vs rule-based, since a good teacher will ask:
- **Real ML/AI**: face recognition (Facenet512 via DeepFace — a deep neural network trained on large face datasets, producing 512-d embeddings; genuinely a trained model, not a heuristic), complaint classification (LLM reasoning), menu PDF structuring (LLM), NLP inventory commands (LLM function-calling)
- **Rule-based (not ML)**: inventory depletion math, attendance window logic, orchestrator anomaly checks — deterministic business rules acting on agent outputs. Normal and fine — just don't call the depletion calculator "predictive AI."
- **Why Facenet512 over MobileFaceNet**: Both are deep CNN face recognition models trained with ArcFace-style loss. Facenet512 was chosen purely for **Windows compatibility** (no C++ compiler required). Academically both qualify as "deep learning face recognition" — the model architecture difference is an implementation detail, not a fundamental one.

---

## 7. Suggested Folder Structure

```
Sem5_AI-Project/                    ← git root (branch: udit)
├── backend/
│   ├── main.py                      ← FastAPI entry point, all agent routers wired here
│   ├── requirements.txt
│   ├── .env                         ← secrets (gitignored)
│   ├── .env.example
│   ├── agents/
│   │   ├── iris/                    ← IRIS 👁️ Vision Agent
│   │   │   ├── face_engine.py       #   deepface/Facenet512 embedding core
│   │   │   ├── enrollment.py        #   webcam + image upload enrollment
│   │   │   ├── recognition.py       #   pgvector cosine search
│   │   │   └── router.py            #   /iris/* FastAPI routes
│   │   ├── sentinel/                ← SENTINEL 🛡️ Attendance Agent
│   │   │   ├── attendance.py
│   │   │   ├── scheduler_jobs.py
│   │   │   └── router.py
│   │   ├── nourish/                 ← NOURISH 🍽️ Mess Agent
│   │   │   ├── entry.py
│   │   │   ├── inventory.py
│   │   │   ├── menu.py
│   │   │   └── router.py
│   │   ├── fixr/                    ← FIXR 🔧 Maintenance Agent
│   │   │   ├── complaints.py
│   │   │   └── router.py
│   │   └── herald/                  ← HERALD 🔍 Orchestrator Agent
│   │       ├── orchestrator.py
│   │       ├── summarizer.py
│   │       └── router.py
│   ├── db/
│   │   ├── models.py                ← Pydantic models for all tables
│   │   ├── supabase_client.py       ← singleton Supabase client
│   │   ├── schema.sql               ← initial schema (run first)
│   │   └── schema_alter_v2.sql      ← VECTOR(128→512) + match_face RPC (run after)
│   ├── llm/
│   │   ├── gemini_client.py         ← menu PDF parsing (Gemini Flash)
│   │   ├── groq_client.py           ← complaint + NLP (Groq strict JSON)
│   │   ├── complaint_classifier.py
│   │   ├── menu_parser.py
│   │   └── inventory_nlp.py
│   ├── auth/
│   │   ├── middleware.py
│   │   └── router.py
│   └── scheduler/
│       └── jobs.py                  ← APScheduler jobs (SENTINEL + HERALD)
├── camera_client/                   ← runs locally on kiosk/laptop
│   ├── capture.py                   #   webcam loop → IRIS API → overlay display
│   ├── config.py                    #   BACKEND_URL, KIOSK_API_KEY, CAMERA_INDEX
│   └── requirements.txt
├── frontend/                        ← React + Vite + Tailwind (Phase 7)
│   └── src/
│       ├── portals/
│       │   ├── student/
│       │   ├── mess_staff/
│       │   └── warden/
│       ├── auth/
│       └── components/
├── hostel-management-blueprint.md
└── README.md
```

---

## 8. Execution Roadmap (Build Order)

1. **Setup**: Supabase project (DB + Storage + Auth), enable `pgvector` extension, create schema above.
2. **Auth + role-gated routing**: get sign-up/login working for all 3 roles before anything else.
3. **Vision Agent**: build enrollment + recognition as standalone script first (test accuracy/speed locally before wiring to API).
4. **Attendance Agent**: wire vision events → attendance_logs, build the time-window cutoff job.
5. **Mess Agent (entry logic)**: recognition-gated entry, logging, unknown-person flagging.
6. **Mess Agent (inventory + menu)**: menu PDF upload/parsing, inventory table, depletion + alert logic.
7. **Mess Agent (NLP command bar)**: Groq structured-output parsing for staff commands.
8. **Maintenance Agent**: complaint submission + Groq classification + warden view.
9. **Orchestrator Agent**: cross-agent queries + anomaly_flags + warden dashboard feed.
10. **Polish**: dashboards, notifications (email or in-app), final testing with a real (small) dataset of enrolled faces.

---

## 9. Deployment Notes

| Component | Host |
|---|---|
| DB + Storage + Auth | Supabase (free tier) |
| Backend (FastAPI) | Render/Railway (free tier) |
| Frontend | Vercel/Netlify (free tier) |
| Camera/recognition client | Runs locally on demo laptop (`camera_client/capture.py`), calls hosted backend API. Facenet512 inference runs on the FastAPI server (CPU). For demo purposes, the kiosk script captures from webcam and POSTs JPEG frames to `/iris/recognize`. |
| Gemini API | Direct API calls from backend, free tier (Flash models), no credit card required — used only for menu PDF parsing |
| Groq API | Direct API calls from backend, free tier — used for complaint classification and inventory NLP command parsing, with strict JSON-schema structured outputs |

This gives you a fully hosted, demoable system where only the camera capture piece runs locally — which is realistic and expected for a real hostel deployment anyway.
