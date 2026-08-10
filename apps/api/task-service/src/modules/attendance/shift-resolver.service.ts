import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { WorkModel, SHIFT_REMINDER_DEFAULTS } from '@hbcfield/shared';

/**
 * Space (CompanyLocation) fields the resolver needs.
 */
export interface ResolverSpace {
  id: string;
  timezone: string;
  workModel: WorkModel | string;
  // Coordinates decide physical vs logical. A PHYSICAL space (has a pin) anchors
  // its shifts to the SITE's timezone (one clock for everyone on site). A LOGICAL
  // space (no pin) has no inherent timezone, so its shifts are anchored to each
  // worker's own clock-in timezone (18:00–06:00 = their local evening→morning).
  lat?: number | null;
  lng?: number | null;
}

/**
 * The shift expectation stamped onto a TimeEntry at clock-in. All timestamps are
 * absolute UTC instants — computed ONCE here so the reminder engine never has to
 * redo timezone math. `expectedClockOutAt` is midnight/DST-safe (a 22:00→06:00
 * night shift resolves to *tomorrow* 06:00 as a real instant).
 */
export interface ResolvedShift {
  shiftId: string | null; // null when resolved from a legacy weekly schedule
  expectedClockInAt: Date; // when the shift is expected to START (for late/no-show)
  expectedClockOutAt: Date; // when the shift is expected to end
  nextRemindAt: Date; // expectedClockOutAt + grace → first reminder is due here
  graceMin: number;
  reminderIntervalMin: number;
  maxReminders: number;
  source: 'assignment' | 'schedule';
}

/**
 * Resolves which shift a clock-in belongs to and the exact instant it is
 * expected to end. This is the heart of the space-centric attendance model:
 * the system stops *guessing* (midnight / 16h) and instead knows the concrete
 * shift window for each clock-in.
 *
 * Resolution order (only for spaces with a work model that expects hours):
 *   1. Active ShiftAssignment (rota) matching the clock-in's local day
 *   2. Legacy TechnicianSchedule (FIXED weekly schedule) for that weekday
 *   3. null (no expectation → no reminders; e.g. TASK/NONE spaces)
 */
@Injectable()
export class ShiftResolverService {
  private readonly logger = new Logger(ShiftResolverService.name);

  constructor(private readonly prisma: PrismaService) {}

  async resolveForClockIn(params: {
    userId: string;
    space: ResolverSpace;
    clockInAt: Date;
    /** The worker's own timezone (from their clock-in GPS). Used ONLY for logical
     *  (pin-less) spaces, where shifts are anchored to the worker, not a site. */
    clockInTz?: string;
  }): Promise<ResolvedShift | null> {
    const { userId, space, clockInAt } = params;
    const workModel = (space.workModel ?? WorkModel.NONE) as WorkModel;

    // Attendance is per-member: when the space tracks attendance (anything but
    // NONE), resolve each member individually — a member WITH a shift/rota (or
    // legacy schedule) gets an expected end + reminders; a member WITHOUT one
    // resolves to null and is task-based (free clock-out, no reminders). So
    // scheduled and task-based workers coexist in the same space. NONE opts the
    // whole space out (free clock in/out, no expectations).
    if (workModel === WorkModel.NONE) {
      return null;
    }

    // Physical space (has coordinates) → the SITE's timezone anchors the shift for
    // everyone. Logical space (no pin) → anchor to the WORKER's clock-in timezone
    // so "18:00–06:00" means their local evening→morning wherever they are. Falls
    // back to the space tz then UTC when the worker tz is unavailable.
    const spaceIsPhysical = space.lat != null && space.lng != null;
    const tz = spaceIsPhysical
      ? space.timezone || 'UTC'
      : params.clockInTz || space.timezone || 'UTC';
    const local = this.getLocal(clockInAt, tz);

    // ── 1. Rota assignment ──────────────────────────────────────────────
    const assignment = await this.resolveAssignment(userId, space.id, clockInAt, tz, local);
    if (assignment) return assignment;

    // ── 2. Legacy weekly schedule (FIXED) ───────────────────────────────
    return this.resolveLegacySchedule(userId, clockInAt, tz, local);
  }

  // ────────────────────────────────────────────────────────────────────────
  // Resolution steps
  // ────────────────────────────────────────────────────────────────────────

  private async resolveAssignment(
    userId: string,
    spaceId: string,
    clockInAt: Date,
    tz: string,
    local: LocalDate,
  ): Promise<ResolvedShift | null> {
    const assignments = await this.prisma.shiftAssignment.findMany({
      where: {
        userId,
        spaceId,
        isActive: true,
        effectiveFrom: { lte: clockInAt },
        OR: [{ effectiveTo: null }, { effectiveTo: { gte: clockInAt } }],
      },
      include: { shift: true },
      // Highest priority wins overlaps; then the most recently-effective rota.
      orderBy: [{ priority: 'desc' }, { effectiveFrom: 'desc' }],
    });

    for (const a of assignments) {
      if (!a.shift?.isActive) continue;
      if (!this.recurrenceMatches(a, local)) continue;

      const shift = a.shift;
      const [startH, startM] = this.parseHm(shift.startLocal);
      const [endH, endM] = this.parseHm(shift.endLocal);
      const expectedClockInAt = this.computeStart(local.dateStr, startH, startM, tz, shift.crossesMidnight, local.minutesOfDay);
      const expectedClockOutAt = this.computeEnd(local.dateStr, endH, endM, tz, shift.crossesMidnight, clockInAt, local.minutesOfDay);
      const graceMin = shift.graceMin ?? SHIFT_REMINDER_DEFAULTS.GRACE_MINUTES;

      return {
        shiftId: shift.id,
        expectedClockInAt,
        expectedClockOutAt,
        nextRemindAt: new Date(expectedClockOutAt.getTime() + graceMin * 60_000),
        graceMin,
        reminderIntervalMin: shift.reminderIntervalMin ?? SHIFT_REMINDER_DEFAULTS.REMINDER_INTERVAL_MINUTES,
        maxReminders: shift.maxReminders ?? SHIFT_REMINDER_DEFAULTS.MAX_REMINDERS,
        source: 'assignment',
      };
    }
    return null;
  }

  private async resolveLegacySchedule(
    userId: string,
    clockInAt: Date,
    tz: string,
    local: LocalDate,
  ): Promise<ResolvedShift | null> {
    const schedule = await this.prisma.technicianSchedule.findFirst({
      where: { technicianId: userId, dayOfWeek: local.dow, isActive: true },
    });
    if (!schedule?.endTime) return null;

    const [startH, startM] = this.parseHm(schedule.startTime);
    const [endH, endM] = this.parseHm(schedule.endTime);
    // Legacy schedules never cross midnight → start & end are on the clock-in's local day.
    const expectedClockInAt = this.computeStart(local.dateStr, startH, startM, tz, false, local.minutesOfDay);
    const expectedClockOutAt = this.computeEnd(local.dateStr, endH, endM, tz, false, clockInAt, local.minutesOfDay);
    const graceMin = SHIFT_REMINDER_DEFAULTS.GRACE_MINUTES;

    return {
      shiftId: null,
      expectedClockInAt,
      expectedClockOutAt,
      nextRemindAt: new Date(expectedClockOutAt.getTime() + graceMin * 60_000),
      graceMin,
      reminderIntervalMin: SHIFT_REMINDER_DEFAULTS.REMINDER_INTERVAL_MINUTES,
      maxReminders: SHIFT_REMINDER_DEFAULTS.MAX_REMINDERS,
      source: 'schedule',
    };
  }

  private recurrenceMatches(
    a: { recurrence: string; daysOfWeek: number[]; daysOfMonth: number[]; dates: Date[] },
    local: LocalDate,
  ): boolean {
    switch (a.recurrence) {
      case 'DAILY':
        return true;
      case 'WEEKLY':
        return a.daysOfWeek.includes(local.dow);
      case 'MONTHLY':
        return a.daysOfMonth.includes(local.dom);
      case 'ONE_OFF':
        // Stored as midnight-UTC of the admin's picked calendar date; compare it
        // as a plain calendar date (NOT re-zoned) against the clock-in's local
        // date, so a "March 15" one-off matches a March-15-local clock-in in any
        // timezone (re-zoning would shift it a day west of UTC).
        return a.dates.some((d) => d.toISOString().slice(0, 10) === local.dateStr);
      default:
        return false;
    }
  }

  // ────────────────────────────────────────────────────────────────────────
  // Timezone-aware date math (dependency-free, DST-safe)
  // ────────────────────────────────────────────────────────────────────────

  /**
   * Compute the absolute UTC instant a shift ends, given its local end time and
   * the clock-in's local minutes-of-day.
   *
   * A cross-midnight shift (e.g. 22:00→06:00) spans [start today] → [end
   * tomorrow]. Which calendar day the end falls on depends on WHERE in the shift
   * the worker clocked in:
   *   • Evening portion (local time ≥ end, e.g. 22:00, or slightly early like
   *     21:55) → the end is TOMORROW's endLocal.
   *   • Early-morning tail (local time < end, e.g. clocked in at 00:30 while the
   *     night shift is still running) → the end is TODAY's endLocal. Without this
   *     the end would be pushed ~24h too late and no reminder would fire on time.
   * A guard keeps the result strictly after clock-in as a final safety net.
   */
  private computeEnd(
    startDateStr: string,
    endH: number,
    endM: number,
    tz: string,
    crossesMidnight: boolean,
    clockInAt: Date,
    clockInLocalMinutes: number,
  ): Date {
    const endMinutes = endH * 60 + endM;
    let endDateStr = startDateStr;
    if (crossesMidnight) {
      endDateStr = clockInLocalMinutes < endMinutes ? startDateStr : this.addDays(startDateStr, 1);
    }
    let end = this.zonedWallTimeToUtc(endDateStr, endH, endM, tz);

    // Safety: for cross-midnight shifts the end must be strictly after clock-in
    // (pathological inputs only — the branch above already picks the right day).
    let guard = 0;
    while (crossesMidnight && end.getTime() <= clockInAt.getTime() && guard < 2) {
      endDateStr = this.addDays(endDateStr, 1);
      end = this.zonedWallTimeToUtc(endDateStr, endH, endM, tz);
      guard++;
    }
    return end;
  }

  /**
   * Compute the absolute UTC instant a shift STARTS. For a cross-midnight shift,
   * if the worker clocked in during the early-morning tail (local minutes < the
   * start time), the shift actually started YESTERDAY. Otherwise it's today's
   * startLocal.
   */
  private computeStart(
    startDateStr: string,
    startH: number,
    startM: number,
    tz: string,
    crossesMidnight: boolean,
    clockInLocalMinutes: number,
  ): Date {
    const startMinutes = startH * 60 + startM;
    let dateStr = startDateStr;
    if (crossesMidnight && clockInLocalMinutes < startMinutes) {
      dateStr = this.addDays(startDateStr, -1);
    }
    return this.zonedWallTimeToUtc(dateStr, startH, startM, tz);
  }

  /** Convert a wall-clock time in a timezone (on a given calendar date) to a UTC instant. */
  private zonedWallTimeToUtc(dateStr: string, hh: number, mm: number, tz: string): Date {
    const [y, mo, d] = dateStr.split('-').map(Number);
    const utcGuess = Date.UTC(y!, mo! - 1, d!, hh, mm, 0);
    // First pass: offset at the naive guess. Second pass refines across a DST
    // transition (the offset at the guess can differ from the offset at the result).
    const o1 = this.tzOffsetMs(new Date(utcGuess), tz);
    let result = utcGuess - o1;
    const o2 = this.tzOffsetMs(new Date(result), tz);
    if (o2 !== o1) result = utcGuess - o2;
    return new Date(result);
  }

  /** Milliseconds to add to a UTC instant to get the given timezone's wall clock. */
  private tzOffsetMs(instant: Date, tz: string): number {
    try {
      const parts = this.getOffsetFormatter(tz).formatToParts(instant);
      const g = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? '0');
      const asUTC = Date.UTC(g('year'), g('month') - 1, g('day'), g('hour'), g('minute'), g('second'));
      return asUTC - instant.getTime();
    } catch {
      return 0; // Invalid timezone → treat as UTC
    }
  }

  /** Local calendar parts (date string, day-of-week, day-of-month, minutes-of-day) in a timezone. */
  private getLocal(instant: Date, tz: string): LocalDate {
    let dateStr: string;
    let minutesOfDay = 0;
    try {
      const parts = this.getOffsetFormatter(tz).formatToParts(instant);
      const g = (t: string) => parts.find((p) => p.type === t)?.value ?? '00';
      dateStr = `${g('year')}-${g('month')}-${g('day')}`;
      minutesOfDay = Number(g('hour')) * 60 + Number(g('minute'));
    } catch {
      dateStr = instant.toISOString().slice(0, 10);
      minutesOfDay = instant.getUTCHours() * 60 + instant.getUTCMinutes();
    }
    const dom = Number(dateStr.split('-')[2]);
    return { dateStr, dow: this.getLocalDayOfWeek(instant, tz), dom, minutesOfDay };
  }

  private getLocalDayOfWeek(instant: Date, tz: string): number {
    try {
      const dayStr = this.getWeekdayFormatter(tz).format(instant);
      const map: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
      return map[dayStr] ?? instant.getUTCDay();
    } catch {
      return instant.getUTCDay();
    }
  }

  /** Add whole calendar days to a YYYY-MM-DD string (pure date math, tz-agnostic). */
  private addDays(dateStr: string, days: number): string {
    const [y, m, d] = dateStr.split('-').map(Number);
    const dt = new Date(Date.UTC(y!, m! - 1, d!));
    dt.setUTCDate(dt.getUTCDate() + days);
    const yy = dt.getUTCFullYear();
    const mm = String(dt.getUTCMonth() + 1).padStart(2, '0');
    const dd = String(dt.getUTCDate()).padStart(2, '0');
    return `${yy}-${mm}-${dd}`;
  }

  private parseHm(hm: string): [number, number] {
    const [h, m] = hm.split(':').map(Number);
    return [h ?? 0, m ?? 0];
  }

  // Cached Intl formatters (construction is expensive) keyed by timezone.
  private readonly offsetFormatters = new Map<string, Intl.DateTimeFormat>();
  private readonly weekdayFormatters = new Map<string, Intl.DateTimeFormat>();

  private getOffsetFormatter(tz: string): Intl.DateTimeFormat {
    let fmt = this.offsetFormatters.get(tz);
    if (!fmt) {
      fmt = new Intl.DateTimeFormat('en-US', {
        timeZone: tz,
        hourCycle: 'h23', // 00–23 (avoids the '24' midnight quirk)
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      });
      this.offsetFormatters.set(tz, fmt);
    }
    return fmt;
  }

  private getWeekdayFormatter(tz: string): Intl.DateTimeFormat {
    let fmt = this.weekdayFormatters.get(tz);
    if (!fmt) {
      fmt = new Intl.DateTimeFormat('en-US', { timeZone: tz, weekday: 'short' });
      this.weekdayFormatters.set(tz, fmt);
    }
    return fmt;
  }
}

interface LocalDate {
  dateStr: string; // YYYY-MM-DD
  dow: number; // 0=Sun..6=Sat
  dom: number; // 1..31
  minutesOfDay: number; // local wall-clock minutes since midnight (0..1439)
}
