# Hostel Management Multi-Agent System

A comprehensive hostel management platform built on an **autonomous multi-agent architecture** using **FastAPI**, **Supabase (PostgreSQL + pgvector)**, **DeepFace (Facenet512)**, **LLMs (Google Gemini + Groq Llama 3)**, and **React (Vite + Tailwind CSS)**.

> 🧠 **Developer Context & State Blueprint**: See [`brain.md`](file:///d:/Sem5_AI-Project/brain.md) for the compressed single source of truth, architectural constraints, and repository mapping.

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
- **Menu PDF Understanding**: Google Gemini API (Flash tier with 5-tier fallback)
- **NLP & Classification**: Groq API (Llama 3 structured JSON schema)
- **Scheduler**: APScheduler (inside FastAPI lifespan)
- **Frontend**: React 18 (Vite), Tailwind CSS, Lucide Icons, Axios with Supabase JWT interceptor
- **Kiosk Client**: Local OpenCV capture script (`camera_client/capture.py`)

---

## 🚀 Setup & Installation

### 1. Prerequisites
- Python 3.11+
- Node.js 18+ & npm
- A [Supabase](https://supabase.com) project
- API keys from [Google AI Studio](https://aistudio.google.com) & [Groq Console](https://console.groq.com)

### 2. Backend Setup
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
Create a `.env` file in the `backend/` directory:
```env
SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key_here
SUPABASE_JWT_SECRET=your_jwt_secret_here
GEMINI_API_KEY=your_gemini_api_key_here
GROQ_API_KEY=your_groq_api_key_here
KIOSK_API_KEY=your_random_kiosk_secret
FACE_SIMILARITY_THRESHOLD=0.55
```

### 4. Database Setup (Supabase)
In your **Supabase Dashboard → SQL Editor**:
1. Run [`backend/db/schema.sql`](file:///d:/Sem5_AI-Project/backend/db/schema.sql) (creates base tables, vector extension, indexes).
2. Run [`backend/db/schema_alter_v2.sql`](file:///d:/Sem5_AI-Project/backend/db/schema_alter_v2.sql) (configures `VECTOR(512)` and the `match_face` similarity search function).

### 5. Running the Backend Server
```powershell
uvicorn main:app --reload
```
- **Health Check**: [http://localhost:8000/health](http://localhost:8000/health)
- **Interactive Swagger Docs**: [http://localhost:8000/docs](http://localhost:8000/docs)

### 6. Running the Frontend Portals
```powershell
cd frontend
npm install
npm run dev
```
Open [http://localhost:5173](http://localhost:5173) in your browser.

---

## 📁 Repository Structure

```
Sem5_AI-Project/                     # Git Repository Root
├── .antigravityignore               # Token-saving ignore list
├── brain.md                         # Architecture state blueprint & single source of truth
├── PROJECT_SUMMARY.md               # Executive project summary document
├── README.md                        # Project documentation
├── backend/
│   ├── main.py                      # FastAPI app entry point & router wiring
│   ├── requirements.txt             # Python dependencies
│   ├── .env                         # Secrets (gitignored)
│   ├── agents/
│   │   ├── iris/                    # IRIS (Vision & Face Engine)
│   │   ├── sentinel/                # SENTINEL (Attendance & Curfew)
│   │   ├── nourish/                 # NOURISH (Mess & Inventory)
│   │   ├── fixr/                    # FIXR (Maintenance Triage)
│   │   └── herald/                  # HERALD (Orchestrator & Anomalies)
│   ├── db/                          # Supabase client, models, schema.sql
│   ├── auth/                        # Supabase Auth verification & role guards
│   ├── llm/                         # Gemini REST, Groq, inventory_nlp synonyms
│   └── scheduler/                   # APScheduler jobs
├── frontend/
│   ├── src/
│   │   ├── context/                 # AuthContext (Supabase sessions & token refresh)
│   │   ├── services/api.js          # Axios client with Bearer token interceptor
│   │   └── pages/
│   │       ├── student/             # Student Dashboard, Face Enrollment, Attendance, Complaints
│   │       ├── mess/                # Mess Dashboard, Inventory, Menu Upload, NLP Command Bar
│   │       └── warden/              # Warden Dashboard, Gate Kiosk, Approvals, Defaulters, Anomalies
└── camera_client/                   # Local OpenCV capture script for kiosk demo
    ├── capture.py                   # Real-time capture & UI overlay
    └── config.py                    # Kiosk connection configuration
```

---

## 📅 Roadmap & Execution Progress

| Phase | Milestone | Status |
|---|---|---|
| **Phase 0** | Scaffold, Supabase DB, FastAPI Skeleton | ✅ Complete |
| **Phase 1** | **IRIS** — Face Recognition (DeepFace / Facenet512) & Kiosk Client | ✅ Complete |
| **Phase 2** | **SENTINEL** — Gate Attendance & Defaulters Scheduler | ✅ Complete |
| **Phase 3A** | **NOURISH** — Mess Entry Gating & Meal Windows | ✅ Complete |
| **Phase 3B** | **NOURISH** — Inventory Management & Multimodal Menu Parsing (Gemini) | ✅ Complete |
| **Phase 3C** | **NOURISH** — Mess Staff NLP Command Bar (Groq + Gemini fallback) | ✅ Complete |
| **Phase 4** | **FIXR** — Maintenance Complaint Auto-Triage (Groq) | ✅ Complete |
| **Phase 5** | **HERALD** — Multi-Agent Cross-Check & Anomaly Detection | ✅ Complete |
| **Phase 6** | **Supabase Auth & Role Guards** (Student, Warden, Mess Staff) | ✅ Complete |
| **Phase 7** | **Frontend Portals** (Student, Warden, Mess Staff Dashboards & Pages) | ✅ Complete |
| **Phase 8** | **NOURISH Advanced Operations** (Kiosk, Radar Alerts, Hybrid Depletion, Wastage) | ✅ Complete |
| **Phase 9** | **Warden Academic & Event Schedule Manager** (Exams & Vacations) | ⏳ Up Next |
| **Phase 10** | **Student Digital Outpass & Leave Workflow** (SENTINEL Multi-Agent Link) | ⏳ Up Next |
| **Phase 11** | **Synthetic Dataset & Predictive ML Turnout Engine** (NOURISH-Oracle) | ⏳ Up Next |
| **Phase 12** | **External Alerts (WhatsApp / Email)** & Hardware Turnstile Relay | ⏸️ Pending |

---

## 🚀 Extended System Architecture: Predictive ML & Outpass Pipeline

```
┌────────────────────────────────────────────────────────────────────────┐
│                      WARDEN ACADEMIC CALENDAR                          │
│  Warden adds Exam & Vacation date ranges via Portal (/warden/calendar) │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│                   STUDENT DIGITAL OUTPASS (SENTINEL)                   │
│  Student submits Leave/Pass with parent contact → Warden approves       │
│  Gate checkout automatically calculates Live Off-Campus Count          │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│                  NOURISH-ORACLE (Predictive ML Engine)                 │
│  Inputs: [Day, Meal, Dish Popularity, Outpasses, Exam Flag, Wastage]   │
│  Output: Predicted Turnout (e.g. 118) + Adaptive Buffer (+8% = 127)     │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│                 HYBRID KITCHEN STOCK ISSUE & DEPLETION                 │
│  Auto-prefills recipe requirements for 127 diners into Manager Panel   │
│  Manager reviews actuals → 1-tap issue → post-meal wastage logged      │
└────────────────────────────────────────────────────────────────────────┘
```

---

## ⏳ Active Implementation Pipeline (NOURISH Advanced Operations)

1. **📊 Dynamic Meal Head Count & Dining Kiosk**: ✅ **Complete**
   - Built dedicated **NOURISH Mess Entry Kiosk** (`/mess/kiosk`) with real-time biometric face verification.
   - Enforces single-meal access (duplicate check-in rejection), logs unrecognized attempts, and increments live meal counters (`Breakfast`, `Lunch`, `Dinner`, `Total`).
   - Includes Web Audio feedback, auto-scan mode, and manual roll number lookup fallback.

2. **🔔 Proactive Menu $\leftrightarrow$ Inventory Shortage Alerts**: ✅ **Complete**
   - Proactive multi-timeline forecasting engine in NOURISH calculating ingredient requirements against current stock:
     - 🔴 **Today's Immediate Shortages (Critical)**: Flags deficits for today's upcoming lunch/dinner to handle emergency kitchen needs.
     - 🟠 **Tomorrow's Advance Market Procurement List (High)**: 24-hour advance purchase radar telling staff what to procure from the market today before tomorrow's prep.
   - Interactive **"Kitchen Procurement & Stock Radar"** widget active on the Mess Dashboard (`/mess/dashboard`).

3. **🍽️ Hybrid Kitchen Stock Issue (Pre-filled Depletion)**: ✅ **Complete**
   - Solves the storeroom reality where food is cooked in advance with safety buffers before diners arrive.
   - Automatically pre-fills recipe quantities (`head_count × ingredient_ratio`) for the selected meal.
   - Allows the mess manager to review and adjust quantities (e.g. extra bags opened) and deduct in one tap (`POST /nourish/depletion/custom`).
   - Displays real-time stock availability, dish recipe breakdown, and automated threshold alerts.

4. **📉 Post-Meal Food Wastage Counter & Analytics**: ✅ **Complete**
   - Interactive logger on the Mess Dashboard to record post-meal leftover food in kg (`POST /nourish/wastage`).
   - Dynamic per-diner waste metric (`g / student`) with real-time severity ratings (Optimal $\le 3$kg, Moderate $3-8$kg, High $> 8$kg).
   - SQL schema migration created at [`schema_alter_v3_wastage.sql`](file:///d:/Sem5_AI-Project/backend/db/schema_alter_v3_wastage.sql) with in-memory fallback cache.
   - Lays ground-truth data for future turnout prediction ML models and smart cooking advisories.
