# Hostel Management Multi-Agent System

A comprehensive hostel management platform built on a **multi-agent architecture** using **FastAPI**, **Supabase (PostgreSQL + pgvector)**, **DeepFace (Facenet512)**, and **LLMs (Gemini + Groq)**.

---

## 🤖 Agents in the System

| Codename | Agent | Type | Responsibility |
|---|---|---|---|
| **IRIS** 👁️ | Vision Agent | Deep Learning (`deepface` / Facenet512) | Face enrollment & real-time recognition for gate & mess kiosks |
| **SENTINEL** 🛡️ | Attendance Agent | Rule-based + Scheduler | Processes gate events, marks attendance (present/late), tracks defaulters |
| **NOURISH** 🍽️ | Mess Agent | Rule-based + LLMs (Gemini + Groq) | Entry gating, automated inventory depletion, menu PDF parsing, NLP command bar |
| **FIXR** 🔧 | Maintenance Agent | LLM (`groq` structured outputs) | Automatic complaint categorization, urgency ranking, warden ticketing |
| **HERALD** 🔍 | Orchestrator Agent | Cross-agent Reasoning + Summarizer | Cross-correlates data, flags student anomalies (missed meals/gate), daily digest |

---

## 🛠️ Tech Stack & Architecture

- **Backend**: FastAPI (Python 3.11+)
- **Database & Storage**: Supabase PostgreSQL with `pgvector` (512-dimensional cosine similarity indexing)
- **Face Recognition**: `deepface` (Facenet512 model, OpenCV detector backend)
- **Menu PDF Understanding**: Google Gemini API (Flash tier)
- **NLP & Classification**: Groq API (Llama 3 / strict JSON schema mode)
- **Scheduler**: APScheduler (inside FastAPI)
- **Kiosk Client**: Local OpenCV capture script (`camera_client/capture.py`)

---

## 🚀 Setup & Installation

### 1. Prerequisites
- Python 3.11+
- A [Supabase](https://supabase.com) project
- Free API keys from [Google AI Studio](https://aistudio.google.com) & [Groq Console](https://console.groq.com)

### 2. Virtual Environment Setup
```powershell
# Navigate to the backend directory
cd backend

# Create and activate virtual environment
python -m venv venv
.\venv\Scripts\Activate.ps1

# Install dependencies
pip install -r requirements.txt
```

### 3. Environment Configuration
Create a `.env` file in the `backend/` directory based on `.env.example`:
```powershell
Copy-Item .env.example .env
```
Fill in your credentials:
```env
SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key_here
GEMINI_API_KEY=your_gemini_api_key_here
GROQ_API_KEY=your_groq_api_key_here
KIOSK_API_KEY=your_random_kiosk_secret
FACE_SIMILARITY_THRESHOLD=0.55
```

### 4. Database Setup (Supabase)
In your **Supabase Dashboard → SQL Editor**:
1. Run [`backend/db/schema.sql`](file:///d:/Sem5_AI-Project/backend/db/schema.sql) (creates tables, vector extension, indexes).
2. Run [`backend/db/schema_alter_v2.sql`](file:///d:/Sem5_AI-Project/backend/db/schema_alter_v2.sql) (configures `VECTOR(512)` and the `match_face` similarity search function).

### 5. Running the Backend Server
```powershell
uvicorn main:app --reload
```
- **Health Check**: [http://localhost:8000/health](http://localhost:8000/health)
- **Interactive Swagger Docs**: [http://localhost:8000/docs](http://localhost:8000/docs)

---

## 👁️ Testing Phase 1 (IRIS — Vision Agent)

### 1. Via Swagger UI
1. Open [http://localhost:8000/docs](http://localhost:8000/docs).
2. **`GET /iris/status`**: Verify agent capabilities and model readiness.
3. **`POST /iris/enroll`**: Enroll a student by providing `student_id` (UUID from DB) and uploading a photo (`mode=upload`) or webcam capture (`mode=webcam`).
4. **`POST /iris/recognize`**: Upload a test picture to query pgvector and receive a structured recognition event.

### 2. Via Camera Kiosk Client
```powershell
# From project root
cd camera_client

# Run kiosk in gate mode (spacebar captures and tests face against backend)
python capture.py --mode gate
```

---

## 📁 Repository Structure

```
Sem5_AI-Project/                     # Git Repository Root
├── backend/
│   ├── main.py                      # FastAPI app entry point & router wiring
│   ├── requirements.txt             # Python dependencies
│   ├── .env                         # Environment variables (gitignored)
│   ├── .env.example                 # Template for secrets
│   ├── agents/
│   │   ├── iris/                    # Phase 1: IRIS (Vision Agent)
│   │   │   ├── face_engine.py       # Facenet512 embeddings & face detection
│   │   │   ├── enrollment.py        # Single image & multi-frame webcam enrollment
│   │   │   ├── recognition.py       # pgvector cosine similarity search
│   │   │   └── router.py            # /iris/* endpoints
│   │   ├── sentinel/                # Phase 2: SENTINEL (Attendance Agent)
│   │   ├── nourish/                 # Phase 3: NOURISH (Mess Agent)
│   │   ├── fixr/                    # Phase 4: FIXR (Maintenance Agent)
│   │   └── herald/                  # Phase 5: HERALD (Orchestrator Agent)
│   ├── db/
│   │   ├── models.py                # Pydantic data schemas
│   │   ├── supabase_client.py       # Supabase connection singleton
│   │   ├── schema.sql               # Base PostgreSQL tables & constraints
│   │   └── schema_alter_v2.sql      # VECTOR(512) migration & match_face RPC
│   ├── llm/                         # LLM interfaces (Gemini & Groq)
│   ├── auth/                        # Role-based auth & JWT verification
│   └── scheduler/                   # Background recurring jobs (APScheduler)
├── camera_client/                   # Local OpenCV capture script for kiosk demo
│   ├── capture.py                   # Real-time capture & UI overlay
│   ├── config.py                    # Kiosk connection configuration
│   └── requirements.txt             # Camera client dependencies
├── hostel-management-blueprint.md   # Architectural blueprint
└── README.md
```

---

## 📅 Roadmap & Execution Progress

| Phase | Milestone | Status |
|---|---|---|
| **Phase 0** | Scaffold, Supabase DB, FastAPI Skeleton | ✅ Complete |
| **Phase 1** | **IRIS** — Face Recognition (DeepFace / Facenet512) & Kiosk Client | ✅ Complete |
| **Phase 2** | **SENTINEL** — Gate Attendance & Defaulters Scheduler | ✅ Complete |
| **Phase 3A** | **NOURISH** — Mess Entry Gating | ✅ Complete |
| **Phase 3B** | **NOURISH** — Inventory Depletion & Menu PDF Parsing (Gemini) | ✅ Complete |
| **Phase 3C** | **NOURISH** — Mess Staff NLP Command Bar (Groq + Gemini fallback) | ✅ Complete |
| **Phase 4** | **FIXR** — Maintenance Complaint Auto-Triage (Groq) | ⏳ Up Next |
| **Phase 5** | **HERALD** — Multi-Agent Cross-Check & Anomaly Detection | ⏸️ Pending |
| **Phase 6** | Supabase Auth Integration & Role Guards | ⏸️ Pending |
| **Phase 7** | Frontend Portals (Student, Mess Staff, Warden) | ⏸️ Pending |
| **Phase 8** | Camera Kiosk Deployment & Validation | ⏸️ Pending |
| **Phase 9** | End-to-End Testing & Production Deploy | ⏸️ Pending |
