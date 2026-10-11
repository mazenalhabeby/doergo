/**
 * REQUESTS — what a member asks the person responsible for them.
 *
 * The time-off request grew into this: leave is one KIND of request; working
 * remotely, a changed day and overtime agreed in advance are others. They are
 * all one record (`TimeOff` + `kind`), so approval, notification routing, the
 * company calendar and the offline outbox are written once and shared.
 *
 * ⚠️ ONLY `LEAVE` IS AN ABSENCE. Every reader that asks "is this person off?"
 * — the no-show sweep, cover, the leader-absent notice, the calendar's leave
 * layer, the rota — must filter with `ABSENCE_WHERE` / `isAbsence`. A remote
 * day, a later start or approved overtime is a day WORKED; counting it as
 * leave would excuse somebody from a shift they still owe.
 *
 * ⚠️ AN APPROVAL COVERS ONLY WHAT WAS ASKED. An approved remote day removes the
 * away/remote review flags for that day; it does not excuse lateness. A changed
 * day moves the expected start/end; it does not approve working elsewhere.
 *
 * Pure — the server, the phone and the web read the same answers.
 */

export const REQUEST_KINDS = ['LEAVE', 'REMOTE', 'HOURS', 'OVERTIME', 'OTHER'] as const;
export type RequestKind = (typeof REQUEST_KINDS)[number];

/** The kinds of leave (the `type` of a LEAVE request). Only VACATION is deducted from the allowance. */
export const LEAVE_TYPES = ['VACATION', 'SICK', 'FAMILY', 'OTHER'] as const;
export type LeaveType = (typeof LEAVE_TYPES)[number];

export function isRequestKind(v: unknown): v is RequestKind {
  return typeof v === 'string' && (REQUEST_KINDS as readonly string[]).includes(v);
}
export function isLeaveType(v: unknown): v is LeaveType {
  return typeof v === 'string' && (LEAVE_TYPES as readonly string[]).includes(v);
}

/** A row with no kind is from before requests: it was leave. */
export function requestKindOf(kind: string | null | undefined): RequestKind {
  return isRequestKind(kind) ? kind : 'LEAVE';
}

/** Is this request an absence (the person is not working)? Only leave is. */
export function isAbsence(kind: string | null | undefined): boolean {
  return requestKindOf(kind) === 'LEAVE';
}

/** Prisma `where` fragment for "absences only" — spread it into every leave query. */
export const ABSENCE_WHERE = { kind: 'LEAVE' } as const;

/** Does approving this kind change how a day's attendance is judged? */
export function shapesAttendance(kind: RequestKind): boolean {
  return kind === 'REMOTE' || kind === 'HOURS' || kind === 'OVERTIME';
}

/**
 * The kinds a member may ask for here.
 *
 * `enabled` is the workspace's own list; EMPTY MEANS EVERY KIND (the same
 * default as document visibility — the opposite would remove leave requests
 * from every organization on the day this ships). REMOTE is offered only to a
 * member who may work away from a site at all — asking for something you are
 * not allowed to do is a request nobody can approve.
 */
export function requestKindsOffered(input: {
  enabled?: readonly string[] | null;
  mayWorkRemotely: boolean;
}): RequestKind[] {
  const enabled = (input.enabled ?? []).filter(isRequestKind);
  const base: readonly RequestKind[] = enabled.length ? enabled : REQUEST_KINDS;
  return REQUEST_KINDS.filter((k) => base.includes(k) && (k !== 'REMOTE' || input.mayWorkRemotely));
}

/** Limits, in one place. */
export const REQUEST_LIMITS = {
  REASON_MAX: 500,
  /** A remote request covers at most this many days in one go. */
  REMOTE_MAX_DAYS: 31,
  OVERTIME_MIN_MINUTES: 15,
  OVERTIME_MAX_MINUTES: 720,
} as const;

export type RequestInputError =
  | 'REQUEST_KIND_INVALID'
  | 'REQUEST_DATES_INVALID'
  | 'REQUEST_TYPE_INVALID'
  | 'REQUEST_SPACE_REQUIRED'
  | 'REQUEST_TIME_INVALID'
  | 'REQUEST_MINUTES_INVALID'
  | 'REQUEST_REASON_REQUIRED'
  | 'REQUEST_REASON_TOO_LONG'
  | 'REQUEST_TOO_MANY_DAYS';

/** A request as it is stored — every kind in one shape. */
export interface RequestInput {
  kind: RequestKind;
  /** YYYY-MM-DD, inclusive. HOURS and OVERTIME are one day: start = end. */
  startDate: string;
  endDate: string;
  /** LEAVE only. */
  type?: LeaveType;
  /** The workspace the request is about (REMOTE: required; HOURS/OVERTIME: optional). */
  spaceId?: string | null;
  /** HOURS: the day's new start and/or end, HH:MM local. */
  startTime?: string | null;
  endTime?: string | null;
  /** OVERTIME: minutes agreed in advance. */
  minutes?: number | null;
  reason?: string | null;
}

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;
const daysBetween = (a: string, b: string) =>
  Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000) + 1;

/**
 * Read a request body into a `RequestInput`, or the reason it cannot be one.
 * Unknown fields are dropped; fields that do not belong to the kind are dropped
 * (a LEAVE never carries minutes, an OVERTIME never carries a leave type).
 * Defaults: no kind = LEAVE, no leave type = VACATION — what old phones send.
 */
export function parseRequestInput(
  raw: unknown,
): { ok: true; value: RequestInput } | { ok: false; code: RequestInputError } {
  const b = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const kind = b.kind == null ? 'LEAVE' : b.kind;
  if (!isRequestKind(kind)) return { ok: false, code: 'REQUEST_KIND_INVALID' };

  const startDate = typeof b.startDate === 'string' ? b.startDate.slice(0, 10) : '';
  const endDate = typeof b.endDate === 'string' && b.endDate ? b.endDate.slice(0, 10) : startDate;
  if (!DATE.test(startDate) || !DATE.test(endDate) || endDate < startDate) {
    return { ok: false, code: 'REQUEST_DATES_INVALID' };
  }
  const oneDay = kind === 'HOURS' || kind === 'OVERTIME';
  if (oneDay && endDate !== startDate) return { ok: false, code: 'REQUEST_DATES_INVALID' };

  const reason = typeof b.reason === 'string' ? b.reason.trim() : '';
  if (reason.length > REQUEST_LIMITS.REASON_MAX) return { ok: false, code: 'REQUEST_REASON_TOO_LONG' };
  const spaceId = typeof b.spaceId === 'string' && b.spaceId ? b.spaceId : null;
  const value: RequestInput = { kind, startDate, endDate, reason: reason || null };

  switch (kind) {
    case 'LEAVE': {
      const type = b.type == null ? 'VACATION' : b.type;
      if (!isLeaveType(type)) return { ok: false, code: 'REQUEST_TYPE_INVALID' };
      value.type = type;
      break;
    }
    case 'REMOTE':
      if (!spaceId) return { ok: false, code: 'REQUEST_SPACE_REQUIRED' };
      if (daysBetween(startDate, endDate) > REQUEST_LIMITS.REMOTE_MAX_DAYS) return { ok: false, code: 'REQUEST_TOO_MANY_DAYS' };
      value.spaceId = spaceId;
      break;
    case 'HOURS': {
      const startTime = typeof b.startTime === 'string' && b.startTime ? b.startTime : null;
      const endTime = typeof b.endTime === 'string' && b.endTime ? b.endTime : null;
      if ((!startTime && !endTime) || (startTime && !HHMM.test(startTime)) || (endTime && !HHMM.test(endTime))) {
        return { ok: false, code: 'REQUEST_TIME_INVALID' };
      }
      if (startTime && endTime && endTime <= startTime) return { ok: false, code: 'REQUEST_TIME_INVALID' };
      Object.assign(value, { startTime, endTime, spaceId });
      break;
    }
    case 'OVERTIME': {
      const minutes = typeof b.minutes === 'number' ? Math.round(b.minutes) : NaN;
      if (!(minutes >= REQUEST_LIMITS.OVERTIME_MIN_MINUTES && minutes <= REQUEST_LIMITS.OVERTIME_MAX_MINUTES)) {
        return { ok: false, code: 'REQUEST_MINUTES_INVALID' };
      }
      Object.assign(value, { minutes, spaceId });
      break;
    }
    case 'OTHER':
      // Nothing structured to decide on — the words ARE the request.
      if (!reason) return { ok: false, code: 'REQUEST_REASON_REQUIRED' };
      value.spaceId = spaceId;
      break;
  }
  return { ok: true, value };
}

/** An approved request, as the clock-in reads it for one day. */
export interface ApprovedDayRequest {
  id: string;
  kind: RequestKind | string;
  spaceId?: string | null;
  startTime?: string | null;
  endTime?: string | null;
  minutes?: number | null;
}

/** What today's approved requests change about a clock-in at `spaceId`. */
export interface DayRequestEffect {
  /** Remote/away work at this workspace was approved in advance — no away/remote review flag. */
  remoteApproved: boolean;
  /** The expected start/end after a changed day and agreed overtime (null = unchanged). */
  expectedClockInAt: Date | null;
  expectedClockOutAt: Date | null;
  /** The requests that applied — kept on the entry so the review screen can say why. */
  requestIds: string[];
}

/**
 * Apply a day's APPROVED requests to a clock-in's expected window.
 *
 * `atLocal(hhmm)` turns a wall time on the clock-in's local day into an instant
 * (the caller owns time zones). A request tied to another workspace does not
 * apply here; one with no workspace applies anywhere. A changed day replaces
 * the start/end it names; agreed overtime extends the (possibly changed) end —
 * so the existing counted-time rule counts it with no special case.
 */
export function applyApprovedRequests(input: {
  spaceId: string | null;
  expectedClockInAt: Date | null;
  expectedClockOutAt: Date | null;
  requests: readonly ApprovedDayRequest[];
  atLocal: (hhmm: string) => Date;
}): DayRequestEffect {
  const here = input.requests.filter((r) => !r.spaceId || !input.spaceId || r.spaceId === input.spaceId);
  let start = input.expectedClockInAt;
  let end = input.expectedClockOutAt;
  let remoteApproved = false;
  const used: string[] = [];
  for (const r of here) {
    if (r.kind === 'REMOTE') {
      remoteApproved = true;
      used.push(r.id);
    } else if (r.kind === 'HOURS') {
      if (r.startTime) start = input.atLocal(r.startTime);
      if (r.endTime) end = input.atLocal(r.endTime);
      if (r.startTime || r.endTime) used.push(r.id);
    }
  }
  for (const r of here) {
    if (r.kind === 'OVERTIME' && r.minutes && end) {
      end = new Date(end.getTime() + r.minutes * 60_000);
      used.push(r.id);
    }
  }
  const changed = (a: Date | null, b: Date | null) => (a?.getTime() ?? null) !== (b?.getTime() ?? null);
  return {
    remoteApproved,
    expectedClockInAt: changed(start, input.expectedClockInAt) ? start : null,
    expectedClockOutAt: changed(end, input.expectedClockOutAt) ? end : null,
    requestIds: used,
  };
}

/** Informational flag on an entry whose away/remote work was approved in advance (never sends it to review). */
export const APPROVED_REMOTE_FLAG = 'APPROVED_REMOTE';
