import { SHIFT_REMINDER_DEFAULTS, TimeEntryStatus, clampDailyMinutes } from '@hbcfield/shared';
import type { PrismaService } from '@hbcfield/shared';

/**
 * A workspace's hours without a shift changed: the sessions RUNNING there follow
 * at once, not just tomorrow's. Two bulk updates, whatever the head-count.
 *
 *  • Allowed freely (no planned end): the first "forgot to clock out?" moves to
 *    clock-in + the new hours — only where nobody was asked yet. The automatic
 *    clock's leader notice and close read the hours live, so they need nothing.
 *  • Up to a number of hours a day (LIMIT): the session's end was the limit, so
 *    it moves by the change (never before clock-in) — counted time, the
 *    reminder and the overtime question follow it as they follow any end.
 *
 * A session that already ended keeps what it counted: closed rows are never
 * touched.
 */
export async function rearmNoShiftSessions(
  prisma: Pick<PrismaService, '$executeRaw'>,
  input: { spaceId: string; organizationId: string; fromMinutes: number | null | undefined; toMinutes: number | null | undefined },
): Promise<{ reminders: number; limits: number }> {
  const from = clampDailyMinutes(input.fromMinutes);
  const to = clampDailyMinutes(input.toMinutes);
  if (from === to) return { reminders: 0, limits: 0 };
  const open = TimeEntryStatus.CLOCKED_IN;
  const reminders = await prisma.$executeRaw`
    UPDATE "time_entries" SET "nextRemindAt" = "clockInAt" + make_interval(mins => ${to}::int), "updatedAt" = now()
    WHERE "locationId" = ${input.spaceId} AND "organizationId" = ${input.organizationId}
      AND "status" = ${open}::"TimeEntryStatus" AND "expectedClockOutAt" IS NULL
      AND "reminderCount" = 0 AND "nextRemindAt" IS NOT NULL`;
  const delta = to - from;
  const grace = SHIFT_REMINDER_DEFAULTS.GRACE_MINUTES;
  const limits = await prisma.$executeRaw`
    UPDATE "time_entries"
    SET "expectedClockOutAt" = GREATEST("clockInAt", "expectedClockOutAt" + make_interval(mins => ${delta}::int)),
        "nextRemindAt" = CASE WHEN "reminderCount" = 0
          THEN GREATEST("clockInAt", "expectedClockOutAt" + make_interval(mins => ${delta}::int)) + make_interval(mins => ${grace}::int)
          ELSE "nextRemindAt" END,
        "updatedAt" = now()
    WHERE "locationId" = ${input.spaceId} AND "organizationId" = ${input.organizationId}
      AND "status" = ${open}::"TimeEntryStatus" AND "endIsDailyLimit" = true`;
  return { reminders, limits };
}

