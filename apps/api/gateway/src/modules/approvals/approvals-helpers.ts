/** Module-level helpers of approvals.service.ts — moved here unchanged. */
import {
  APPROVAL_KIND_SPECS,
  accessAllowsAnywhere,
  isAdmin,
  JOIN_REQUEST_MAX_PENDING_PER_ORG,
  orgFlagFields,
  ownAccess,
  spacesGranting,
  type AccessPermissionKey,
  type ApprovalItem,
  type ApprovalKind,
} from '@hbcfield/shared';
import { scopeFor } from '../../common/permission-scope';
import { type SelfDispatchCaller } from '../../common/self-dispatch';

import type { SessionUser } from '../../common/request.types';
import type { ResolvedAccess } from '@hbcfield/shared';
/** One existing list may take this long; past it, its kind is "unavailable" and the rest still shows. */
const SOURCE_TIMEOUT_MS = 8_000;
/** One page of a long list (hours, expenses) — the most a list endpoint returns. */
const INBOX_PAGE = 200;
/** Every join request an organization can have waiting. */
const JOINS_PENDING = `/join-requests?status=PENDING&limit=${JOIN_REQUEST_MAX_PENDING_PER_ORG}`;

/** The badge is asked often (every page, every focus): answered from a short per-person cache. */
const COUNT_TTL_MS = 20_000;

/** How long a read inbox vouches for its items ("who else can decide" asks about one of them). */
const KNOWN_TTL_MS = 10 * 60_000;

/** Fan-outs are bounded: a shared workspace past this is reached through its own page (portals: task-service). */
const MAX_SHARED_SPACES = 20;

export interface ApprovalCaller extends SelfDispatchCaller {
  user: SessionUser;
}

type Row = Record<string, any>;

/** The role a FIRST_STEP answer waits for, whatever envelope the kind's route wraps it in. */
export function firstStepOf(body: unknown): string | null {
  let b = body as any;
  for (let depth = 0; b && typeof b === 'object' && depth < 3; depth++) {
    if (b.stage === 'FIRST_STEP') return typeof b.waitingFor === 'string' ? b.waitingFor : '';
    b = b.data;
  }
  return null;
}

/** A list response as rows, whatever the envelope ({data:[…]}, paginated, or a bare array). */
function rows(body: unknown): Row[] {
  const b = body as any;
  if (Array.isArray(b)) return b;
  if (Array.isArray(b?.data)) return b.data;
  if (Array.isArray(b?.data?.data)) return b.data.data;
  return [];
}

/**
 * How many wait beyond the rows returned — a list that says its total (`meta.total` when paginated,
 * `total` beside the rows). 0 when it does not say, or nothing is left out.
 */
function leftOut(body: unknown, shown: number): number {
  const b = body as any;
  const total = b?.meta?.total ?? b?.data?.meta?.total ?? b?.data?.total ?? b?.total;
  return typeof total === 'number' && total > shown ? total - shown : 0;
}

/** One page of a long list, OLDEST first and never the caller's own, with how many more wait. */
async function oldestPage(
  get: (path: string) => Promise<unknown>,
  path: string,
  pick: (body: unknown) => Row[],
): Promise<{ list: Row[]; left: number }> {
  const body = await get(`${path}?limit=${INBOX_PAGE}&order=oldest`);
  const list = pick(body);
  return { list, left: leftOut(body, list.length) };
}

function entries(body: unknown, key: string): Row[] {
  const b = body as any;
  const v = b?.data?.[key] ?? b?.[key];
  return Array.isArray(v) ? v : [];
}

function holdsAnywhere(user: SessionUser, key: AccessPermissionKey): boolean {
  return isAdmin(user) || user?.[key] === true || accessAllowsAnywhere(user?.access, key);
}

/**
 * Would the kind's action route let this caller decide here? The same rule its
 * guard reads (`scopeFor`: the org flag first, then the workspaces granting it).
 * Only decides whether buttons show — the route checks again when pressed.
 */
export function mayDecide(user: SessionUser, kind: ApprovalKind, spaceId: string | null): boolean {
  const spec = APPROVAL_KIND_SPECS[kind];
  const scope = scopeFor(user, spec.decideKey);
  if (scope === null) return true;
  if (spec.orgWide) return false;
  // A row that names no workspace (an expense, a proposal): the route checks the record's own.
  if (!spaceId) return scope.length > 0;
  return scope.includes(spaceId);
}

/** Why the caller may decide this item — said on the item ("you approve hours at Binderholz", "covering for Anna"). */
export function whyCallerDecides(user: SessionUser, item: ApprovalItem): NonNullable<ApprovalItem['why']> {
  if (isAdmin(user)) return { via: 'ADMIN' };
  const spec = APPROVAL_KIND_SPECS[item.kind];
  const spaceId = item.space?.id ?? null;
  // Through their OWN access first; a stand-in's borrowed keys only explain what is left.
  const own = scopeForOwn(user, spec.decideKey);
  if (own === null) return { via: 'ORG' };
  if (!spec.orgWide && (spaceId ? own.includes(spaceId) : own.length > 0)) return { via: 'SPACE' };
  if (item.kind === 'issue' && !mayDecide(user, item.kind, spaceId)) return { via: 'ASSIGNED' };
  const from = (user.access?.standingInFor ?? []) as Array<{ name: string }>;
  return from.length ? { via: 'DELEGATED', fromName: from.map((f) => f.name).join(', ') } : { via: 'SPACE' };
}

/** `scopeFor` on the caller's OWN access (the org flag is the merged one; re-derive it from own access). */
function scopeForOwn(user: SessionUser, key: string): string[] | null {
  const own = ownAccess(user.access);
  if (own === user.access) return scopeFor(user, key as never);
  // `own` differs from `access` only while standing in, so it is set here.
  return holdsOrgWideOwn(own as ResolvedAccess, key) ? null : (spacesGranting(own, key as never) ?? []);
}

function holdsOrgWideOwn(access: ResolvedAccess, key: string): boolean {
  const flags = orgFlagFields(access) as Record<string, boolean>;
  return flags[key] === true;
}

export {
  SOURCE_TIMEOUT_MS,
  COUNT_TTL_MS,
  KNOWN_TTL_MS,
  MAX_SHARED_SPACES,
  Row,
  rows,
  oldestPage,
  JOINS_PENDING,
  entries,
  holdsAnywhere,
  scopeForOwn,
  holdsOrgWideOwn,
};
