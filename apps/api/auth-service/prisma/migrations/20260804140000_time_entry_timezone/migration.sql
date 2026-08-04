-- Per-entry IANA timezone (derived from clock-in GPS; space timezone fallback).
-- The zone the entry's times are displayed in — correct for remote clock-ins.
-- Additive + idempotent.
ALTER TABLE "time_entries" ADD COLUMN IF NOT EXISTS "timezone" TEXT;
