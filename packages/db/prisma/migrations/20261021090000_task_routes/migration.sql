-- A job's trip distance gets its own table, written only by tracking-service
-- (docs/data-ownership.md, decision 2). Additive: tasks."routeDistance" is kept,
-- no longer written, and dropped by a later checked migration. Safe to re-run.
CREATE TABLE IF NOT EXISTS "task_routes" (
    "taskId" TEXT NOT NULL,
    "legStartedAt" TIMESTAMP(3),
    "distanceMeters" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "task_routes_pkey" PRIMARY KEY ("taskId")
);

DO $$ BEGIN
    ALTER TABLE "task_routes" ADD CONSTRAINT "task_routes_taskId_fkey"
        FOREIGN KEY ("taskId") REFERENCES "tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Every distance recorded so far, against the trip it was counted on.
INSERT INTO "task_routes" ("taskId", "legStartedAt", "distanceMeters", "updatedAt")
SELECT "id", "routeStartedAt", "routeDistance", CURRENT_TIMESTAMP
FROM "tasks"
WHERE "routeDistance" IS NOT NULL
ON CONFLICT ("taskId") DO NOTHING;
