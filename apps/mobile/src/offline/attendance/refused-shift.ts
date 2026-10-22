import { refusalText } from '@/lib/distance';
import type { OutboxOp } from '../outbox/types';

/**
 * A clock-in, clock-out or rest the phone showed as done, and the server
 * refused afterwards.
 *
 * A refusal at the moment of the tap is shown there and discarded from the
 * outbox (`outcomeOf`). What is LEFT in failed/conflict is, by construction,
 * one the member never heard about: the tap was queued, the card said
 * "Clocked in · saved on this phone", and minutes or hours later the server
 * said no. The card then quietly went back to "Ready to start" and nobody was
 * told — a member was shown clocked in on a shift the server never had, could
 * not clock out of it, and lost the day.
 */
export const SHIFT_OPS: ReadonlySet<string> = new Set([
  'attendance.clockIn',
  'attendance.clockOut',
  'attendance.breakStart',
  'attendance.breakEnd',
]);

export function refusedShiftOps(ops: readonly OutboxOp[]): OutboxOp[] {
  return ops
    .filter((o) => SHIFT_OPS.has(o.op) && (o.state === 'failed' || o.state === 'conflict'))
    .sort((a, b) => b.createdAt - a.createdAt);
}

/** When the member tapped — the evidence's own time, else when it was queued. */
export function tappedAt(op: OutboxOp): number {
  const at = op.evidence?.occurredAt ? Date.parse(op.evidence.occurredAt) : NaN;
  return Number.isFinite(at) ? at : op.createdAt;
}

/** The workspace a refused clock-in named, for the report. */
export function refusedSpaceId(op: OutboxOp): string | undefined {
  const body = (op.payload as { body?: { locationId?: unknown } } | undefined)?.body;
  return typeof body?.locationId === 'string' ? body.locationId : undefined;
}

type Translate = (key: string, opts?: Record<string, unknown>) => string;

export interface RefusedShiftCopy {
  title: string;
  reason: string;
  /** A report already written for the office: what, when, and why. */
  issueTitle: string;
  issueBody: string;
  /** A refused clock-in can be replaced by a clock-in now. */
  canClockInNow: boolean;
}

/**
 * The words for one refusal. The reason is the server's code in the member's
 * language — OUT_OF_ORDER with the date of the shift it ran into, because
 * "this happened before the step it follows" is true and useless: what the
 * member can act on is that their hours show a later shift.
 */
export function refusedShiftCopy(
  t: Translate,
  op: OutboxOp,
  fmt: { clock: (at: Date) => string; date: (at: Date) => string },
): RefusedShiftCopy {
  const time = fmt.clock(new Date(tappedAt(op)));
  const err = op.lastError ?? {};
  const previousAt = typeof err.params?.previousAt === 'string' ? Date.parse(err.params.previousAt) : NaN;

  let reason: string;
  if (err.code === 'OUT_OF_ORDER' && Number.isFinite(previousAt)) {
    const date = fmt.date(new Date(previousAt));
    reason = t('shiftClock.refused.outOfOrder', {
      date,
      defaultValue: 'Your hours already show a shift ending later ({{date}}). Ask your office to check your hours.',
    });
  } else if (op.op === 'attendance.clockOut' && (err.code === 'DEPENDENCY_FAILED' || err.code === 'NOT_CLOCKED_IN' || /not currently clocked in/i.test(err.message ?? ''))) {
    reason = t('shiftClock.refused.noClockIn', {
      defaultValue: "Your clock-in wasn't saved, so there was nothing to clock out of. Your office can add your hours.",
    });
  } else {
    reason = refusalText(t, err, t('offline.errors.default'));
  }

  const kind = op.op.replace('attendance.', '');
  const title =
    kind === 'clockIn' ? t('shiftClock.refused.clockIn', { time, defaultValue: "Your clock-in at {{time}} wasn't saved" })
    : kind === 'clockOut' ? t('shiftClock.refused.clockOut', { time, defaultValue: "Your clock-out at {{time}} wasn't saved" })
    : t('shiftClock.refused.rest', { time, defaultValue: "Your break at {{time}} wasn't saved" });

  const day = fmt.date(new Date(tappedAt(op)));
  return {
    title,
    reason,
    issueTitle: title,
    issueBody: t('shiftClock.refused.issueBody', {
      day,
      time,
      reason,
      defaultValue: 'On {{day}} at {{time}} the app refused this.\nReason: {{reason}}\nPlease check my hours.',
    }),
    canClockInNow: kind === 'clockIn',
  };
}
