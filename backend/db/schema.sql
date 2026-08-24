-- ============================================================
-- Hostel Management Multi-Agent System — Full Database Schema
-- Run this in Supabase SQL Editor (Dashboard → SQL Editor → New query)
-- ============================================================

-- Enable pgvector extension (required for face embeddings)
CREATE EXTENSION IF NOT EXISTS vector;

-- ─────────────────────────────────────────────────────────────
-- USERS & AUTH
-- ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS users (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email       TEXT UNIQUE NOT NULL,
    role        TEXT NOT NULL CHECK (role IN ('student', 'mess_staff', 'warden')),
    created_at  TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS students (
    id              UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    roll_no         TEXT UNIQUE NOT NULL,
    name            TEXT NOT NULL,
    room_no         TEXT NOT NULL,
    photo_url       TEXT,
    face_embedding  VECTOR(128),    -- MobileFaceNet 128-d embedding
    enrolled_at     TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Index for fast vector similarity search (IRIS recognition)
CREATE INDEX IF NOT EXISTS students_embedding_idx
    ON students USING ivfflat (face_embedding vector_cosine_ops)
    WITH (lists = 10);

-- ─────────────────────────────────────────────────────────────
-- ATTENDANCE (SENTINEL)
-- ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS attendance_logs (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    student_id  UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
    timestamp   TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    status      TEXT NOT NULL CHECK (status IN ('present', 'late')),
    method      TEXT NOT NULL DEFAULT 'face'
);

-- Prevent duplicate attendance entries for the same student on the same day
CREATE UNIQUE INDEX IF NOT EXISTS attendance_logs_student_day_uniq
    ON attendance_logs (student_id, DATE(timestamp AT TIME ZONE 'Asia/Kolkata'));

CREATE TABLE IF NOT EXISTS attendance_window (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    start_time   TIME NOT NULL,
    end_time     TIME NOT NULL,
    active_days  TEXT[] NOT NULL DEFAULT ARRAY['Mon','Tue','Wed','Thu','Fri','Sat']
);

-- Seed a default attendance window (07:00 – 09:00, Mon-Sat)
INSERT INTO attendance_window (start_time, end_time, active_days)
VALUES ('07:00', '09:00', ARRAY['Mon','Tue','Wed','Thu','Fri','Sat'])
ON CONFLICT DO NOTHING;

-- ─────────────────────────────────────────────────────────────
-- MESS (NOURISH)
-- ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS mess_entries (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    student_id        UUID REFERENCES students(id) ON DELETE SET NULL,   -- NULL if unknown
    is_recognized     BOOLEAN NOT NULL,
    meal_type         TEXT NOT NULL CHECK (meal_type IN ('breakfast', 'lunch', 'dinner')),
    timestamp         TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    flagged_image_url TEXT    -- populated only for unrecognised attempts
);

-- Prevent a recognised student from eating the same meal twice
CREATE UNIQUE INDEX IF NOT EXISTS mess_entries_student_meal_day_uniq
    ON mess_entries (student_id, meal_type, DATE(timestamp AT TIME ZONE 'Asia/Kolkata'))
    WHERE student_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS mess_menu (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    meal_type       TEXT NOT NULL CHECK (meal_type IN ('breakfast', 'lunch', 'dinner')),
    dish_name       TEXT NOT NULL,
    ingredients     JSONB NOT NULL,   -- [{name: 'rice', qty_per_student_grams: 150}, ...]
    effective_date  DATE NOT NULL DEFAULT CURRENT_DATE
);

CREATE TABLE IF NOT EXISTS inventory (
    id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    item_name            TEXT UNIQUE NOT NULL,
    quantity_available   NUMERIC NOT NULL DEFAULT 0,
    unit                 TEXT NOT NULL,
    last_updated         TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_by           UUID REFERENCES users(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS inventory_alerts (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    item_name   TEXT NOT NULL,
    message     TEXT NOT NULL,
    urgency     TEXT NOT NULL CHECK (urgency IN ('low', 'medium', 'high', 'critical')),
    created_at  TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    resolved    BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE TABLE IF NOT EXISTS inventory_nlp_logs (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    raw_command    TEXT NOT NULL,
    parsed_action  JSONB NOT NULL,   -- {"item": str, "action": str, "qty": float, "unit": str}
    staff_id       UUID REFERENCES users(id) ON DELETE SET NULL,
    timestamp      TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ─────────────────────────────────────────────────────────────
-- MAINTENANCE (FIXR)
-- ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS complaints (
    id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    student_id            UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
    raw_text              TEXT NOT NULL,
    category              TEXT NOT NULL CHECK (category IN ('electrical', 'plumbing', 'carpentry', 'other')),
    urgency               TEXT NOT NULL CHECK (urgency IN ('low', 'medium', 'high', 'critical')),
    status                TEXT NOT NULL CHECK (status IN ('open', 'assigned', 'resolved')) DEFAULT 'open',
    created_at            TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    assigned_worker_note  TEXT
);

-- ─────────────────────────────────────────────────────────────
-- ORCHESTRATOR / ANOMALIES (HERALD)
-- ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS anomaly_flags (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    student_id       UUID REFERENCES students(id) ON DELETE CASCADE,
    type             TEXT NOT NULL CHECK (type IN ('attendance_missed', 'mess_missed_streak', 'unresolved_complaint')),
    detail           TEXT NOT NULL,
    created_at       TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    seen_by_warden   BOOLEAN NOT NULL DEFAULT FALSE
);

-- Prevent the same flag type being raised twice for the same student on the same day
CREATE UNIQUE INDEX IF NOT EXISTS anomaly_flags_student_type_day_uniq
    ON anomaly_flags (student_id, type, DATE(created_at AT TIME ZONE 'Asia/Kolkata'));

-- ─────────────────────────────────────────────────────────────
-- ROW LEVEL SECURITY (basic — to be tightened in Phase 6)
-- ─────────────────────────────────────────────────────────────
-- Enable RLS on all tables (policies will be added in Phase 6 when
-- Supabase Auth is fully wired). For now, backend uses service-role
-- key which bypasses RLS entirely, so this is safe during development.

ALTER TABLE users            ENABLE ROW LEVEL SECURITY;
ALTER TABLE students         ENABLE ROW LEVEL SECURITY;
ALTER TABLE attendance_logs  ENABLE ROW LEVEL SECURITY;
ALTER TABLE attendance_window ENABLE ROW LEVEL SECURITY;
ALTER TABLE mess_entries     ENABLE ROW LEVEL SECURITY;
ALTER TABLE mess_menu        ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory        ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory_alerts ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory_nlp_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE complaints       ENABLE ROW LEVEL SECURITY;
ALTER TABLE anomaly_flags    ENABLE ROW LEVEL SECURITY;
