import { localPartsIn, parseHm, zonedWallTimeToUtc } from './zoned-time';

/**
 * A rest is planned, not merely permitted.
 *
 * Until now a break existed only once somebody took one: nothing said when it
 * was due, nothing asked, and a workspace could not express "half an hour,
 * somewhere around midday, and it comes off the paid hours". A rest that is only
 * allowed is a rest that is skipped on a busy day and argued about at the end of
 * the month.
 *
 * The rules are configuration. This turns them, once, at clock-in, into concrete
 * instants for one person's one shift — a PLAN, frozen onto the time entry. The
 * reminder sweep then reads a plan and never a rule: it joins nothing, and a rule
 * edited at noon cannot retroactively rearrange somebody's afternoon.
 */

export type BreakTrigger = 'AFTER_WORKED' | 'LOCAL_WINDOW';

/** The shape the plan needs from a rule, so callers need not pass a Prisma row. */
export interface BreakRuleLike {
  id: string;
  name: string;
  trigger: BreakTrigger | string;
  /** AFTER_WORKED: minutes into the shift before it falls due. */
  afterMinutes?: number | null;
  /** LOCAL_WINDOW: "11:30" — the moment it falls due, in the shift's local time. */
  earliestLocal?: string | null;
  /** LOCAL_WINDOW: "13:30" — after this it is late, and is marked missed. */
  latestLocal?: string | null;
  durationMinutes: number;
  isPaid: boolean;
  isRequired: boolean;
  remind: boolean;
  snoozeMin: number;
  /** Null = the default cap. Never unlimited: see MAX_SNOOZES_DEFAULT. */
  maxSnoozes?: number | null;
}

export type BreakPlanState = 'PENDING' | 'SNOOZED' | 'TAKEN' | 'MISSED';

export interface BreakPlanItem {
  ruleId: string;
  name: string;
  /** ISO instant. Absolute, so the sweep compares numbers and never zones. */
  dueAt: string;
  /** ISO instant after which it is too late to be taken; null = no deadline. */
  expiresAt: string | null;
  durationMinutes: number;
  isPaid: boolean;
  required: boolean;
  state: BreakPlanState;
  snoozeCount: number;
  /** Set when the member actually took it, linking plan to evidence. */
  breakId?: string;
  /** ISO instant the rest was started, for the "your rest is over" nudge. */
  takenAt?: string;
}

/**
 * How many times "Later" may be answered before the system stops asking.
 *
 * Not unlimited, and this is a correction to the first design: a phone left in a
 * locker would otherwise collect forty notifications over an afternoon, which is
 * how people turn a channel off entirely. After the cap it is recorded as missed
 * and a person decides — the same shape as the shift reminder, which escalates
 * rather than nagging forever.
 */
export const MAX_SNOOZES_DEFAULT = 3;

/** A rest reminder is never re-asked sooner than this, whatever a rule says. */
export const MIN_SNOOZE_MINUTES = 5;

export interface BreakPlanContext {
  /** When the member actually clocked in. */
  clockInAt: Date;
  /** The shift's expected start, when there is one — AFTER_WORKED counts from
   *  the shift, not from an early arrival, or arriving twenty minutes early
   *  would move lunch twenty minutes earlier for that person alone. */
  expectedStartAt?: Date | null;
  /** The shift's expected end; a rest due after it is not planned at all. */
  expectedEndAt?: Date | null;
  /** The zone the shift's local times are read in. */
  timezone: string;
}

/**
 * Turn the rules that apply into this shift's plan.
 *
 * Rests that would fall outside the shift are dropped rather than scheduled into
 * a moment nobody is working: a "after 8 hours" rest on a six-hour shift is not
 * a missed rest, it simply does not apply today.
 */
export function resolveBreakPlan(
  rules: BreakRuleLike[],
  ctx: BreakPlanContext,
): BreakPlanItem[] {
  const anchor = ctx.expectedStartAt ?? ctx.clockInAt;
  const local = localPartsIn(anchor, ctx.timezone);
  const items: BreakPlanItem[] = [];

  for (const rule of rules) {
    const duration = Math.max(1, Math.round(rule.durationMinutes || 0));
    let dueAt: Date | null = null;
    let expiresAt: Date | null = null;

    if (rule.trigger === 'AFTER_WORKED') {
      const after = Math.max(0, Math.round(rule.afterMinutes ?? 0));
      dueAt = new Date(anchor.getTime() + after * 60_000);
    } else if (rule.trigger === 'LOCAL_WINDOW' && rule.earliestLocal) {
      const [h, m] = parseHm(rule.earliestLocal);
      dueAt = zonedWallTimeToUtc(local.dateStr, h, m, ctx.timezone);
      /*
        A night shift's "12:30" belongs to the day the shift is running, not the
        calendar day it started. If the window resolves before the anchor, it is
        tomorrow's — otherwise a 22:00 start would schedule lunch fourteen hours
        into the past and the sweep would fire it immediately.
      */
      if (dueAt.getTime() < anchor.getTime()) {
        dueAt = new Date(dueAt.getTime() + 24 * 3_600_000);
      }
      if (rule.latestLocal) {
        const [lh, lm] = parseHm(rule.latestLocal);
        let latest = zonedWallTimeToUtc(local.dateStr, lh, lm, ctx.timezone);
        while (latest.getTime() <= dueAt.getTime()) {
          latest = new Date(latest.getTime() + 24 * 3_600_000);
        }
        expiresAt = latest;
      }
    }

    if (!dueAt) continue;

    // A rest that falls due after the shift has ended is not this shift's.
    if (ctx.expectedEndAt && dueAt.getTime() >= ctx.expectedEndAt.getTime()) continue;

    items.push({
      ruleId: rule.id,
      name: rule.name,
      dueAt: dueAt.toISOString(),
      expiresAt: expiresAt ? expiresAt.toISOString() : null,
      durationMinutes: duration,
      isPaid: !!rule.isPaid,
      required: !!rule.isRequired,
      state: 'PENDING',
      snoozeCount: 0,
    });
  }

  return items.sort((a, b) => a.dueAt.localeCompare(b.dueAt));
}

/** Items still waiting to be taken, in the order they fall due. */
export function outstandingBreaks(plan: BreakPlanItem[]): BreakPlanItem[] {
  return plan
    .filter((i) => i.state === 'PENDING' || i.state === 'SNOOZED')
    .sort((a, b) => a.dueAt.localeCompare(b.dueAt));
}

/**
 * The next instant this entry needs the sweep's attention, or null.
 *
 * This is the value that goes in an indexed column. The plan itself is JSON and
 * cannot be indexed — put the deadline only in there and the sweep degrades into
 * a full scan of every open shift on the day the product gets busy.
 */
export function nextBreakRemindAt(plan: BreakPlanItem[], now: Date = new Date()): Date | null {
  const next = outstandingBreaks(plan)[0];
  if (!next) return null;
  const due = new Date(next.dueAt);
  return due.getTime() > now.getTime() ? due : now;
}

/** A rest that was never taken and can no longer be. */
export function isExpired(item: BreakPlanItem, now: Date): boolean {
  return !!item.expiresAt && new Date(item.expiresAt).getTime() <= now.getTime();
}

/**
 * "Later." Push it out by the rule's interval, or record it as missed once the
 * cap is reached.
 *
 * Returns a NEW plan — the caller writes it back in the same statement that
 * moves the indexed deadline, so the two cannot disagree.
 */
export function snooze(
  plan: BreakPlanItem[],
  ruleId: string,
  opts: { snoozeMin: number; maxSnoozes?: number | null; now?: Date },
): BreakPlanItem[] {
  const now = opts.now ?? new Date();
  const cap = opts.maxSnoozes ?? MAX_SNOOZES_DEFAULT;
  const gap = Math.max(MIN_SNOOZE_MINUTES, Math.round(opts.snoozeMin || 0));
  return plan.map((i) => {
    if (i.ruleId !== ruleId || (i.state !== 'PENDING' && i.state !== 'SNOOZED')) return i;
    const snoozeCount = i.snoozeCount + 1;
    if (snoozeCount > cap) return { ...i, state: 'MISSED' as const, snoozeCount };
    return {
      ...i,
      state: 'SNOOZED' as const,
      snoozeCount,
      dueAt: new Date(now.getTime() + gap * 60_000).toISOString(),
    };
  });
}

/** The member started this rest. */
export function markTaken(
  plan: BreakPlanItem[],
  ruleId: string,
  breakId: string,
  now: Date = new Date(),
): BreakPlanItem[] {
  return plan.map((i) =>
    i.ruleId === ruleId && i.state !== 'TAKEN'
      ? { ...i, state: 'TAKEN' as const, breakId, takenAt: now.toISOString() }
      : i,
  );
}

/** The window closed, or the shift ended, without it being taken. */
export function markMissed(plan: BreakPlanItem[], ruleId: string): BreakPlanItem[] {
  return plan.map((i) =>
    i.ruleId === ruleId && (i.state === 'PENDING' || i.state === 'SNOOZED')
      ? { ...i, state: 'MISSED' as const }
      : i,
  );
}

/**
 * A required rest that never happened. Read at clock-out to flag the entry —
 * and deliberately NOT to deduct anything: a rest the member did not take is
 * time they were working, and inventing a deduction is how a time system loses
 * everyone's trust in a week.
 */
export function missedRequired(plan: BreakPlanItem[]): BreakPlanItem[] {
  return plan.filter((i) => i.required && (i.state === 'MISSED' || i.state === 'PENDING' || i.state === 'SNOOZED'));
}

/** Safe read of whatever the JSON column holds — a bad shape is no plan. */
export function parseBreakPlan(raw: unknown): BreakPlanItem[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter(
    (i): i is BreakPlanItem =>
      !!i && typeof i === 'object' && typeof (i as BreakPlanItem).ruleId === 'string' && typeof (i as BreakPlanItem).dueAt === 'string',
  );
}
