import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  APPROVAL_KIND_SPECS,
  accessAllowsAnywhere,
  approvalRoute,
  countApprovals,
  dedupeApprovals,
  isAdmin,
  sortApprovals,
  toApproval,
  type AccessPermissionKey,
  type ApprovalContext,
  type ApprovalDecision,
  type ApprovalItem,
  type ApprovalKind,
  type ApprovalsCount,
  type ApprovalsResponse,
} from '@hbcfield/shared';
import { scopeFor } from '../../common/permission-scope';
import { selfDispatchBase, selfDispatchHeaders, type SelfDispatchCaller } from '../../common/self-dispatch';

/** One existing list may take this long; past it, its kind is "unavailable" and the rest still shows. */
const SOURCE_TIMEOUT_MS = 8_000;
/** The badge is asked often (every page, every focus): answered from a short per-person cache. */
const COUNT_TTL_MS = 20_000;
/** Fan-outs are bounded: a portal or a shared workspace past this is reached through its own page. */
const MAX_PORTALS = 20;
const MAX_SHARED_SPACES = 20;

export interface ApprovalCaller extends SelfDispatchCaller {
  user: any;
}

type Row = Record<string, any>;

/**
 * The approvals inbox — reads thirteen EXISTING pending lists and decides
 * through their EXISTING actions, always as the caller (`self-dispatch`), so
 * every guard, workspace scope and service rule applies exactly as on the
 * kind's own page. Nothing here grants or narrows anything.
 *
 * ⚠️ Only what the caller may DECIDE is listed — the inbox is what waits for
 * them. A list is not even asked for when they hold its permission nowhere.
 */
@Injectable()
export class ApprovalsService {
  private readonly logger = new Logger(ApprovalsService.name);
  private readonly base: string;
  private readonly counts = new Map<string, { at: number; value: ApprovalsCount }>();

  constructor(config: ConfigService) {
    this.base = selfDispatchBase(config);
  }

  async list(caller: ApprovalCaller): Promise<ApprovalsResponse> {
    const user = caller.user;
    const ctx: ApprovalContext = {
      now: new Date(),
      me: user.id,
      mayDecide: (kind, spaceId) => mayDecide(user, kind, spaceId),
      currency: typeof user?.orgCurrency === 'string' ? user.orgCurrency : null,
    };
    const get = (path: string) => this.get(caller, path);
    const holds = (kind: ApprovalKind) => holdsAnywhere(user, APPROVAL_KIND_SPECS[kind].decideKey);
    const unavailable: ApprovalKind[] = [];
    let directory: Promise<Row[]> | null = null;
    const spaces = () => (directory ??= get('/locations?kind=all&limit=200').then(rows).catch(() => []));

    const sources: Array<[ApprovalKind, () => Promise<ApprovalItem[]>]> = [];
    const add = (kind: ApprovalKind, read: () => Promise<ApprovalItem[]>) => {
      if (holds(kind)) sources.push([kind, read]);
    };
    add('hours', async () => rows(await get('/attendance/approvals/pending?limit=100')).map((r) => toApproval.hours(r, ctx)));
    add('away', async () => rows(await get('/attendance/excursions?status=pending')).map((r) => toApproval.away(r, ctx)));
    add('noShow', async () =>
      rows(await get('/attendance/no-shows?days=7'))
        .filter((r) => r.state === 'REMINDED' || r.state === 'ESCALATED')
        .map((r) => toApproval.noShow(r, ctx)),
    );
    if (holds('extraTime') || isAdmin(user) || user.canManageUsers === true) {
      sources.push(['extraTime', async () => rows(await get('/attendance/extra-time/pending')).map((r) => toApproval.extraTime(r, ctx))]);
    }
    add('overtime', async () => rows(await get('/overtime/pending-approvals')).map((r) => toApproval.overtime(r, ctx)));
    add('request', async () => rows(await get('/employees/time-off?status=PENDING')).map((r) => toApproval.request(r, ctx)));
    add('issue', async () => {
      const issues = rows(await get('/shift-issues?status=OPEN')).filter((r) => r.reportedById !== user.id);
      if (!issues.length) return [];
      const names = new Map((await spaces()).map((s) => [String(s.id), String(s.name ?? '')]));
      return issues.map((r) => toApproval.issue(r, ctx, names));
    });
    add('expense', async () => entries(await get('/assets/expenses/pending?limit=100'), 'entries').map((r) => toApproval.expense(r, ctx)));
    add('assetProposal', async () => entries(await get('/assets/proposals/pending'), 'proposals').map((r) => toApproval.assetProposal(r, ctx)));
    add('document', async () => rows(await get('/documents/awaiting-verification')).map((r) => toApproval.document(r, ctx)));
    add('join', async () => rows(await get('/join-requests?status=PENDING&limit=50')).map((r) => toApproval.join(r, ctx)));
    add('clientRequest', async () => {
      const portals = rows(await get('/portal/admin/portals')).slice(0, MAX_PORTALS);
      const lists = await Promise.all(
        portals.map(async (p) =>
          rows(await get(`/portal/admin/portals/${encodeURIComponent(p.id)}/requests`))
            .filter((r) => r.triaged === false)
            .map((r) => toApproval.clientRequest(r, ctx, String(p.id))),
        ),
      );
      return lists.flat();
    });
    add('guestRequest', async () => {
      const shared = (await spaces()).filter((s) => Array.isArray(s.enabledModules) && s.enabledModules.includes('space_sharing')).slice(0, MAX_SHARED_SPACES);
      const lists = await Promise.all(
        shared.map(async (s) =>
          rows(await get(`/locations/${encodeURIComponent(s.id)}/share-requests?status=PENDING`)).map((r) =>
            toApproval.guestRequest(r, ctx, { id: String(s.id), name: String(s.name ?? '') }),
          ),
        ),
      );
      return lists.flat();
    });

    const settled = await Promise.allSettled(sources.map(([, read]) => read()));
    const items: ApprovalItem[] = [];
    settled.forEach((r, i) => {
      if (r.status === 'fulfilled') items.push(...r.value);
      else {
        unavailable.push(sources[i]![0]);
        this.logger.warn(`approvals: ${sources[i]![0]} unavailable for ${user.id}: ${(r.reason as Error)?.message}`);
      }
    });
    // Never your own: every kind refuses deciding about yourself (SELF_DECISION), so it is not yours to see here.
    const decidable = sortApprovals(dedupeApprovals(items).filter((i) => i.canDecide && i.subject.id !== user.id));
    this.counts.set(user.id, { at: Date.now(), value: countApprovals(decidable) });
    return { items: decidable, unavailable: [...new Set(unavailable)], generatedAt: ctx.now.toISOString() };
  }

  async count(caller: ApprovalCaller): Promise<ApprovalsCount> {
    const hit = this.counts.get(caller.user.id);
    if (hit && Date.now() - hit.at < COUNT_TTL_MS) return hit.value;
    await this.list(caller);
    return this.counts.get(caller.user.id)!.value;
  }

  /**
   * A decision, through the kind's EXISTING route as the caller. Returns what
   * that route answered (its code and message travel), so a refusal reads the
   * same as on the kind's own page.
   */
  async decide(caller: ApprovalCaller, decision: ApprovalDecision) {
    const route = approvalRoute(decision);
    if (!route.ok) return { ok: false as const, status: 400, code: route.code, params: { field: route.field } };
    const res = await fetch(`${this.base}${route.path}`, {
      method: route.method,
      headers: selfDispatchHeaders(caller),
      body: JSON.stringify(route.body),
      signal: AbortSignal.timeout(20_000),
    });
    const body = (await res.json().catch(() => undefined)) as any;
    this.counts.delete(caller.user.id);
    if (res.ok) return { ok: true as const, status: res.status };
    return {
      ok: false as const,
      status: res.status,
      code: typeof body?.code === 'string' ? body.code : `HTTP_${res.status}`,
      message: typeof body?.message === 'string' ? body.message : undefined,
      params: body?.params && typeof body.params === 'object' ? body.params : undefined,
    };
  }

  /** Forget a person's cached count (a socket event said something changed). */
  forget(userId: string) {
    this.counts.delete(userId);
  }

  private async get(caller: ApprovalCaller, path: string): Promise<unknown> {
    const res = await fetch(`${this.base}${path}`, { headers: selfDispatchHeaders(caller), signal: AbortSignal.timeout(SOURCE_TIMEOUT_MS) });
    // Not theirs to read here (a module off, a plan, a workspace): nothing waits for them in it.
    if (res.status === 402 || res.status === 403 || res.status === 404) return [];
    if (!res.ok) throw new Error(`HTTP ${res.status} on ${path.split('?')[0]}`);
    return res.json();
  }
}

/** A list response as rows, whatever the envelope ({data:[…]}, paginated, or a bare array). */
function rows(body: unknown): Row[] {
  const b = body as any;
  if (Array.isArray(b)) return b;
  if (Array.isArray(b?.data)) return b.data;
  if (Array.isArray(b?.data?.data)) return b.data.data;
  return [];
}
function entries(body: unknown, key: string): Row[] {
  const b = body as any;
  const v = b?.data?.[key] ?? b?.[key];
  return Array.isArray(v) ? v : [];
}

function holdsAnywhere(user: any, key: AccessPermissionKey): boolean {
  return isAdmin(user) || user?.[key] === true || accessAllowsAnywhere(user?.access, key);
}

/**
 * Would the kind's action route let this caller decide here? The same rule its
 * guard reads (`scopeFor`: the org flag first, then the workspaces granting it).
 * Only decides whether buttons show — the route checks again when pressed.
 */
export function mayDecide(user: any, kind: ApprovalKind, spaceId: string | null): boolean {
  const spec = APPROVAL_KIND_SPECS[kind];
  const scope = scopeFor(user, spec.decideKey);
  if (scope === null) return true;
  if (spec.orgWide) return false;
  // A row that names no workspace (an expense, a proposal): the route checks the record's own.
  if (!spaceId) return scope.length > 0;
  return scope.includes(spaceId);
}
