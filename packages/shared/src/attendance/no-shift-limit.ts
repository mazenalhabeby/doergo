/**
 * Clocking in with no shift — what a workspace allows, and how much of it.
 *
 * A member without a shift used to clock in and stay as long as they liked, and
 * every hour counted. Each workspace now chooses: allow it, allow up to a number
 * of hours a day, or only clock in with a shift.
 *
 * ⚠️ THE LIMIT BECOMES THE SESSION'S PLANNED END. Nothing downstream learns a
 * new rule: counted time stops at `expectedClockOutAt`, the reminders fire past
 * it, the late clock-out asks for overtime past it, and a forgotten session is
 * closed from it — exactly as for a shift.
 *
 * ⚠️ HOURS ARE COUNTED AT EVERY WORKSPACE. A limit per workspace that only
 * counted its own hours is walked around by clocking in next door.
 *
 * Pure, and the only implementation: the clock-in enforces through it, the phone
 * warns through it, and the settings screen explains itself with it.
 */
import { addDaysStr, localPartsIn, zonedWallTimeToUtc } from './zoned-time';

export const NO_SHIFT_POLICIES = ['ALLOW', 'LIMIT', 'SHIFT_ONLY'] as const;
export type NoShiftPolicy = (typeof NO_SHIFT_POLICIES)[number];

/** Today's behaviour, so nothing changes anywhere until somebody decides it. */
export const DEFAULT_NO_SHIFT_POLICY: NoShiftPolicy = 'ALLOW';

export const NO_SHIFT_LIMIT = {
  DEFAULT_MINUTES: 480,
  MIN_MINUTES: 30,
  MAX_MINUTES: 1440,
  PRESETS_MINUTES: [240, 360, 480, 600] as readonly number[],
} as const;

export function isNoShiftPolicy(v: unknown): v is NoShiftPolicy {
  return typeof v === 'string' && (NO_SHIFT_POLICIES as readonly string[]).includes(v);
}

export type NoShiftAllowance =
  /** No limit applies. */
  | { kind: 'free' }
  /** Clocking in is refused: this workspace needs a shift, or today's hours are used up. */
  | { kind: 'refused'; reason: 'SHIFT_ONLY' | 'NO_HOURS_LEFT'; dailyMinutes: number | null }
  /** Allowed, counted until `until`. */
  | { kind: 'limited'; remainingMinutes: number; until: Date; dailyMinutes: number };

export function noShiftAllowance(input: {
  policy: string | null | undefined;
  dailyMinutes: number | null | undefined;
  /** Counted minutes the member already has today, at any workspace. */
  workedTodayMinutes: number;
  /** The moment of the clock-in. */
  at: Date;
}): NoShiftAllowance {
  const policy = isNoShiftPolicy(input.policy) ? input.policy : DEFAULT_NO_SHIFT_POLICY;
  if (policy === 'ALLOW') return { kind: 'free' };
  if (policy === 'SHIFT_ONLY') return { kind: 'refused', reason: 'SHIFT_ONLY', dailyMinutes: null };

  const daily = clampDailyMinutes(input.dailyMinutes);
  const remaining = Math.max(0, daily - Math.max(0, Math.round(input.workedTodayMinutes)));
  // Under a minute left is nothing left: a session that must end as it starts helps nobody.
  if (remaining < 1) return { kind: 'refused', reason: 'NO_HOURS_LEFT', dailyMinutes: daily };
  return {
    kind: 'limited',
    remainingMinutes: remaining,
    until: new Date(input.at.getTime() + remaining * 60_000),
    dailyMinutes: daily,
  };
}

export function clampDailyMinutes(minutes: number | null | undefined): number {
  const m = Number.isFinite(minutes as number) ? Math.round(minutes as number) : NO_SHIFT_LIMIT.DEFAULT_MINUTES;
  return Math.min(NO_SHIFT_LIMIT.MAX_MINUTES, Math.max(NO_SHIFT_LIMIT.MIN_MINUTES, m));
}

/** Local midnight of the day `at` falls on, in `tz`, as an instant. */
export function startOfDayIn(at: Date, tz: string): Date {
  return zonedWallTimeToUtc(localPartsIn(at, tz).dateStr, 0, 0, tz);
}

/** Local midnight that ENDS the day `at` falls on, in `tz`. */
export function endOfDayIn(at: Date, tz: string): Date {
  return zonedWallTimeToUtc(addDaysStr(localPartsIn(at, tz).dateStr, 1), 0, 0, tz);
}

export interface WorkedEntry {
  clockInAt: Date | string;
  clockOutAt: Date | string | null;
  /** Counted minutes, when the entry has them. */
  paidMinutes?: number | null;
  totalMinutes?: number | null;
  unpaidBreakMinutes?: number | null;
}

/**
 * Counted minutes that fall between `from` and `to`.
 *
 * A session crossing midnight gives each day its share. Counted rather than
 * raw time, so a rest does not use up the allowance and approved overtime does.
 * An entry still open is counted up to `to`.
 */
export function countedMinutesBetween(entries: readonly WorkedEntry[], from: Date, to: Date): number {
  let sum = 0;
  for (const e of entries) {
    const start = new Date(e.clockInAt).getTime();
    const end = e.clockOutAt ? new Date(e.clockOutAt).getTime() : to.getTime();
    if (!(end > start)) continue;
    const overlap = Math.min(end, to.getTime()) - Math.max(start, from.getTime());
    if (overlap <= 0) continue;
    const span = (end - start) / 60_000;
    const counted = e.clockOutAt
      ? e.paidMinutes ?? (e.totalMinutes != null ? e.totalMinutes - (e.unpaidBreakMinutes ?? 0) : span)
      : span - (e.unpaidBreakMinutes ?? 0);
    sum += Math.max(0, counted) * (overlap / 60_000 / span);
  }
  return Math.round(sum);
}

/**
 * A workspace's rule for this member, as the server saw it — carried on each
 * workspace the phone and web may clock in at, so the answer before the tap is
 * the answer the clock-in will give. Absent where the workspace allows it freely.
 */
export interface NoShiftTag {
  policy: NoShiftPolicy;
  dailyMinutes: number;
  /** A shift matched when this was read: the rule does not apply. */
  hasShiftNow: boolean;
  /** Counted minutes today, at any workspace, when this was read. */
  workedTodayMinutes: number;
  /** End of that day in the workspace's time zone — after it, nothing is used up yet. */
  dayEndsAt: string;
}

/** The allowance at `now` from a tag that may have been read a while ago (the phone without signal). */
export function noShiftAllowanceNow(tag: NoShiftTag | null | undefined, now: Date): NoShiftAllowance {
  if (!tag || tag.hasShiftNow) return { kind: 'free' };
  const newDay = now.getTime() >= new Date(tag.dayEndsAt).getTime();
  return noShiftAllowance({
    policy: tag.policy,
    dailyMinutes: tag.dailyMinutes,
    workedTodayMinutes: newDay ? 0 : tag.workedTodayMinutes,
    at: now,
  });
}
