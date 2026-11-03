-- =============================================================================
-- Migration: schema_alter_v3_wastage.sql
-- Description: Post-Meal Food Wastage Tracking Table
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.meal_wastage (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    meal_type TEXT NOT NULL CHECK (meal_type IN ('breakfast', 'lunch', 'dinner')),
    date DATE NOT NULL DEFAULT CURRENT_DATE,
    head_count_served INTEGER DEFAULT 0,
    waste_kg NUMERIC(8, 2) NOT NULL DEFAULT 0.0,
    waste_per_student_grams NUMERIC(8, 2) DEFAULT 0.0,
    leftover_dishes TEXT,
    reason TEXT,
    notes TEXT,
    logged_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for fast date lookups
CREATE INDEX IF NOT EXISTS idx_meal_wastage_date ON public.meal_wastage(date DESC);

-- Enable Row Level Security (matches other tables; backend uses service-role key)
ALTER TABLE public.meal_wastage ENABLE ROW LEVEL SECURITY;

-- Allow authenticated users to view wastage logs
CREATE POLICY "Allow authenticated read on meal_wastage"
    ON public.meal_wastage FOR SELECT
    TO authenticated
    USING (true);

-- Allow authenticated users with warden or mess_staff role to insert/update
CREATE POLICY "Allow mess staff and warden write on meal_wastage"
    ON public.meal_wastage FOR ALL
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.users
            WHERE id = auth.uid() AND role IN ('warden', 'mess_staff')
        )
    );
