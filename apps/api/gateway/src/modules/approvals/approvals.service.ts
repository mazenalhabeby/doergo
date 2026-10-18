import { Injectable, Logger, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  APPROVAL_KIND_SPECS,
  approvalRoute,
  countApprovals,
  dedupeApprovals,
  isAdmin,
  ruleKindOf,
  sortApprovals,
  toApproval,
  type ApprovalContext,
  type ApprovalDecision,
  type ApprovalItem,
  type ApprovalKind,
  type ApprovalsCount,
  type ApprovalsResponse,
} from '@hbcfield/shared';
import { ApprovalRulesClient } from './approval-rules.client';
import { selfDispatchBase, selfDispatchHeaders } from '../../common/self-dispatch';
import {
  SOURCE_TIMEOUT_MS,
  COUNT_TTL_MS,
  KNOWN_TTL_MS,
  MAX_SHARED_SPACES,
  ApprovalCaller,
  Row,
  firstStepOf,
  rows,
  entries,
  holdsAnywhere,
  mayDecide,
  whyCallerDecides,
} from './approvals-helpers';

import type { SessionUser } from '../../common/request.types';
import { callerOrgId } from '../../common/caller-org';
export { type ApprovalCaller, firstStepOf, mayDecide, whyCallerDecides } from './approvals-helpers';

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

  constructor(
    config: ConfigService,
    // Office rules' open first steps. Present in the app; absent only in narrow unit tests.
    @Optional() private readonly rules?: ApprovalRulesClient,
  ) {
    this.base = selfDispatchBase(config);
  }

  private readonly base: string;
  private readonly counts = new Map<string, { at: number; value: ApprovalsCount }>();
  /** The last inbox each person read, by `kind:id` — "who else can decide" answers only for these. */
  private readonly known = new Map<string, { at: number; items: Map<string, ApprovalItem> }>();

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
    const spaces = () =>
      (directory ??= get('/locations?kind=all&limit=200')
        .then(rows)
        .catch(() => []));

    const sources: Array<[ApprovalKind, () => Promise<ApprovalItem[]>]> = [];
    const add = (kind: ApprovalKind, read: () => Promise<ApprovalItem[]>) => {
      if (holds(kind)) sources.push([kind, read]);
    };
    add('hours', async () =>
      rows(await get('/attendance/approvals/pending?limit=100')).map((r) => toApproval.hours(r, ctx)),
    );
    add('away', async () =>
      rows(await get('/attendance/excursions?status=pending')).map((r) => toApproval.away(r, ctx)),
    );
    // Undecided ones of the last month; a RUN of misses (same person, same shift) is one item — its newest.
    add('noShow', async () =>
      rows(await get('/attendance/no-shows?days=30&open=true'))
        .filter((r) => (r.state === 'REMINDED' || r.state === 'ESCALATED') && r.runLatest !== false)
        .map((r) => toApproval.noShow(r, ctx)),
    );
    if (holds('extraTime') || isAdmin(user) || user.canManageUsers === true) {
      sources.push([
        'extraTime',
        async () => rows(await get('/attendance/extra-time/pending')).map((r) => toApproval.extraTime(r, ctx)),
      ]);
    }
    add('overtime', async () => rows(await get('/overtime/pending-approvals')).map((r) => toApproval.overtime(r, ctx)));
    add('request', async () =>
      rows(await get('/employees/time-off?status=PENDING')).map((r) => toApproval.request(r, ctx)),
    );
    add('issue', async () => {
      const issues = rows(await get('/shift-issues?status=OPEN')).filter((r) => r.reportedById !== user.id);
      if (!issues.length) return [];
      const names = new Map((await spaces()).map((s) => [String(s.id), String(s.name ?? '')]));
      return issues.map((r) => toApproval.issue(r, ctx, names));
    });
    add('expense', async () =>
      entries(await get('/assets/expenses/pending?limit=100'), 'entries').map((r) => toApproval.expense(r, ctx)),
    );
    add('assetProposal', async () =>
      entries(await get('/assets/proposals/pending'), 'proposals').map((r) => toApproval.assetProposal(r, ctx)),
    );
    add('document', async () =>
      rows(await get('/documents/awaiting-verification')).map((r) => toApproval.document(r, ctx)),
    );
    add('join', async () =>
      rows(await get('/join-requests?status=PENDING&limit=50')).map((r) => toApproval.join(r, ctx)),
    );
    // One read across the caller's portals (portal by portal, newest first), through the portal
    // route's own gate and scope — it used to be one read per portal.
    add('clientRequest', async () =>
      rows(await get('/portal/admin/requests/waiting'))
        .filter((r) => r.triaged === false)
        .map((r) => toApproval.clientRequest(r, ctx, String(r.portalId))),
    );
    add('guestRequest', async () => {
      const shared = (await spaces())
        .filter((s) => Array.isArray(s.enabledModules) && s.enabledModules.includes('space_sharing'))
        .slice(0, MAX_SHARED_SPACES);
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
    // Nor about the leader they stand in for: every kind refuses that (STAND_IN_FOR_SUBJECT).
    const covering = new Set<string>(
      ((user.access?.standingInFor ?? []) as Array<{ userId: string }>).map((f) => f.userId),
    );
    const decidable = sortApprovals(
      dedupeApprovals(items).filter(
        (i) => i.canDecide && i.subject.id !== user.id && !(i.subject.id && covering.has(i.subject.id)),
      ),
    );
    for (const i of decidable) i.why = whyCallerDecides(user, i);
    await this.attachSteps(user, decidable);
    this.counts.set(user.id, { at: Date.now(), value: countApprovals(decidable) });
    if (this.known.size > 2000) this.known.clear();
    this.known.set(user.id, { at: Date.now(), items: new Map(decidable.map((i) => [`${i.kind}:${i.id}`, i])) });
    return { items: decidable, unavailable: [...new Set(unavailable)], generatedAt: ctx.now.toISOString() };
  }

  /** Items half-way through an office rule's two approvals: who went first, who must finish. */
  private async attachSteps(user: SessionUser, items: ApprovalItem[]): Promise<void> {
    if (!this.rules) return;
    const keyOf = (i: ApprovalItem) => (i.kind === 'overtime' ? String(i.data.timeEntryId ?? '') : i.id);
    const asked = items
      .map((i) => ({ i, kind: ruleKindOf(i.kind), itemId: keyOf(i) }))
      .filter((x) => x.kind && x.itemId) as Array<{
      i: ApprovalItem;
      kind: NonNullable<ReturnType<typeof ruleKindOf>>;
      itemId: string;
    }>;
    if (!asked.length) return;
    try {
      const steps = await this.rules.steps(
        callerOrgId(user),
        asked.map(({ kind, itemId }) => ({ kind, itemId })),
      );
      const byKey = new Map(steps.map((s) => [`${s.kind}:${s.itemId}`, s]));
      for (const { i, kind, itemId } of asked) {
        const s = byKey.get(`${kind}:${itemId}`);
        if (s)
          i.step = {
            firstById: s.firstById,
            firstByName: s.firstByName,
            roleName: s.roleName,
            mine: s.firstById === user.id,
          };
      }
    } catch (e) {
      // The inbox still shows; a step that cannot be read is refused at the button with its reason.
      this.logger.warn(`approvals: steps unavailable for ${user.id}: ${(e as Error).message}`);
    }
  }

  /**
   * One item of the caller's OWN inbox — the last read, or a fresh one when it
   * is old or absent (another replica answered the list). Null when it is not
   * theirs to decide: nothing about an item is told to somebody who cannot see it.
   */
  async item(caller: ApprovalCaller, kind: ApprovalKind, id: string): Promise<ApprovalItem | null> {
    const key = `${kind}:${id}`;
    const hit = this.known.get(caller.user.id);
    if (hit && Date.now() - hit.at < KNOWN_TTL_MS && hit.items.has(key)) return hit.items.get(key)!;
    await this.list(caller);
    return this.known.get(caller.user.id)?.items.get(key) ?? null;
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
    if (res.ok) {
      // Step 1 of an office rule's two approvals: approved by them, still waiting for the second person.
      const step = firstStepOf(body);
      return {
        ok: true as const,
        status: res.status,
        ...(step ? { stage: 'FIRST_STEP' as const, waitingFor: step } : {}),
      };
    }
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
    this.known.delete(userId);
  }

  private async get(caller: ApprovalCaller, path: string): Promise<unknown> {
    const res = await fetch(`${this.base}${path}`, {
      headers: selfDispatchHeaders(caller),
      signal: AbortSignal.timeout(SOURCE_TIMEOUT_MS),
    });
    // Not theirs to read here (a module off, a plan, a workspace): nothing waits for them in it.
    if (res.status === 402 || res.status === 403 || res.status === 404) return [];
    if (!res.ok) throw new Error(`HTTP ${res.status} on ${path.split('?')[0]}`);
    return res.json();
  }
}
