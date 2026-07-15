-- Manual availability override (hybrid presence). null = auto from task/clock.
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "presence" TEXT;
