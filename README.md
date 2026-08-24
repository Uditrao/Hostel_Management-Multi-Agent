# Hostel Management Multi-Agent System

A hostel management system built on a **multi-agent architecture** using FastAPI, Supabase (PostgreSQL + pgvector), and LLMs (Gemini + Groq).

## Agents

| Codename | Role |
|---|---|
| **IRIS** | Vision Agent — face enrollment & recognition (MobileFaceNet) |
| **SENTINEL** | Attendance Agent — gate events → attendance logs |
| **NOURISH** | Mess Agent — entry gating, inventory, menu PDF parsing, NLP commands |
| **FIXR** | Maintenance Agent — complaint classification via Groq |
| **HERALD** | Orchestrator Agent — cross-agent anomaly detection |

---

## Prerequisites

- Python 3.11+
- A [Supabase](https://supabase.com) project with `pgvector` extension enabled
- (Phase 1+) A webcam and `onnxruntime` compatible system
- API keys: Gemini (free at [aistudio.google.com](https://aistudio.google.com)) + Groq (free at [console.groq.com](https://console.groq.com))

---

## Phase 0 Setup

### 1. Clone & enter the project
```powershell
cd hostel-system/backend
```

### 2. Create a virtual environment
```powershell
python -m venv venv
.\venv\Scripts\Activate.ps1
```

### 3. Install dependencies
```powershell
pip install -r requirements.txt
```

### 4. Set up environment variables
```powershell
Copy-Item .env.example .env
# Open .env and fill in your Supabase URL + keys
```

### 5. Run the Supabase schema
- Go to your Supabase Dashboard → **SQL Editor** → **New Query**
- Paste the contents of `db/schema.sql` and click **Run**

### 6. Start the backend
```powershell
uvicorn main:app --reload
```

### 7. Verify
Open [http://localhost:8000/health](http://localhost:8000/health) — you should see:
```json
{"status": "ok", "system": "Hostel Management Multi-Agent System"}
```

API docs available at [http://localhost:8000/docs](http://localhost:8000/docs)

---

## Project Structure

```
hostel-system/
├── backend/
│   ├── main.py                  # FastAPI entry point
│   ├── requirements.txt
│   ├── .env.example
│   ├── db/
│   │   ├── schema.sql           # Full Postgres schema — run in Supabase SQL Editor
│   │   ├── models.py            # Pydantic models for all tables
│   │   └── supabase_client.py  # Singleton DB client
│   ├── agents/
│   │   ├── iris/                # Phase 1 — Vision Agent
│   │   ├── sentinel/            # Phase 2 — Attendance Agent
│   │   ├── nourish/             # Phase 3 — Mess Agent
│   │   ├── fixr/                # Phase 4 — Maintenance Agent
│   │   └── herald/              # Phase 5 — Orchestrator Agent
│   ├── llm/                     # LLM clients (Gemini, Groq)
│   ├── auth/                    # Phase 6 — Supabase JWT middleware
│   └── scheduler/               # APScheduler jobs
├── frontend/                    # Phase 7 — React + Vite + Tailwind
├── camera_client/               # Phase 8 — Local OpenCV kiosk script
└── .gitignore
```

---

## Build Phases

| Phase | What gets built |
|---|---|
| **0** ✅ | Scaffold, DB schema, FastAPI skeleton |
| 1 | IRIS — face enrollment & recognition |
| 2 | SENTINEL — attendance marking & defaulters |
| 3A | NOURISH — mess entry gating |
| 3B | NOURISH — inventory + menu PDF (Gemini) |
| 3C | NOURISH — NLP command bar (Groq) |
| 4 | FIXR — complaint classification (Groq) |
| 5 | HERALD — orchestrator anomaly detection |
| 6 | Auth — Supabase JWT + role-gated routes |
| 7 | Frontend — React portals (Student, Mess Staff, Warden) |
| 8 | Camera kiosk client (OpenCV → API) |
| 9 | Deployment — Render + Vercel |
