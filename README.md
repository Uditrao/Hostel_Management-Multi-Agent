# Hostel Management Multi-Agent System

A production-ready, autonomous multi-agent hostel operating system built on **FastAPI**, **Supabase (PostgreSQL + pgvector)**, **FaceNet ONNX (512-d Biometrics)**, **LLMs (Google Gemini + Groq Llama 3.3)**, and **React (Vite + Tailwind CSS)**.

> 🧠 **Developer Blueprint & Architectural Memory**: See [`brain.md`](file:///d:/Sem5_AI-Project/brain.md) for the single source of truth, runtime constraints, and codebase state.

---

## 🤖 Multi-Agent Ecosystem

| Codename | Agent | Architecture | Responsibility |
|---|---|---|---|
| **IRIS** 👁️ | Vision Biometrics | Ultra-Lightweight FaceNet ONNX (512-d) + OpenCV | High-speed contactless face enrollment & recognition for Gate & Mess kiosks (~50ms latency, ~40MB RAM). |
| **SENTINEL** 🛡️ | Curfew & Attendance | Rule Engine + APScheduler | Dynamic gate curfew enforcement (`PRESENT` vs `LATE ENTRY`), daily defaulter detection, warden window manager. |
| **NOURISH** 🍽️ | Dining Logistics | Gemini 1.5/2.0 Flash + Groq Llama 3 + Heuristics | Mess entry gating, duplicate meal prevention, PDF weekly menu parsing, NLP inventory commands, food wastage tracking. |
| **FIXR** 🔧 | Maintenance Triage | Groq Llama 3.3 70B Structured JSON | Natural language complaint parsing, auto-categorization, urgency scoring, technician ticket lifecycle. |
| **HERALD** 🔍 | Autonomous Orchestrator | Cross-Agent Heuristic Engine | Multi-agent safety & welfare synthesis (resident medical distress, critical dual absence, gate deficits), automated morning briefing digest. |

---

## 👁️ Vision Engine Evolution: DeepFace vs. FaceNet ONNX

| Metric / Dimension | Phase 1A: DeepFace (Previous) | Phase 1B: FaceNet ONNX (Current Production) |
|---|---|---|
| **Underlying Framework** | TensorFlow / Keras (`tf-keras`) | **ONNX Runtime (`onnxruntime` C++ engine)** |
| **Runtime Memory (RAM)** | **~550 MB – 650 MB** (High Peak) | **~35 MB – 45 MB** (Ultra-Low Footprint) |
| **Cloud Compatibility** | ❌ **Crashed Render Free Tier** (OOM `kill -9` on 512MB RAM ceiling) | ✅ **100% Stable on Render Free Tier** (Process total ~140MB RAM) |
| **Inference Latency** | ~5,000 ms – 8,000 ms on CPU | **~40 ms – 60 ms on CPU (~50x faster)** |
| **Model Storage** | `facenet512_weights.h5` (~95 MB) | `facenet.onnx` (~89.6 MB cached at `backend/agents/iris/models/`) |
| **Embedding Vector** | 512-dimensional float (L2-normalized) | **512-dimensional float (L2-normalized)** |
| **Database Compatibility** | Supabase `VECTOR(512)` & `match_face()` | **100% Identical — Zero Database or Schema Changes** |
| **Face Detector** | Heavy DeepFace wrapper | Lightweight OpenCV Haar Cascade with 15% boundary margin |

> **Why the Switch Was Necessary**:  
> Render's Free Tier enforces a strict physical ceiling of **512 MB RAM**. Building the TensorFlow computational graph for Inception-ResNet-v1 spiked container memory beyond 512 MB, causing the Linux kernel to kill the process (`SIGKILL`). Migrating to `onnxruntime` eliminated TensorFlow entirely, dropped memory usage by over 90%, and reduced face recognition latency from ~6 seconds down to ~50 milliseconds.

---

## 🛡️ Curfew Window & Attendance Logic (SENTINEL)

* **Dynamic Attendance Windows**: Stored in Supabase `attendance_window` table and completely editable by the Warden via the UI.
* **Default Operating Hours**: `19:00:00` – `22:30:00` IST (7:00 PM – 10:30 PM), active Monday through Sunday.
* **Evaluation Rules**:
  * **On-Time Check-in (`✓ PRESENT`)**: Student scans on or before the curfew `end_time` (including earlier in the day/evening).
  * **Late Check-in (`⚠️ LATE ENTRY`)**: Student scans after `end_time` on an active curfew day.
  * **Defaulter (`ABSENT`)**: Enrolled student with zero check-in logs for the date when the APScheduler cutoff job evaluates.
  * **Overnight Curfew Support**: Handles windows that cross midnight (e.g., `21:00` to `01:00`).
  * **Upgrade-Only Idempotency**: If a student is tagged as late during afternoon movement, scanning during the active curfew window automatically upgrades their record to `✓ PRESENT`. Already `PRESENT` students cannot be downgraded by late re-scans.
* **Warden Control**: One-click **"Configure Curfew Timings"** modal accessible from both the Warden Dashboard and the Gate Kiosk.

---

## 🛠️ Complete Tech Stack

* **Backend**: FastAPI (Python `3.11.9`), Uvicorn, APScheduler, slowapi rate limiting.
* **Database & Vector Store**: Supabase PostgreSQL 15 with `pgvector` (`VECTOR(512)` cosine similarity indexing, `match_face()` RPC).
* **Authentication**: Supabase Auth + HS256 JWT validation with role-based guards (`student`, `warden`, `mess_staff`).
* **Vision AI**: ONNX Runtime + OpenCV (`facenet.onnx` 512-d).
* **Multimodal AI**: Google Gemini API (5-tier fallback: `gemini-2.0-flash`, `1.5-flash`, etc.) for weekly menu PDF structuring.
* **Language Models**: Groq API (`llama-3.3-70b-versatile`) for sub-second maintenance triage and mess inventory NLP commands.
* **Frontend**: React 18 (Vite), Tailwind CSS, Lucide Icons, Axios with Supabase Bearer token interceptor.
* **Hosting**:
  * Backend API: **Render** (`https://hostel-management-multi-agent-api.onrender.com`)
  * Frontend Client: **Vercel** (`https://*.vercel.app`)

---

## 🚀 Local Development Setup

### 1. Prerequisites
* Python 3.11 (`3.11.9` recommended)
* Node.js 18+ & npm
* Supabase project with `pgvector` extension enabled

### 2. Backend Setup
```powershell
cd backend
python -m venv venv
.\venv\Scripts\Activate.ps1
pip install -r requirements.txt
```

### 3. Backend Environment (`backend/.env`)
```env
SUPABASE_URL=https://YOUR_PROJECT.supabase.co
SUPABASE_ANON_KEY=your_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
SUPABASE_JWT_SECRET=your_jwt_secret
GEMINI_API_KEY=your_gemini_api_key
GROQ_API_KEY=your_groq_api_key
FACE_SIMILARITY_THRESHOLD=0.55
```

### 4. Run Backend Server
```powershell
uvicorn main:app --reload --port 8000
```
Swagger API docs available at `http://127.0.0.1:8000/docs`.

### 5. Frontend Setup
```powershell
cd frontend
npm install
npm run dev
```

### 6. Frontend Environment (`frontend/.env`)
```env
VITE_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
VITE_SUPABASE_ANON_KEY=your_anon_key
VITE_API_BASE_URL=http://localhost:8000
```
*(In production on Vercel, set `VITE_API_BASE_URL` to your live Render backend URL).*

---

## 📁 Repository Structure

```
Sem5_AI-Project/
├── brain.md                         # Central System Blueprint & Architectural State
├── README.md                        # Project Documentation & Getting Started
├── .python-version                  # Pinned to 3.11.9 for cloud build stability
├── backend/
│   ├── main.py                      # FastAPI entry point, lifespan, CORS, router mounts
│   ├── download_weights.py          # Pre-caches facenet.onnx during build
│   ├── requirements.txt             # Lightweight dependencies (no TensorFlow)
│   ├── agents/
│   │   ├── iris/                    # Face recognition engine, enrollment, recognition
│   │   ├── sentinel/                # Curfew windows, gate attendance, defaulter jobs
│   │   ├── nourish/                 # Dining kiosk, menu parser, inventory NLP, wastage
│   │   ├── fixr/                    # Maintenance complaint triage via Groq LLM
│   │   └── herald/                  # Safety orchestrator, anomaly detection heuristics
│   ├── auth/                        # JWT authentication & role-based route guards
│   ├── db/                          # Supabase client singleton & SQL migrations
│   └── scheduler/                   # APScheduler startup & cron jobs
└── frontend/
    ├── vercel.json                  # SPA rewrite rules
    ├── src/
    │   ├── App.jsx                  # Role-protected routing
    │   ├── context/AuthContext.jsx  # Supabase Auth session & token management
    │   ├── services/api.js          # Centralized API service with custom timeouts
    │   ├── components/warden/       # AttendanceWindowModal, etc.
    │   └── pages/                   # Student, Warden, and Mess Staff portals
```
