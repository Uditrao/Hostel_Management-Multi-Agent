# 🚀 EXTENDED PROJECT BLUEPRINT: AI TURNOUT PREDICTION, LEAVE MANAGEMENT & MULTI-AGENT SYNCHRONIZATION

> **Document Type**: Master Technical Architecture & Step-by-Step Implementation Guide  
> **Target Scope**: Extended Phases 9 through 12 of the Hostel Management Multi-Agent System  
> **Date**: November 2026  
> **Status**: Approved Blueprint for Execution  

---

## 📑 Table of Contents
1. [Executive Summary & High-Level Architecture](#1-executive-summary--high-level-architecture)
2. [Module 1: Warden Academic & Event Schedule Manager](#2-module-1-warden-academic--event-schedule-manager)
3. [Module 2: Student Digital Outpass & Leave Workflow (100% Kiosk-Compatible)](#3-module-2-student-digital-outpass--leave-workflow-100-kiosk-compatible)
4. [Module 3: Multi-Agent Coherence & Immunity Rules (SENTINEL + HERALD + NOURISH)](#4-module-3-multi-agent-coherence--immunity-rules-sentinel--herald--nourish)
5. [Module 4: Master Synthetic Dataset Specification & LLM Generation Prompt](#5-module-4-master-synthetic-dataset-specification--llm-generation-prompt)
6. [Module 5: Machine Learning Turnout Model & Google Colab Blueprint](#6-module-5-machine-learning-turnout-model--google-colab-blueprint)
7. [Module 6: NOURISH Real-Time Production Integration (NOURISH-Oracle)](#7-module-6-nourish-real-time-production-integration-nourish-oracle)
8. [Phased Implementation Roadmap & Verification Checklist](#8-phased-implementation-roadmap--verification-checklist)

---

## 1. Executive Summary & High-Level Architecture

The core foundation of the multi-agent system (**IRIS, SENTINEL, NOURISH, FIXR, HERALD**) is fully operational across biometrics, meal check-ins, menu parsing, and maintenance tickets.

This **Extended System** transforms dining operations from reactive record-keeping to **Predictive, AI-Driven Demand Forecasting**:
- Eliminates the guess-work in mess cooking by predicting real diner turnout instead of using flat assumptions.
- Integrates a **100% Digital Outpass & Leave System** covering only the two actual physical spaces: the **Hostel Kiosk** and the **Mess Kiosk** (no external gate hardware needed).
- Guarantees multi-agent immunity: students on approved leave are never penalized as 22:00 IST curfew defaulters, never trigger false health alarms, and are automatically excluded from kitchen meal batches.

```
┌──────────────────────────────────────────────────────────────────────────────────┐
│                             WARDEN ACADEMIC PORTAL                               │
│        Warden schedules Exam & Vacation Date Windows (/warden/calendar)          │
└────────────────────────────────────────┬─────────────────────────────────────────┘
                                         │
                                         ▼
┌──────────────────────────────────────────────────────────────────────────────────┐
│                   STUDENT DIGITAL OUTPASS & LEAVE WORKFLOW                       │
│  Student submits Leave with Parent Contacts (/student/outpass)                   │
│  Warden clicks Approve on Portal Hub (/warden/approvals)                         │
└──────────────────┬─────────────────────────────────────────────┬─────────────────┘
                   │                                             │
                   ▼                                             ▼
┌──────────────────────────────────────┐     ┌─────────────────────────────────────┐
│          SENTINEL AGENT              │     │             HERALD AGENT            │
│  Hostel Kiosk 22:00 Curfew Check:    │     │  Cross-Agent Anomaly Engine:        │
│  Students on leave marked `on_leave` │     │  Suppresses missed-meal alarms      │
│  IMMUNITY: Zero false defaulters!    │     │  for students officially on leave   │
└──────────────────┬───────────────────┘     └─────────────────────────────────────┘
                   │
                   ▼
┌──────────────────────────────────────────────────────────────────────────────────┐
│                      NOURISH-ORACLE (Predictive ML Engine)                       │
│  Inputs: [Day, Meal, Dish Popularity, Off-Campus Count, Exam Flag, Wastage]      │
│  Output: Predicted Turnout (e.g. 118) + Adaptive Buffer (+8% = 127 Portions)     │
└────────────────────────────────────────┬─────────────────────────────────────────┘
                                         │
                                         ▼
┌──────────────────────────────────────────────────────────────────────────────────┐
│               HYBRID KITCHEN STOCK ISSUE & POST-MEAL WASTAGE PANEL               │
│  • Auto-prefills exact recipe raw quantities for 127 diners                      │
│  • Staff reviews actual storeroom issue → 1-tap stock deduction                  │
│  • Post-meal leftover waste recorded in kg → feeds future ML prediction cycles   │
└──────────────────────────────────────────────────────────────────────────────────┘
```

---

## 2. Module 1: Warden Academic & Event Schedule Manager

### Objective
Allow the Warden to set university calendars, exam schedules, and holiday windows directly from the Warden Portal without editing code or database rows.

### Database Schema (`academic_calendar`)
```sql
CREATE TABLE IF NOT EXISTS public.academic_calendar (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_name TEXT NOT NULL,
    event_type TEXT NOT NULL CHECK (event_type IN ('exam', 'vacation', 'holiday', 'festival')),
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    notes TEXT,
    created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_academic_cal_dates ON public.academic_calendar(start_date, end_date);
```

### Backend Endpoints (`backend/agents/sentinel/` or `backend/agents/warden/`)
- `GET /academic/events`: Returns all active or upcoming scheduled events.
- `POST /academic/events`: Warden creates a new date window (`event_name`, `event_type`, `start_date`, `end_date`).
- `DELETE /academic/events/{id}`: Warden removes an event.

### Frontend Component (`WardenCalendarPage.jsx` / Tab on `/warden/dashboard`)
- Calendar grid / timeline list showing upcoming events.
- Quick Modal Form:
  - Event Name: *e.g., Midterm Examinations, Diwali Break, Tech Fest*.
  - Event Category: Dropdown (`Exams`, `Semester Break / Vacation`, `Public Holiday`).
  - Date Range Pickers: Start Date and End Date.
  - "Save to Schedule" button.

---

## 3. Module 2: Student Digital Outpass & Leave Workflow (100% Kiosk-Compatible)

### Objective
Provide a digital outpass workflow tailored strictly to **Hostel & Mess boundaries** without requiring physical university gate scanners.

### Database Schema (`student_outpasses`)
```sql
CREATE TABLE IF NOT EXISTS public.student_outpasses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    student_id UUID NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
    pass_type TEXT NOT NULL CHECK (pass_type IN ('day_pass', 'night_outpass', 'vacation_leave')),
    departure_datetime TIMESTAMPTZ NOT NULL,
    expected_return_datetime TIMESTAMPTZ NOT NULL,
    actual_return_datetime TIMESTAMPTZ,
    destination TEXT NOT NULL,
    reason TEXT NOT NULL,
    parent_name TEXT NOT NULL,
    parent_phone TEXT NOT NULL,
    parent_email TEXT,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'completed')),
    warden_remarks TEXT,
    approved_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_outpasses_active ON public.student_outpasses(student_id, departure_datetime, expected_return_datetime);
CREATE INDEX IF NOT EXISTS idx_outpasses_status ON public.student_outpasses(status);
```

### The 4-Step Lifecycle:

#### Step 1: Student Applies (`/student/outpass`)
- **Auto-populated fields**: Student Name, Roll Number, Room Number.
- **Form Inputs**:
  - `Pass Type`:
    - `Day Pass`: Leave hostel in morning, return before 22:00 IST curfew.
    - `Night Outpass`: Overnight stay outside (1–2 nights).
    - `Vacation / Home Leave`: Extended semester break or festival leave.
  - `Departure & Return Date/Time`: Date-time pickers.
  - `Destination & Purpose`: Detailed text field (e.g. *Visiting parents in Jaipur for Diwali*).
  - `Parent Contact Information`: Full Name, Mobile Number, Email Address.
  - Submit button $\rightarrow$ calls `POST /sentinel/outpass/apply`.

#### Step 2: Warden Verification & Approval (`/warden/approvals`)
- Warden dashboard has a dedicated **"Outpass Requests"** tab.
- Displays student details, reason, period, and parent contact.
- Quick Actions:
  - 📞 **"Call Parent"** button (`tel:+91...`).
  - ✉️ **"Email Parent"** button.
  - ✅ **"Approve"**: marks status as `approved`.
  - ❌ **"Reject"**: requires a rejection reason.

#### Step 3: Automated Date-Window Enforcement (Zero Extra Hardware)
For every calendar date between `departure_datetime` and `expected_return_datetime`:
- The student is registered as officially **`on_approved_leave`**.
- Multi-agent rules are activated automatically (detailed in Module 3).

#### Step 4: When the Student Returns to Hostel
- The student returns to the hostel at night and performs their regular biometric face scan at the **Hostel Kiosk** (`/student/attendance` or physical kiosk).
- If the return date has passed, the outpass status automatically updates to `completed`.
- Student instantly resumes daily status:
  - Active in nightly curfew logs.
  - Re-added to dining headcount calculations.

---

## 4. Module 3: Multi-Agent Coherence & Immunity Rules (SENTINEL + HERALD + NOURISH)

This guarantees that data across agents remains 100% synchronized and prevents false alarms.

### Rule A: SENTINEL Curfew Defaulter Immunity
- **22:00 IST Curfew Evaluation**:
  - The APScheduler job in `backend/agents/sentinel/curfew.py` runs nightly at 22:00 IST.
  - Before flagging missing students as `defaulters`, it performs an immunity query:
    ```sql
    SELECT student_id FROM public.student_outpasses
    WHERE status = 'approved'
      AND NOW() AT TIME ZONE 'Asia/Kolkata' >= departure_datetime
      AND NOW() AT TIME ZONE 'Asia/Kolkata' <= expected_return_datetime;
    ```
  - **Result**: Any student with an approved pass for tonight is logged as **`status = 'on_leave'`**.
  - **Guarantee**: They are **excluded** from the defaulters table and never flagged with disciplinary warnings.

### Rule B: HERALD Welfare Anomaly Filter
- **Welfare Anomaly Detection**:
  - HERALD monitors students who are logged inside the hostel but have missed 3 consecutive meals.
  - **Immunity Check**: If `student.is_on_leave == True`, HERALD skips the check.
  - **Guarantee**: No false emergency welfare tickets are dispatched to the warden while a student is at home.

### Rule C: NOURISH Campus Strength Subtraction
- **Formula**:
  $$\text{Effective Campus Diners} = \text{Total Enrolled Students} - \text{Students with Active Approved Outpass Today}$$
- If 35 students have approved leaves for Sunday, NOURISH automatically sets base dining potential to $150 - 35 = 115$.

---

## 5. Module 4: Master Synthetic Dataset Specification & LLM Generation Prompt

To train the machine learning turnout model, we generate a **90-day multi-factor time-series dataset** (270 meal records).

### Master Generation Prompt (Copy & Paste to Claude / ChatGPT / Gemini)

```markdown
You are a Lead Data Scientist specializing in campus dining operations and demand forecasting. Generate a highly realistic 90-day time-series synthetic dataset in CSV format for a university hostel mess with a baseline student capacity of 150 residents.

Specifications:
- Total Days: 90 consecutive days (2026-08-01 to 2026-10-29).
- Total Records: 3 meals per day (Breakfast, Lunch, Dinner) = exactly 270 rows.
- Format: Clean CSV output starting with headers.

Columns to generate:
1. `date`: ISO format YYYY-MM-DD
2. `day_of_week`: Monday, Tuesday, Wednesday, Thursday, Friday, Saturday, Sunday
3. `meal_type`: breakfast, lunch, or dinner
4. `main_dish`:
   - Breakfast items: Poha, Idli Sambhar, Aloo Paratha, Upma, Chole Bhature
   - Lunch items: Dal Tadka & Rice, Rajma Chawal, Kadi Pakoda, Aloo Gobi & Roti, Paneer Butter Masala
   - Dinner items: Chicken/Veg Biryani, Egg Curry & Rice, Dal Makhani & Naan, Khichdi, Mix Veg Sabzi
5. `dish_popularity_score`: Float between 1.0 (lowest, e.g. Khichdi) and 10.0 (highest, e.g. Biryani, Paneer)
6. `is_exam_period`: Integer (0 or 1). Include two 7-day exam blocks (Midterms: Sept 15-21, Endterms: Oct 20-26).
7. `is_vacation_or_holiday`: Integer (0 or 1). Include a 4-day festive weekend (Aug 15-18) and standard weekends.
8. `approved_outpasses_count`: Integer count of residents on approved leave:
   - Weekdays (Mon-Thu): 2 to 9
   - Friday dinner & weekend: 20 to 45
   - Vacation / Festival block: 60 to 105
9. `campus_resident_strength`: Integer = (150 - approved_outpasses_count)
10. `yesterday_waste_kg`: Float (0.5 to 11.5 kg) from previous day's same meal service
11. `actual_headcount_served`: Integer (TARGET 1 - Ground-truth diners scanned at mess kiosk):
    - Must obey constraints: actual_headcount_served <= campus_resident_strength.
    - Driven by dish popularity: Biryani (+20% turnout), Chole Bhature (+15%), Khichdi (-25%).
    - Sunday Breakfast has low attendance (only 55% to 65% of on-campus residents).
    - Exam periods slightly depress lunch turnout (-15%) but sustain dinner.
12. `actual_food_cooked_kg`: Float (Raw equivalent prepared by kitchen, including +5% to +10% safety buffer over actual headcount).
13. `leftover_waste_kg`: Float (TARGET 2 - Converted leftover food wasted post-service, proportional to over-preparation).

Ensure authentic time-series dependencies:
- High outpass count must strictly constrain headcount.
- Popular meals must have lower wastage when cooked accurately, but high wastage if over-buffered.
- Provide full raw CSV text directly.
```

---

## 6. Module 5: Machine Learning Turnout Model & Google Colab Blueprint

### Machine Learning Formulation
- **Algorithm**: Random Forest Regressor / LightGBM Regressor.
- **Features ($X$)**:
  - Categorical: `day_of_week`, `meal_type` (One-hot encoded).
  - Numerical: `dish_popularity_score`, `is_exam_period`, `is_vacation_or_holiday`, `approved_outpasses_count`, `campus_resident_strength`, `yesterday_waste_kg`, `is_weekend`.
- **Target ($y$)**: `actual_headcount_served`.
- **Asymmetric Dining Loss**:
  $$\text{Penalty for Food Shortage} = 3 \times \text{Penalty for Slight Food Surplus}$$
  Running out of food for hungry students causes student unrest; slight surplus is safely composted.

### Adaptive Cooking Target Formula
$$\text{Recommended Portions} = \lceil \text{Predicted Headcount} \times (1 + \text{Adaptive Buffer \%}) \rceil$$

Where:
- $\text{Base Buffer} = +6\%$
- If $\text{Dish Popularity} \ge 8.5$: $+4\%$ (for second helpings)
- If $\text{Is Exam Period} == 1$: $-2\%$ (more predictable dining)
- If $\text{Yesterday Waste} > 8\text{ kg}$: $-3\%$ (dampening penalty)
- $\text{Adaptive Buffer}$ is clamped between **$+3\%$** and **$+12\%$**.

### Complete Google Colab Python Training Script

```python
# ==============================================================================
# NOURISH-Oracle: Headcount Turnout & Adaptive Cooking Target Model
# Run in Google Colab (Python 3.10+)
# ==============================================================================

import pandas as pd
import numpy as np
import joblib
from sklearn.model_selection import train_test_split
from sklearn.ensemble import RandomForestRegressor
from sklearn.metrics import mean_absolute_error, mean_squared_error, r2_score

# 1. Load Synthetic Dataset
# Upload 'mess_historical_data.csv' to Colab session files
df = pd.read_csv('mess_historical_data.csv')
print(f"Loaded {len(df)} records.")

# 2. Feature Engineering
df['date'] = pd.to_datetime(df['date'])
df['is_weekend'] = df['day_of_week'].isin(['Saturday', 'Sunday']).astype(int)

# One-hot encoding for categorical variables
df_encoded = pd.get_dummies(df, columns=['day_of_week', 'meal_type'], drop_first=False)

feature_cols = [
    'dish_popularity_score',
    'is_exam_period',
    'is_vacation_or_holiday',
    'approved_outpasses_count',
    'campus_resident_strength',
    'yesterday_waste_kg',
    'is_weekend'
] + [c for c in df_encoded.columns if c.startswith('day_of_week_') or c.startswith('meal_type_')]

X = df_encoded[feature_cols]
y = df_encoded['actual_headcount_served']

# 3. Train/Test Split
X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.2, random_state=42)

# 4. Train Model
model = RandomForestRegressor(
    n_estimators=150,
    max_depth=9,
    min_samples_split=4,
    random_state=42
)
model.fit(X_train, y_train)

# 5. Evaluate Performance
y_pred = model.predict(X_test)
mae = mean_absolute_error(y_test, y_pred)
rmse = np.sqrt(mean_squared_error(y_test, y_pred))
r2 = r2_score(y_test, y_pred)

print(f"\nModel Performance Metrics:")
print(f"MAE  : {mae:.2f} diners")
print(f"RMSE : {rmse:.2f} diners")
print(f"R²   : {r2:.4f}")

# 6. Feature Importance
importances = pd.Series(model.feature_importances_, index=feature_cols).sort_values(ascending=False)
print("\nTop 5 Predictive Features:")
print(importances.head(5))

# 7. Adaptive Buffer Function
def get_cooking_recommendation(pred_count, dish_popularity, is_exam, yesterday_waste):
    buffer = 0.06
    if dish_popularity >= 8.5:
        buffer += 0.04
    if is_exam:
        buffer -= 0.02
    if yesterday_waste > 8.0:
        buffer -= 0.03
    buffer = max(0.03, min(0.12, buffer))
    recommended_target = int(np.ceil(pred_count * (1 + buffer)))
    return recommended_target, round(buffer * 100, 1)

# Sample Test Prediction
sample = X_test.iloc[[0]]
pred_val = model.predict(sample)[0]
rec_target, buf_pct = get_cooking_recommendation(
    pred_val,
    dish_popularity=sample['dish_popularity_score'].values[0],
    is_exam=sample['is_exam_period'].values[0],
    yesterday_waste=sample['yesterday_waste_kg'].values[0]
)
print(f"\nSample Prediction Test:")
print(f"Predicted Turnout: {round(pred_val)} diners")
print(f"Adaptive Safety Buffer: +{buf_pct}%")
print(f"Final Kitchen Cooking Recommendation: {rec_target} portions")

# 8. Export Model Artifact
joblib.dump(model, 'nourish_turnout_model.pkl')
joblib.dump(feature_cols, 'nourish_features.pkl')
print("\nArtifacts saved: nourish_turnout_model.pkl, nourish_features.pkl")
```

---

## 7. Module 6: NOURISH Real-Time Production Integration (NOURISH-Oracle)

### Endpoint: `GET /nourish/predict/turnout`
```python
@router.get("/predict/turnout", summary="AI-predicted diner turnout & cooking target")
async def predict_meal_turnout(
    meal_type: str = Query(..., description="'breakfast' | 'lunch' | 'dinner'"),
    target_date: Optional[str] = Query(None, description="YYYY-MM-DD (defaults to today IST)"),
    _auth: dict = Depends(require_role("warden", "mess_staff")),
):
    """
    Combines academic calendar flags, active student outpasses, dish popularity,
    and recent food wastage to output the AI predicted headcount and kitchen cooking target.
    """
    return get_ai_meal_prediction(meal_type=meal_type, target_date=target_date)
```

### JSON Response Structure
```json
{
  "success": true,
  "meal_type": "lunch",
  "date": "2026-11-04",
  "predicted_turnout": 118,
  "adaptive_buffer_pct": 8.0,
  "recommended_cooking_target": 127,
  "context": {
    "total_hostel_capacity": 150,
    "active_approved_outpasses": 22,
    "effective_campus_residents": 128,
    "scheduled_dish": "Rajma Chawal",
    "dish_popularity_score": 8.5,
    "is_exam_period": false,
    "is_vacation": false,
    "yesterday_waste_kg": 4.2
  },
  "explanation": "Predicted 118 diners based on high Rajma Chawal popularity (+12) and 22 off-campus outpasses. +8% adaptive buffer added for kitchen prep target: 127 portions."
}
```

### Integration with the Kitchen Issue Panel
When the mess manager opens the **"Issue Meal Stock"** modal on `MessDashboard.jsx`:
1. The modal calls `GET /nourish/predict/turnout`.
2. Instead of a hardcoded 150, the diner headcount automatically populates with **`127 (AI Recommended)`**.
3. All raw ingredients (Rice, Rajma, Cooking Oil) auto-calculate for 127 portions.
4. Staff can adjust any quantity or proceed with 1-click issue!

---

## 8. Phased Implementation Roadmap & Verification Checklist

| Phase | Milestone / Component | Key Deliverables | Verification Test |
|---|---|---|---|
| **Phase 9A** | Database Schemas | Create `academic_calendar` & `student_outpasses` in Supabase | Table exists in Supabase dashboard with indexes |
| **Phase 9B** | Warden Calendar Portal | UI form on Warden Portal to add/edit Exam & Vacation periods | Warden adds "Midterm Exams" $\rightarrow$ saves to DB |
| **Phase 10A** | Student Outpass Application | Form on Student Portal with parent contact and pass types | Student submits outpass $\rightarrow$ visible in Warden inbox |
| **Phase 10B** | Warden Outpass Approvals Hub | Warden review UI with "Call Parent" link and 1-click Approve | Warden approves pass $\rightarrow$ status becomes `approved` |
| **Phase 10C** | SENTINEL Curfew Immunity | Scheduler skips students on approved leave at 22:00 IST | Outpass student marked `on_leave`, NOT `defaulter` |
| **Phase 10D** | HERALD Anomaly Filter | Suppress missed-meal alerts for students on leave | No welfare tickets raised for off-campus students |
| **Phase 11A** | Synthetic Dataset Ingestion | Generate 270-row CSV via Master Prompt; save to `backend/data/` | CSV verified with correct column formats |
| **Phase 11B** | Model Training in Colab | Train Random Forest in Google Colab; export `.pkl` weights | Model evaluated with $R^2 > 0.85$, MAE $< 6$ diners |
| **Phase 11C** | NOURISH Inference API | Mount `GET /nourish/predict/turnout` in FastAPI router | API returns predicted turnout + adaptive target |
| **Phase 11D** | Dashboard Pre-fill Integration | Auto-feed predicted target into Kitchen Stock Issue Panel | Issue Panel defaults to AI predicted target |

---
*End of Blueprint. Follow these phases sequentially during development.*

