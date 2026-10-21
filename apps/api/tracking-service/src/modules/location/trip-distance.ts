import type { PrismaService } from '@hbcfield/shared';

/**
 * The ONLY writers of `task_routes` — tracking-service owns a job's trip distance
 * (docs/data-ownership.md, decision 2). Readers use `tripDistanceOf` / `TRIP_DISTANCE_SQL` from shared.
 */

/**
 * Add metres to the trip that started at `legStartedAt`. One statement, so concurrent pings cannot lose
 * an increment; a row from an EARLIER trip (the job went En route again) is restarted from these metres.
 * Returns a query to put in the caller's `$transaction([...])` next to the points it counts.
 * ⚠️ The start is pinned to UTC, as Prisma stores every DateTime: a raw parameter would otherwise be
 * converted in the SESSION's zone, and a shifted `legStartedAt` never matches the job's start again.
 */
export function addTripMeters(prisma: PrismaService, taskId: string, legStartedAt: Date | null, metres: number) {
  return prisma.$executeRaw`
    INSERT INTO "task_routes" ("taskId", "legStartedAt", "distanceMeters", "updatedAt")
    VALUES (${taskId}, (${legStartedAt}::timestamptz AT TIME ZONE 'UTC'), ${metres}, NOW())
    ON CONFLICT ("taskId") DO UPDATE SET
      "distanceMeters" = CASE
        WHEN "task_routes"."legStartedAt" IS NOT DISTINCT FROM EXCLUDED."legStartedAt"
          THEN "task_routes"."distanceMeters" + EXCLUDED."distanceMeters"
        ELSE EXCLUDED."distanceMeters"
      END,
      "legStartedAt" = EXCLUDED."legStartedAt",
      "updatedAt" = NOW()`;
}

/** The trip's distance recomputed from all its points (late points land between counted ones). */
export function setTripMeters(prisma: PrismaService, taskId: string, legStartedAt: Date | null, metres: number) {
  return prisma.taskRoute.upsert({
    where: { taskId },
    create: { taskId, legStartedAt, distanceMeters: metres },
    update: { legStartedAt, distanceMeters: metres },
  });
}
