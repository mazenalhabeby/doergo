import type { PrismaService } from '@hbcfield/shared';
import {
  addDaysStr,
  notEndedWhere,
  rotaInForceOn,
  SHIFT_REMINDER_DEFAULTS,
  SCHEDULE_FLAG_DEFAULT_TOLERANCE_MIN,
  rotaRunsOn,
  chooseShiftInstance,
} from '@hbcfield/shared';
import { ResolvedShift, instanceStartDay, shiftWindowOn, endedBefore, LocalDate } from './shift-resolver-helpers';

/*
 * Finding the shift that applies: from a rota assignment (and whether its repeat
 * matches the day), or from the old weekly schedule. Each asks the database it is
 * handed once.
 */

export async function shiftFromRota(
  prisma: PrismaService,
  userId: string,
  spaceId: string,
  clockInAt: Date,
  tz: string,
  local: LocalDate,
  firstMatch = false,
): Promise<ResolvedShift | null> {
  /*
    ⚠️ The window is a range of LOCAL DAYS (effectiveFrom/To are stored as midnight UTC of the
    first/last day), never compared with the clock-in instant: 08:00 Vienna on the rota's last
    day is 07:00Z, after its effectiveTo of 00:00Z, and found no shift. The query reaches back to
    yesterday (a night's tail) and `rotaInForceOn` decides on the instance's own start day.
  */
  const day = (d: string) => new Date(`${d}T00:00:00.000Z`);
  const assignments = await prisma.shiftAssignment.findMany({
    where: {
      userId,
      spaceId,
      isActive: true,
      effectiveFrom: { lt: day(addDaysStr(local.dateStr, 1)) },
      ...notEndedWhere(day(addDaysStr(local.dateStr, -1))),
    },
    include: { shift: true },
    // Highest priority wins overlaps; then the most recently-effective rota.
    orderBy: [{ priority: 'desc' }, { effectiveFrom: 'desc' }],
  });

  // Every instance this clock-in could belong to, in priority order; the shared rule picks one.
  const candidates: ResolvedShift[] = [];
  for (const a of assignments) {
    if (!a.shift?.isActive) continue;
    const shift = a.shift;
    const toleranceMin = shift.flagToleranceMin ?? SCHEDULE_FLAG_DEFAULT_TOLERANCE_MIN;
    /*
      ⚠️ The recurrence is asked of the day the instance STARTED. The 01:00
      tail of a 22:00–06:00 night belongs to yesterday's instance, so a Friday
      night on a Mon–Fri rota keeps its Saturday-morning tail, and a Monday
      01:00 clock-in is not bound to a "Sunday 22:00" start nobody rostered.
    */
    const startDay = instanceStartDay(shift, local);
    // ⚠️ ONE RULE — `rotaRunsOn` in shared, the answer the Schedules page draws too.
    if (!rotaInForceOn(a, startDay) || !rotaRunsOn(a, startDay)) continue;
    const window = shiftWindowOn(shift, tz, startDay);
    /*
      ⚠️ A clock-in after that instance has ENDED (past its tolerance) is not
      for it. Binding it anyway counted ≈ 0, flagged it late and fired the
      "you should have left" reminder the moment the member arrived.
    */
    if (endedBefore(window.expectedClockOutAt, clockInAt, toleranceMin)) continue;

    const graceMin = shift.graceMin ?? SHIFT_REMINDER_DEFAULTS.GRACE_MINUTES;
    candidates.push({
      shiftId: shift.id,
      shiftName: shift.name ?? null,
      expectedClockInAt: window.expectedClockInAt,
      expectedClockOutAt: window.expectedClockOutAt,
      nextRemindAt: new Date(window.expectedClockOutAt.getTime() + graceMin * 60_000),
      graceMin,
      reminderIntervalMin: shift.reminderIntervalMin ?? SHIFT_REMINDER_DEFAULTS.REMINDER_INTERVAL_MINUTES,
      maxReminders: shift.maxReminders ?? SHIFT_REMINDER_DEFAULTS.MAX_REMINDERS,
      flagToleranceMin: toleranceMin,
      source: 'assignment',
    });
  }
  /*
    ⚠️ The first candidate used to win. Back at 12:05 for a 13:00 afternoon
    shift was then bound to the 08:00 morning one (“late 4 h 05 min”), and
    06:05 for a 07:00 day shift to last night's. chooseShiftInstance prefers
    the instance the clock-in falls in, then the next to start. One rota row
    gives one candidate, so a single shift resolves exactly as before.
  */
  // An OLD entry (no label rules) re-matched keeps the old rule: the first candidate.
  if (firstMatch || candidates.length <= 1) return candidates[0] ?? null;
  return chooseShiftInstance(
    candidates.map((c) => ({ ...c, toleranceMin: c.flagToleranceMin })),
    clockInAt,
  );
}

export async function shiftFromLegacySchedule(
  prisma: PrismaService,
  userId: string,
  clockInAt: Date,
  tz: string,
  local: LocalDate,
): Promise<ResolvedShift | null> {
  const schedule = await prisma.technicianSchedule.findFirst({
    where: { technicianId: userId, dayOfWeek: local.dow, isActive: true },
  });
  if (!schedule?.endTime) return null;

  // Legacy schedules never cross midnight → start & end are on the clock-in's local day.
  const { expectedClockInAt, expectedClockOutAt } = shiftWindowOn(
    { startLocal: schedule.startTime, endLocal: schedule.endTime, crossesMidnight: false },
    tz,
    local.dateStr,
  );
  // The same rule as a rota shift: today's hours already over are not this clock-in's.
  if (endedBefore(expectedClockOutAt, clockInAt, SCHEDULE_FLAG_DEFAULT_TOLERANCE_MIN)) return null;
  const graceMin = SHIFT_REMINDER_DEFAULTS.GRACE_MINUTES;

  return {
    shiftId: null,
    expectedClockInAt,
    expectedClockOutAt,
    nextRemindAt: new Date(expectedClockOutAt.getTime() + graceMin * 60_000),
    graceMin,
    reminderIntervalMin: SHIFT_REMINDER_DEFAULTS.REMINDER_INTERVAL_MINUTES,
    maxReminders: SHIFT_REMINDER_DEFAULTS.MAX_REMINDERS,
    flagToleranceMin: SCHEDULE_FLAG_DEFAULT_TOLERANCE_MIN, // legacy schedules use the default
    source: 'schedule',
  };
}

/** Does this rota assignment run on that local date, and if so its UTC window (no clock-in involved). */
export function rotaWindowOnDate(
  assignment: {
    recurrence: string;
    daysOfWeek: number[];
    daysOfMonth: number[];
    dates: Date[];
    shift: { startLocal: string; endLocal: string; crossesMidnight: boolean };
  },
  tz: string,
  dateStr: string, // YYYY-MM-DD in tz
): { expectedClockInAt: Date; expectedClockOutAt: Date } | null {
  if (!rotaRunsOn(assignment, dateStr)) return null;

  return shiftWindowOn(assignment.shift, tz, dateStr);
}
