import { Prisma } from '@prisma/client';
import {
  AUTO_CLOCK_DEFAULTS,
  AUTO_CLOCK_LIMITS,
  NO_SHIFT_LIMIT,
  OPEN_SHIFT_CLOSE,
  TimeEntryStatus,
  type PrismaService,
} from '@hbcfield/shared';

/**
 * The automatic close's candidates, ELIGIBLE IN THE QUERY.
 *
 * ⚠️ Starvation: the sweeps used to take BATCH × 5 open shifts past the
 * shortest threshold and filter "is this member automatic here, is it really
 * due" afterwards. Enough rows that are never due at the head of that order (a
 * member not chosen, a workspace switched off, somebody still on site) and the
 * real ones behind them were never reached, tick after tick. So every rule a
 * row can be refused on is asked HERE; the service still re-checks each row
 * through the shared rules (`settingsForEntries`, `presenceCloseDue`), which
 * stay the authority — the SQL only has to be no narrower than they are.
 */

/** The row the sweeps need to ask the shared rules. */
export interface AutoCloseCandidate {
  id: string;
  userId: string;
  locationId: string;
  clockInAt: Date;
  expectedClockInAt: Date | null;
  expectedClockOutAt: Date | null;
}

const [CLOSE_MIN, CLOSE_MAX] = AUTO_CLOCK_LIMITS.closeAfterMinutes;

/**
 * The workspace's `closeAfterMinutes` as `parseAutoClockSettings` reads it: an
 * integer in range, else the default. Nested CASE so the cast only ever sees a
 * JSON number.
 */
const CLOSE_AFTER = Prisma.sql`(CASE WHEN jsonb_typeof(l."autoClock"->'closeAfterMinutes') = 'number' THEN
    (CASE WHEN (l."autoClock"->>'closeAfterMinutes')::numeric BETWEEN ${CLOSE_MIN} AND ${CLOSE_MAX}
      AND (l."autoClock"->>'closeAfterMinutes')::numeric = trunc((l."autoClock"->>'closeAfterMinutes')::numeric)
      THEN (l."autoClock"->>'closeAfterMinutes')::int ELSE ${AUTO_CLOCK_DEFAULTS.closeAfterMinutes}::int END)
  ELSE ${AUTO_CLOCK_DEFAULTS.closeAfterMinutes}::int END)`;

/** The member's own hours there, else the workspace's (`effectiveClockRules`), clamped like `clampDailyMinutes`. */
const DAILY_MINUTES = Prisma.sql`LEAST(${NO_SHIFT_LIMIT.MAX_MINUTES}::int, GREATEST(${NO_SHIFT_LIMIT.MIN_MINUTES}::int,
  COALESCE(a."workDailyMinutes", l."noShiftDailyMinutes", ${NO_SHIFT_LIMIT.DEFAULT_MINUTES}::int)))`;

/**
 * ON for this entry (`autoClockActive`): the workspace on and not the Remote
 * bucket, the member chosen there by an assignment covering the clock-in, their
 * consent, not external. One assignment row (LATERAL), as `settingsForEntries`.
 */
const AUTOMATIC = Prisma.sql`
  FROM "time_entries" te
  JOIN "company_locations" l ON l."id" = te."locationId"
  JOIN "users" u ON u."id" = te."userId"
  JOIN LATERAL (
    SELECT sa."workDailyMinutes", sa."autoClockMode" FROM "space_assignments" sa
    WHERE sa."userId" = te."userId" AND sa."spaceId" = te."locationId" AND sa."autoClock" = true
      AND sa."effectiveFrom" <= te."clockInAt" AND (sa."effectiveTo" IS NULL OR sa."effectiveTo" >= te."clockInAt")
    ORDER BY sa."createdAt" ASC LIMIT 1
  ) a ON true
  WHERE te."status" = ${TimeEntryStatus.CLOCKED_IN}::"TimeEntryStatus"
    AND l."isRemote" = false AND l."autoClock" IS NOT NULL AND (l."autoClock"->>'enabled') = 'true'
    AND u."autoClockConsentAt" IS NOT NULL AND u."isExternal" = false`;

const COLUMNS = Prisma.sql`SELECT te."id", te."userId", te."locationId", te."clockInAt", te."expectedClockInAt", te."expectedClockOutAt"`;

/**
 * By the shift: `closeAfterMinutes` past the planned end, the end not a
 * daily-hours marker (B5), and not somebody the phone still reports ON SITE
 * within that time (`seenOnSiteRecently` — left to the abandoned-shift close).
 */
export function autoShiftsPastEnd(prisma: Pick<PrismaService, '$queryRaw'>, now: Date): Promise<AutoCloseCandidate[]> {
  return prisma.$queryRaw<AutoCloseCandidate[]>`${COLUMNS} ${AUTOMATIC}
    AND te."endIsDailyLimit" = false AND te."expectedClockOutAt" IS NOT NULL
    AND te."expectedClockOutAt" + make_interval(mins => ${CLOSE_AFTER}) <= ${now}
    AND NOT (te."presence" = 'ON_SITE' AND te."lastSeenAt" IS NOT NULL
      AND te."lastSeenAt" > ${now}::timestamp - make_interval(mins => ${CLOSE_AFTER}))
    ORDER BY te."expectedClockOutAt" ASC
    LIMIT ${OPEN_SHIFT_CLOSE.BATCH}`;
}

/**
 * By arriving and leaving with no shift — free (no planned end) OR up to a
 * number of hours a day (LIMIT: the end is only the marker) — past clock-in +
 * their hours + `closeAfterMinutes`. Whether they are GONE is the shared
 * `presenceCloseDue`, asked of each row.
 */
export function presencePastHours(prisma: Pick<PrismaService, '$queryRaw'>, now: Date): Promise<AutoCloseCandidate[]> {
  return prisma.$queryRaw<AutoCloseCandidate[]>`${COLUMNS} ${AUTOMATIC}
    AND a."autoClockMode" = 'PRESENCE' AND te."expectedClockInAt" IS NULL
    AND (te."expectedClockOutAt" IS NULL OR te."endIsDailyLimit" = true)
    AND te."clockInAt" + make_interval(mins => ${DAILY_MINUTES} + ${CLOSE_AFTER}) <= ${now}
    ORDER BY te."clockInAt" ASC
    LIMIT ${OPEN_SHIFT_CLOSE.BATCH}`;
}
