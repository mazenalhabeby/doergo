import { leaveCostInBalanceYear } from '@hbcfield/shared/client';
import {
  REQUEST_LIMITS,
  isLeaveType,
  parseRequestInput,
  requestKindOf,
  type LeaveType,
  type RequestInput,
  type RequestInputError,
  type RequestKind,
} from '@hbcfield/shared/client';

/*
  REQUESTS ON THE PHONE — the words and the body, as plain functions.

  The rules are the shared contract's (`requests/request-kinds.ts`): what a
  kind is, what each kind carries, what is a valid request. This file only
  answers the phone's questions about it — which words name a request, how a
  form becomes a body — so the Requests tab, the Time tab, the manager's queue
  and the list rows read one map instead of four.

  No React, no i18n instance: keys out, tested on their own.
*/

/** A row as these helpers read it — the server's `TimeOffRequest`, or one still on the phone. */
export interface RequestLike {
  kind?: string | null;
  type?: string | null;
  reason?: string | null;
}

/** The i18n key of a kind's short name — "Leave", "Remote work", "Changed hours"… */
export const kindLabelKey = (kind: RequestKind): string => `requests.kind.${kind}`;
/** The i18n key of the one line under a kind in the chooser. */
export const kindHintKey = (kind: RequestKind): string => `requests.kindHint.${kind}`;
/** What approving this kind does, said before it is sent. LEAVE and OTHER say nothing extra. */
export const kindEffectKey = (kind: RequestKind): string | null =>
  kind === 'REMOTE' || kind === 'HOURS' || kind === 'OVERTIME' ? `requests.effect.${kind}` : null;

/** A leave type's i18n key — the catalogue the leave chips have always used (`timeOff.reasonTypes`). */
const LEAVE_TYPE_KEY: Record<LeaveType, string> = {
  VACATION: 'vacation',
  SICK: 'sickLeave',
  FAMILY: 'family',
  OTHER: 'other',
};
export const leaveTypeLabelKey = (type: LeaveType): string => `timeOff.reasonTypes.${LEAVE_TYPE_KEY[type]}`;
/** The Time tab's marks are named by the same keys. */
export const leaveTypeMarkKey = (type: LeaveType): 'vacation' | 'sickLeave' | 'family' | 'other' =>
  LEAVE_TYPE_KEY[type] as 'vacation' | 'sickLeave' | 'family' | 'other';

/*
  ⚠️ OLD PHONES WROTE THE KIND INTO THE REASON. Before requests, the phone sent
  `reason: "Sick Leave: flu"` and no `type` — so the server stored VACATION and
  the words carried the truth. A row like that still reads as what it was: when
  the reason opens with a leave label the reader knows (the member's language
  and English), that label is the title and the rest is the note. A new row
  carries `type` and a plain note, and a note that merely contains a colon is
  never split, because its prefix is not a label.
*/
export function splitLegacyReason(
  reason: string | null | undefined,
  legacyLabels: Readonly<Record<string, LeaveType>>,
): { type: LeaveType | null; note: string } {
  const text = (reason ?? '').trim();
  if (!text) return { type: null, note: '' };
  const colon = text.indexOf(':');
  const head = (colon >= 0 ? text.slice(0, colon) : text).trim().toLowerCase();
  const type = legacyLabels[head];
  if (!type) return { type: null, note: text };
  return { type, note: colon >= 0 ? text.slice(colon + 1).trim() : '' };
}

/** What a request is called, and the words that go under it. */
export function describeRequest(
  r: RequestLike,
  legacyLabels: Readonly<Record<string, LeaveType>> = {},
): { kind: RequestKind; titleKey: string; leaveType: LeaveType | null; note: string } {
  const kind = requestKindOf(r.kind);
  if (kind !== 'LEAVE') return { kind, titleKey: kindLabelKey(kind), leaveType: null, note: (r.reason ?? '').trim() };
  const legacy = splitLegacyReason(r.reason, legacyLabels);
  // A stored type other than the default is a real choice; VACATION is also what an old row defaulted to.
  const stored = isLeaveType(r.type) ? r.type : null;
  const leaveType = stored && stored !== 'VACATION' ? stored : legacy.type ?? stored;
  return {
    kind,
    titleKey: leaveType ? leaveTypeLabelKey(leaveType) : kindLabelKey('LEAVE'),
    leaveType,
    note: legacy.note,
  };
}

/** Build the legacy-label lookup from label texts per type (any number of languages). */
export function legacyLabelMap(labels: ReadonlyArray<[LeaveType, string]>): Record<string, LeaveType> {
  const out: Record<string, LeaveType> = {};
  for (const [type, label] of labels) if (label) out[label.trim().toLowerCase()] = type;
  return out;
}

/* ---------------- the form ---------------- */

/** Everything the request form can hold; each kind reads only its own fields. */
export interface RequestDraft {
  kind: RequestKind;
  startDate: string | null;
  endDate?: string | null;
  type?: LeaveType;
  spaceId?: string | null;
  startTime?: string | null;
  endTime?: string | null;
  minutes?: number | null;
  reason?: string;
}

/** The request as the endpoint takes it — the contract's input, `kind` optional (absent = LEAVE). */
export type RequestBody = Omit<RequestInput, 'kind'> & { kind?: RequestKind };

/**
 * A draft → the body to send, validated by the SAME function the server runs.
 *
 * ⚠️ A LEAVE BODY CARRIES NO `kind`, and no field is sent empty. The contract
 * reads a missing kind as LEAVE; a server from before requests rejects any
 * field it does not know (`forbidNonWhitelisted`), so leave stays sendable to
 * it — exactly the body old phones sent, plus the leave type it already took.
 */
export function draftToBody(draft: RequestDraft): { ok: true; body: RequestBody } | { ok: false; code: RequestInputError } {
  if (!draft.startDate) return { ok: false, code: 'REQUEST_DATES_INVALID' };
  const oneDay = draft.kind === 'HOURS' || draft.kind === 'OVERTIME';
  const parsed = parseRequestInput({
    kind: draft.kind,
    startDate: draft.startDate,
    endDate: oneDay ? draft.startDate : draft.endDate || draft.startDate,
    type: draft.kind === 'LEAVE' ? draft.type ?? 'VACATION' : undefined,
    spaceId: draft.spaceId ?? null,
    startTime: draft.startTime ?? null,
    endTime: draft.endTime ?? null,
    minutes: draft.minutes ?? null,
    reason: draft.reason ?? '',
  });
  if (parsed.ok === false) return { ok: false, code: parsed.code };
  const body: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(parsed.value)) {
    if (v === null || v === undefined || v === '') continue;
    if (k === 'kind' && v === 'LEAVE') continue;
    body[k] = v;
  }
  return { ok: true, body: body as RequestBody };
}

/** The overtime presets, in minutes. */
export const OVERTIME_PRESETS = [30, 60, 120] as const;

/** Step a custom overtime amount by a quarter hour, inside the contract's limits. */
export function stepOvertime(minutes: number, dir: 1 | -1): number {
  const next = Math.round(minutes / 15) * 15 + dir * 15;
  return Math.min(REQUEST_LIMITS.OVERTIME_MAX_MINUTES, Math.max(REQUEST_LIMITS.OVERTIME_MIN_MINUTES, next));
}

/* ---------------- the leave preview ---------------- */

/**
 * The allowance before and after this leave, for VACATION only (the only type
 * the allowance pays for). "Before" is what is left once requests already
 * waiting are counted — the number the member would actually draw on — and
 * "after" takes off what this request costs THIS year (a request over New Year
 * draws on next year's allowance for its January days). With a leave year
 * from the server (a work year runs e.g. 15 Apr – 14 Apr), "this year" is the
 * request's days inside THAT year, read from the count's own days.
 */
export function balancePreview(
  balance: { year: number; remaining: number; pending: number; leaveYear?: { start: string; end: string } | null } | null | undefined,
  cost: { counted: number; byYear?: Record<string, number>; byLeaveYear?: Record<string, number>; days?: ReadonlyArray<{ day: string; cost: number }> } | null | undefined,
  type: LeaveType,
): { before: number; after: number } | null {
  if (!balance || !cost || type !== 'VACATION') return null;
  // Only the days inside THIS balance's leave year — the shared rule (leave/leave-api.ts).
  const ly = balance.leaveYear;
  const thisYear = cost.byLeaveYear || !ly || !cost.days
    ? leaveCostInBalanceYear(balance, cost)
    // A server before byLeaveYear: the per-day costs still say which year each day is in.
    : cost.days.reduce((s, d) => (d.day >= ly.start && d.day <= ly.end ? s + d.cost : s), 0);
  const before = balance.remaining - balance.pending;
  return { before, after: before - thisYear };
}

/** "10:00–16:00", "from 10:00", "until 16:00" — the facts of a changed day, as keys + values. */
export function hoursFact(startTime?: string | null, endTime?: string | null): { key: string; values: Record<string, string> } | null {
  if (startTime && endTime) return { key: 'requests.facts.between', values: { start: startTime, end: endTime } };
  if (startTime) return { key: 'requests.facts.startsAt', values: { time: startTime } };
  if (endTime) return { key: 'requests.facts.endsAt', values: { time: endTime } };
  return null;
}

/* ---------------- a request still on the phone ---------------- */

/**
 * A request still in the outbox, drawn as the server will draw it.
 *
 * ⚠️ EVERY FIELD OF THE BODY TRAVELS — kind, leave type, workspace, times,
 * minutes. A queued remote day must read as a remote day in the list, not as
 * leave (an absent `kind` reads as LEAVE everywhere).
 */
export function queuedRequestRow(p: { id: string; body: RequestBody; createdAt: number }, technicianId: string) {
  const at = new Date(p.createdAt).toISOString();
  const b = p.body;
  return {
    id: p.id,
    technicianId,
    startDate: b.startDate,
    endDate: b.endDate,
    reason: b.reason ?? undefined,
    kind: b.kind ?? ('LEAVE' as RequestKind),
    type: b.type ?? null,
    spaceId: b.spaceId ?? null,
    startTime: b.startTime ?? null,
    endTime: b.endTime ?? null,
    minutes: b.minutes ?? null,
    status: 'PENDING' as const,
    createdAt: at,
    updatedAt: at,
    pendingSync: true as const,
  };
}
