import { ORG_FLAG_BRIDGES } from '../access/org-flags';
import { accessAllows, accessAllowsAnywhere, type ResolvedAccess } from '../types/permissions';
import { APPROVAL_KIND_SPECS, type ApprovalKind } from './approval-kinds';

/**
 * WHY somebody may decide an approval — the same question the kind's own guard
 * asks (`@RequirePermission` / `@RequirePermissionInSpace` on its decide key,
 * the org half with the org-flag bridges), answered as a reason the screen can
 * say: "you're an administrator", "your role lets you approve hours everywhere",
 * "you approve hours at Binderholz".
 *
 *   ADMIN      the organization's administrators
 *   ORG        the key held org-wide (a role, or a broader key bridged to it)
 *   SPACE      the key held in THIS workspace
 *   ASSIGNED   the item was given to them (a shift issue)
 *   DELEGATED  somebody handed them their decisions for these days
 */
export type DecideVia = 'ADMIN' | 'ORG' | 'SPACE' | 'ASSIGNED' | 'DELEGATED';

/** One person who could decide an item, as "who else can decide" lists them. */
export interface ApprovalDecider {
  id: string;
  name: string;
  avatarUrl: string | null;
  via: DecideVia;
  /** On approved leave today — the inbox says so rather than leaving the item waiting on them. */
  onLeave: boolean;
}

/** "Who else" for one item: who could decide it, and who is told about the person. */
export interface ApprovalRouting {
  deciders: ApprovalDecider[];
  /** More deciders than listed (the list is capped). */
  moreDeciders: number;
  /** Told about this person (their watchers and the workspace's notify routing) — informed, not deciding. */
  told: Array<{ id: string; name: string }>;
}

/** The key held org-wide, with the org-flag bridges the request user's flags carry. */
function holdsOrgWide(access: ResolvedAccess, key: string): boolean {
  if (accessAllows(access, key as never)) return true;
  const bridges = (ORG_FLAG_BRIDGES as Record<string, readonly string[] | undefined>)[key] ?? [];
  return bridges.some((b) => accessAllows(access, b as never));
}

/**
 * Could a person with this access decide this kind here — and through what?
 * `spaceId` null on a workspace kind (an expense: the asset's workspace is not
 * on the item) means "in some workspace" — the kind's own route narrows it.
 */
export function decideVia(
  who: { isAdmin: boolean; access: ResolvedAccess | null | undefined },
  kind: ApprovalKind,
  spaceId: string | null,
): Exclude<DecideVia, 'ASSIGNED' | 'DELEGATED'> | null {
  if (who.isAdmin) return 'ADMIN';
  const access = who.access;
  if (!access) return null;
  const spec = APPROVAL_KIND_SPECS[kind];
  if (holdsOrgWide(access, spec.decideKey)) return 'ORG';
  if (spec.orgWide) return null;
  if (spaceId) return access.perSpace?.[spaceId]?.[spec.decideKey as never] === true ? 'SPACE' : null;
  return accessAllowsAnywhere(access, spec.decideKey as never) ? 'SPACE' : null;
}

/** "Who else can decide" order: on duty first, then the closest authority (the workspace's own), then name. */
export function sortDeciders(list: ApprovalDecider[]): ApprovalDecider[] {
  const rank: Record<DecideVia, number> = { ASSIGNED: 0, DELEGATED: 1, SPACE: 2, ORG: 3, ADMIN: 4 };
  return [...list].sort((a, b) =>
    Number(a.onLeave) - Number(b.onLeave) || rank[a.via] - rank[b.via] || a.name.localeCompare(b.name));
}

/** The longest single hand-over — a holiday, not a reorganization. */
export const DELEGATION_MAX_DAYS = 60;

/** One hand-over of approval decisions, as the screens list it. */
export interface StandInView {
  id: string;
  from: { id: string; name: string };
  to: { id: string; name: string };
  /** Whole days, YYYY-MM-DD, inclusive, the organization's days. */
  startsOn: string;
  endsOn: string;
  note: string | null;
  /** Running today. */
  active: boolean;
  /** May the reader end it (the leader, the stand-in, or somebody who manages people). */
  canEnd: boolean;
}

export interface StandInsResponse {
  /** The reader's own hand-overs (they are away). */
  given: StandInView[];
  /** Hand-overs to the reader (they cover). */
  received: StandInView[];
  /** Everybody else's, for somebody who manages people — current and upcoming. */
  others: StandInView[];
  /** May the reader hand over their own decisions (they hold at least one approval permission)? */
  mayHandOver: boolean;
  /** May the reader set one up for somebody else? */
  mayArrange: boolean;
  /**
   * Who may be chosen: the colleagues who share a workspace with the reader
   * (everybody internal, for somebody who manages people). Never external members.
   */
  candidates: Array<{ id: string; name: string }>;
  /** Leaders the reader may arrange for (people managers only): everybody holding an approval permission. */
  leaders: Array<{ id: string; name: string }>;
}

export interface StandInInput {
  toUserId: string;
  startsOn: string;
  endsOn: string;
  note?: string | null;
  /** Somebody else's decisions — only for whoever manages people. */
  fromUserId?: string | null;
}

/**
 * The dates of a hand-over, checked the same on both ends. `today` is the
 * organization's day (YYYY-MM-DD). Null = fine, else the refusal code.
 */
export function standInDatesProblem(startsOn: string, endsOn: string, today: string, maxDays: number):
  | null | 'STAND_IN_DATES_INVALID' | 'STAND_IN_IN_THE_PAST' | 'STAND_IN_TOO_LONG' {
  const iso = /^\d{4}-\d{2}-\d{2}$/;
  if (!iso.test(startsOn) || !iso.test(endsOn)) return 'STAND_IN_DATES_INVALID';
  const s = Date.parse(`${startsOn}T00:00:00Z`);
  const e = Date.parse(`${endsOn}T00:00:00Z`);
  if (Number.isNaN(s) || Number.isNaN(e) || e < s) return 'STAND_IN_DATES_INVALID';
  if (endsOn < today) return 'STAND_IN_IN_THE_PAST';
  if ((e - s) / 86_400_000 + 1 > maxDays) return 'STAND_IN_TOO_LONG';
  return null;
}
