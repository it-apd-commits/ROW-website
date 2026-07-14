-- Adds per-bus and per-donor scheduling to monthly_schedules.
-- Run this in the Supabase SQL editor BEFORE deploying the app changes.

-- 1. New columns
ALTER TABLE public.monthly_schedules
    ADD COLUMN IF NOT EXISTS bus_number TEXT,
    ADD COLUMN IF NOT EXISTS donor TEXT;

-- 2. Backfill: all existing schedules belong to BUS ABB
UPDATE public.monthly_schedules
SET bus_number = 'BUS ABB'
WHERE bus_number IS NULL;

-- 3. Index for the calendar's month + bus lookups
CREATE INDEX IF NOT EXISTS idx_monthly_schedules_month_year_bus
    ON public.monthly_schedules (year, month, bus_number)
    WHERE is_active = true;
