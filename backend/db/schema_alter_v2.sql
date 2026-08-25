-- ============================================================
-- Schema Migration v2 — IRIS Phase 1
-- Run this in Supabase SQL Editor AFTER schema.sql
-- ============================================================

-- 1. Change face_embedding from VECTOR(128) → VECTOR(512)
--    (InsightFace buffalo_s / MobileFaceNet produces 512-d embeddings)
ALTER TABLE students
    ALTER COLUMN face_embedding TYPE VECTOR(512);

-- Drop the old 128-d IVFFlat index and recreate for 512-d
DROP INDEX IF EXISTS students_embedding_idx;
CREATE INDEX students_embedding_idx
    ON students USING ivfflat (face_embedding vector_cosine_ops)
    WITH (lists = 10);

-- 2. match_face — RPC called by IRIS recognition engine
--    Returns the closest matching student above the similarity threshold.
--    Uses cosine DISTANCE (<=>) — lower distance = more similar.
--    match_threshold is the max allowed distance (e.g. 0.45 means similarity >= 0.55)

CREATE OR REPLACE FUNCTION match_face(
    query_embedding  VECTOR(512),
    match_threshold  FLOAT   DEFAULT 0.45,   -- cosine distance threshold
    match_count      INT     DEFAULT 1
)
RETURNS TABLE (
    student_id  UUID,
    name        TEXT,
    roll_no     TEXT,
    room_no     TEXT,
    distance    FLOAT
)
LANGUAGE SQL STABLE
AS $$
    SELECT
        s.id         AS student_id,
        s.name,
        s.roll_no,
        s.room_no,
        (s.face_embedding <=> query_embedding)::FLOAT AS distance
    FROM students s
    WHERE s.face_embedding IS NOT NULL
      AND (s.face_embedding <=> query_embedding) < match_threshold
    ORDER BY distance ASC
    LIMIT match_count;
$$;
