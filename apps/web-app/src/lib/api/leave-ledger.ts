import { call, type ApiResponse } from '../http-client';
import { apiError } from '../server-error';
import { employeesEndpoints, type LeaveAdjustmentInput } from '@hbcfield/shared/client';
import type { LeaveAdjustmentDto, LeaveLedger, LeaveOpening, OpeningBalanceMatch, OpeningBalanceRowDto } from './types/leave-ledger';

/** The leave ledger's routes — one place for every path: the shared endpoint table (employeesEndpoints). */

/* ------------------------------------------------------------------ normalizing */

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => !!v && typeof v === 'object' && !Array.isArray(v);

/** `{ data: T }`, `{ success, data }` or a bare `T` — the body the screen wants. */
export function unwrapBody(body: unknown): unknown {
  return isObj(body) && 'data' in body ? body.data : body;
}

/** The ledger response: `{ leaveYear, items, canEdit }`; a bare array (an early server) reads as not editable. */
export function toLeaveLedger(body: unknown): LeaveLedger {
  const b = unwrapBody(body);
  if (Array.isArray(b)) return { leaveYear: null, items: b as LeaveAdjustmentDto[], canEdit: false };
  const o = isObj(b) ? b : {};
  return {
    leaveYear: (o.leaveYear as LeaveLedger['leaveYear']) ?? null,
    items: Array.isArray(o.items) ? (o.items as LeaveAdjustmentDto[]) : [],
    canEdit: o.canEdit === true,
  };
}

/** The starting balances: `{ rows, trackingStartedOn, mode }`, or a bare array of rows. */
export function toLeaveOpening(body: unknown): LeaveOpening {
  const b = unwrapBody(body);
  if (Array.isArray(b)) return { rows: b as OpeningBalanceRowDto[] };
  const o = isObj(b) ? b : {};
  return {
    rows: Array.isArray(o.rows) ? (o.rows as OpeningBalanceRowDto[]) : [],
    ...('trackingStartedOn' in o ? { trackingStartedOn: (o.trackingStartedOn as string | null) ?? null } : {}),
    ...(typeof o.mode === 'string' ? { mode: o.mode as LeaveOpening['mode'] } : {}),
  };
}

/** The server's match (`matched` with names) as rows the table can fill, and lines it could not place. */
export function toOpeningMatch(body: unknown): OpeningBalanceMatch {
  const o = (isObj(unwrapBody(body)) ? unwrapBody(body) : {}) as Obj;
  const matched = (Array.isArray(o.matched) ? o.matched : Array.isArray(o.rows) ? o.rows : []) as Obj[];
  const unmatched = (Array.isArray(o.unmatched) ? o.unmatched : []) as Obj[];
  const errors = (Array.isArray(o.errors) ? o.errors : []) as Obj[];
  return {
    rows: matched.map((m) => ({
      line: Number(m.line) || 0,
      userId: String(m.userId ?? ''),
      name: typeof m.name === 'string' ? m.name : `${m.firstName ?? ''} ${m.lastName ?? ''}`.trim(),
      used: Number(m.used) || 0,
      carried: Number(m.carried) || 0,
    })).filter((m) => m.userId),
    unmatched: unmatched.map((u) => ({
      line: Number(u.line) || 0,
      text: String(u.person ?? u.text ?? ''),
      ...(typeof u.reason === 'string' ? { reason: u.reason as OpeningBalanceMatch['unmatched'][number]['reason'] } : {}),
    })),
    errors: errors.map((e) => ({ line: Number(e.line) || 0, text: String(e.text ?? '') })),
  };
}

function fail(response: ApiResponse<unknown>): never {
  throw apiError(response);
}

export const leaveLedgerApi = {
  /**
   * A member's lines for the leave year containing `on` (YYYY-MM-DD).
   * `null` = the server does not have the ledger yet (404) — the screen then
   * shows today's simple balance and no ledger at all.
   */
  getAdjustments: async (memberId: string, on?: string): Promise<LeaveLedger | null> => {
    const response = await call(employeesEndpoints.leaveAdjustments, { id: memberId, on });
    if (response.status === 404) return null;
    if (response.error) fail(response);
    return toLeaveLedger(response.data);
  },

  /** A hand-entered line — always shaped by `parseLeaveAdjustment` first. */
  addAdjustment: async (memberId: string, input: LeaveAdjustmentInput) => {
    const response = await call(employeesEndpoints.addLeaveAdjustment, { id: memberId }, { body: input });
    if (response.error) fail(response);
    return unwrapBody(response.data);
  },

  /** Undo a line. It stays in the ledger, struck through, with who undid it. */
  voidAdjustment: async (adjustmentId: string) => {
    const response = await call(employeesEndpoints.voidLeaveAdjustment, { adjustmentId });
    if (response.error) fail(response);
    return unwrapBody(response.data);
  },

  /** Everybody in scope and what is already saved as their starting balance. `null` = no ledger on this server. */
  getOpening: async (on: string): Promise<LeaveOpening | null> => {
    const response = await call(employeesEndpoints.leaveOpening, { on });
    if (response.status === 404) return null;
    if (response.error) fail(response);
    return toLeaveOpening(response.data);
  },

  /** The whole table in one request. */
  saveOpening: async (on: string, rows: Array<{ userId: string; used: number; carried: number }>) => {
    const response = await call(employeesEndpoints.saveLeaveOpening, undefined, { body: { on, rows } });
    if (response.error) fail(response);
    return unwrapBody(response.data);
  },

  /** Pasted text from the old system → people the SERVER matched; ids are never taken from the text. */
  matchOpening: async (text: string): Promise<OpeningBalanceMatch> => {
    const response = await call(employeesEndpoints.matchLeaveOpening, undefined, { body: { text } });
    if (response.error) fail(response);
    return toOpeningMatch(response.data);
  },
};
