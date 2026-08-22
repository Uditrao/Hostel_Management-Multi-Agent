# Hostel Management Multi-Agent System — Project Blueprint

## 1. Project Summary

A hostel management system built as a **multi-agent architecture**, where each agent owns a specific domain, reasons over its own data, and reports into a shared database. A supervisor (Orchestrator/Warden) layer reads across agents to surface anomalies. The system exposes three role-based portals: **Student**, **Mess Staff**, and **Warden/Admin**.

### Agents in the system

| Agent | Type | Responsibility |
|---|---|---|
| Vision Agent | CV model (MobileFaceNet) | Face enrollment + recognition for gate attendance & mess entry |
| Attendance Agent | Rule-based | Marks attendance from Vision Agent events, enforces time window |
| Mess Agent | Rule-based + LLM (Gemini for menu PDF, Groq for staff NLP commands) | Validates mess entry, tracks consumption, forecasts inventory, parses menu PDFs, handles staff NLP commands |
| Maintenance Agent | LLM-based (Groq, structured output) | Classifies complaints (category + urgency), pushes structured ticket to Warden portal |
| Orchestrator Agent | Rule-based (+ optional LLM summarizer) | Cross-checks attendance/complaints/mess data, flags anomalies, notifies Warden |

---

## 2. Tech Stack (Final Recommendation)

| Layer | Choice | Why |
|---|---|---|
| Face Recognition | **MobileFaceNet** (via `insightface` model zoo or standalone ONNX) run with `onnxruntime` | Very lightweight (~4-5MB), fast on CPU, deployable even on free-tier hosts. At 10-20 enrolled students, accuracy is effectively as good as heavier models like ArcFace — gallery size is small enough that embedding separation isn't an issue. Focus effort on good enrollment photo quality (lighting, front-facing, 3-5 frames) instead of model size. |
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
  face_embedding VECTOR(128),   -- pgvector; set dim to match your MobileFaceNet ONNX build (commonly 128 or 256)
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

### 5.1 Vision Agent
1. Enrollment: capture 3–5 face frames → MobileFaceNet generates embeddings → average/store as one vector per student. (Confirm embedding dimension from the specific ONNX build you use — commonly 128 or 256-d for MobileFaceNet, vs 512-d for ArcFace — and set the `pgvector` column size to match.)
2. Recognition: incoming frame → generate embedding → `pgvector` cosine similarity search against all stored embeddings → best match above threshold (tune during testing with your actual enrolled set — start around 0.5-0.6 cosine similarity and adjust based on false accept/reject rate you observe) = match; below = "unknown."
3. Emits a structured event: `{student_id or null, timestamp, location: 'gate'|'mess'}` to the relevant agent (Attendance or Mess).

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
- **Real ML/AI**: face recognition (MobileFaceNet — an embedding-based deep learning model, lightweight but genuinely a trained neural network, not a heuristic), complaint classification (LLM reasoning), menu PDF structuring (LLM), NLP inventory commands (LLM function-calling)
- **Rule-based (not ML)**: inventory depletion math, attendance window logic, orchestrator anomaly checks — these are deterministic business rules acting on agent outputs, not trained models. This is normal and fine — most real "AI systems" are a mix of both — just don't call the depletion calculator "predictive AI," call it what it is.

---

## 7. Suggested Folder Structure

```
hostel-system/
├── backend/
│   ├── main.py
│   ├── agents/
│   │   ├── vision_agent.py
│   │   ├── attendance_agent.py
│   │   ├── mess_agent.py
│   │   ├── maintenance_agent.py
│   │   └── orchestrator_agent.py
│   ├── routers/
│   │   ├── student.py
│   │   ├── mess_staff.py
│   │   └── warden.py
│   ├── db/
│   │   ├── models.py
│   │   └── supabase_client.py
│   ├── llm/
│   │   ├── gemini_client.py       # menu PDF parsing only
│   │   ├── groq_client.py         # complaint classification + inventory NLP
│   │   ├── complaint_classifier.py
│   │   ├── menu_parser.py
│   │   └── inventory_nlp.py
│   ├── scheduler/
│   │   └── jobs.py
│   └── camera_client/          # runs locally at gate/mess kiosk
│       └── capture.py
├── frontend/
│   ├── src/
│   │   ├── portals/
│   │   │   ├── student/
│   │   │   ├── mess_staff/
│   │   │   └── warden/
│   │   ├── auth/
│   │   └── components/
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
| Camera/recognition client | Runs locally on your demo laptop/kiosk device, calls hosted backend API — but MobileFaceNet is light enough to also run server-side on the free-tier backend itself if you'd prefer a fully cloud-hosted demo |
| Gemini API | Direct API calls from backend, free tier (Flash models), no credit card required — used only for menu PDF parsing |
| Groq API | Direct API calls from backend, free tier — used for complaint classification and inventory NLP command parsing, with strict JSON-schema structured outputs |

This gives you a fully hosted, demoable system where only the camera capture piece runs locally — which is realistic and expected for a real hostel deployment anyway.
