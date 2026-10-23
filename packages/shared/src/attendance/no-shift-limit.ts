/**
 * Clocking in with no shift — what a workspace allows, and how much of it.
 *
 * A member without a shift used to clock in and stay as long as they liked, and
 * every hour counted. Each workspace now chooses: allow it, allow up to a number
 * of hours a day, or only clock in with a shift.
 *
 * ⚠️ THE LIMIT BECOMES THE SESSION'S PLANNED END, AS A MARKER (`endIsDailyLimit`).
 * The reminders fire past it, staying past it flags PAST_DAILY_LIMIT for the
 * leader, and a forgotten session is closed from it. Counted time is NOT cut at
 * it (since 2026-10-23, docs/plans/time-counting-model.md): everything until the
 * clock-out counts, and the leader sees the long day.
 *
 * ⚠️ HOURS ARE COUNTED AT EVERY WORKSPACE. A limit per workspace that only
 * counted its own hours is walked around by clocking in next door.
 *
 * Pure, and the only implementation: the clock-in enforces through it, the phone
 * warns through it, and the settings screen explains itself with it.
 */
import { addDaysStr, localPartsIn, zonedWallTimeToUtc } from './zoned-time';

import { zoneOf } from '../utils/workspace-zone';
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

/**
 * Does this workspace schedule shifts at all?
 *
 * ⚠️ `workModel` NONE — the default, and most workspaces — schedules nothing BY
 * DESIGN. "You had no shift today" means nothing there: flagging every clock-in
 * at such a workspace UNSCHEDULED_DAY put each one in review and pushed a
 * pending-approval notice, for a shift nobody was ever meant to have.
 */
export function workspaceSchedulesShifts(workModel: string | null | undefined): boolean {
  // ⚠️ Only SHIFT (rota) and FIXED (weekly schedule) plan shifts. NONE plans nothing, and
  // TASK is task-based work with no scheduled end — flagging their days "unscheduled"
  // would send every clock-in to review for nothing.
  return workModel === 'SHIFT' || workModel === 'FIXED';
}

/**
 * The no-shift rule that actually applies at a workspace.
 *
 * ⚠️ SHIFT_ONLY where nothing is scheduled would refuse EVERYBODY, forever — no
 * shift can ever match there. Saving that pair is refused
 * (`noShiftPolicyConflict`); any row that already holds it reads as ALLOW.
 * LIMIT is unaffected: "up to N hours a day" means exactly as much without a rota.
 */
export function effectiveNoShiftPolicy(
  policy: string | null | undefined,
  workModel: string | null | undefined,
): NoShiftPolicy {
  const p = isNoShiftPolicy(policy) ? policy : DEFAULT_NO_SHIFT_POLICY;
  return p === 'SHIFT_ONLY' && !workspaceSchedulesShifts(workModel) ? 'ALLOW' : p;
}

/** Why this pair may not be saved, or null when it may. */
export function noShiftPolicyConflict(
  policy: string | null | undefined,
  workModel: string | null | undefined,
): 'SHIFT_ONLY_WITHOUT_SHIFTS' | null {
  return policy === 'SHIFT_ONLY' && !workspaceSchedulesShifts(workModel) ? 'SHIFT_ONLY_WITHOUT_SHIFTS' : null;
}

export type NoShiftAllowance =
  /** No limit applies. */
  | { kind: 'free' }
  /** This workspace needs a shift (the clock-in is refused), or today's hours are used up (kept and flagged). */
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
  /** Overtime agreed in advance for today (an approved OVERTIME request): it raises the day's limit. */
  extraMinutes?: number | null;
}): NoShiftAllowance {
  const policy = isNoShiftPolicy(input.policy) ? input.policy : DEFAULT_NO_SHIFT_POLICY;
  if (policy === 'ALLOW') return { kind: 'free' };
  if (policy === 'SHIFT_ONLY') return { kind: 'refused', reason: 'SHIFT_ONLY', dailyMinutes: null };

  const daily = clampDailyMinutes(input.dailyMinutes) + Math.max(0, Math.round(input.extraMinutes ?? 0));
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

/**
 * When a session with no shift is first asked "forgot to clock out?" — after
 * the workspace's own hours without a shift (8, 10, 12 — whatever it set),
 * never a number of its own. Read from the workspace, so changing it there
 * changes it for everybody (`rearmNoShiftSessions` moves the running ones).
 */
export function noShiftReminderAt(clockInAt: Date, dailyMinutes: number | null | undefined): Date {
  return new Date(clockInAt.getTime() + clampDailyMinutes(dailyMinutes) * 60_000);
}

export function clampDailyMinutes(minutes: number | null | undefined): number {
  const m = Number.isFinite(minutes as number) ? Math.round(minutes as number) : NO_SHIFT_LIMIT.DEFAULT_MINUTES;
  return Math.min(NO_SHIFT_LIMIT.MAX_MINUTES, Math.max(NO_SHIFT_LIMIT.MIN_MINUTES, m));
}

/**
 * Whose "today" a no-shift limit counts: the MEMBER's own zone, else the zone of
 * the WORKSPACE they work at (derived from its map point), else the organization's.
 *
 * ⚠️ The workspace before the organization. An organization's zone is one setting
 * for a company that may work in several countries (HBC USA was set to Mexico while
 * its people work in New York): the place where the work happens knows its own day.
 * A session belongs to the day it STARTED (`countedMinutesOfDay`), so the zone only
 * decides which day a clock-in falls on.
 */
export function memberDayZone(
  userTz: string | null | undefined,
  orgTz: string | null | undefined,
  workspaceTz?: string | null,
): string {
  return zoneOf(userTz, workspaceTz, orgTz);
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
      ? (e.paidMinutes ?? (e.totalMinutes != null ? e.totalMinutes - (e.unpaidBreakMinutes ?? 0) : span))
      : span - (e.unpaidBreakMinutes ?? 0);
    sum += Math.max(0, counted) * (overlap / 60_000 / span);
  }
  return Math.round(sum);
}

/**
 * Counted minutes of the sessions that STARTED between `dayStart` and `at` — what a
 * day's no-shift limit has used up.
 *
 * ⚠️ A session belongs to the day it started. A night shift (18:00 → 06:00) was
 * already held to ITS day's limit when it began; charging its hours after midnight
 * to the next day as well cut the next night short (HBC USA, Oct 2026: a 12 h
 * night counted 7 h 54 m). An entry still open is counted up to `at`.
 */
export function countedMinutesOfDay(entries: readonly WorkedEntry[], dayStart: Date, at: Date): number {
  const started = entries.filter((e) => {
    const t = new Date(e.clockInAt).getTime();
    return t >= dayStart.getTime() && t < at.getTime();
  });
  return countedMinutesBetween(started, dayStart, at);
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
  /** Overtime agreed in advance for today: added to the limit. Absent on older servers. */
  extraMinutes?: number;
  /** End of that day in the MEMBER's zone (`memberDayZone`) — after it, nothing is used up yet. */
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
    extraMinutes: newDay ? 0 : (tag.extraMinutes ?? 0),
    at: now,
  });
}
