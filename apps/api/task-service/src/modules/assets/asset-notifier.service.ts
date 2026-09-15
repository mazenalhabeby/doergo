import { Inject, Injectable, Logger } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { Role, activeAssignmentWhere, type HandoverPlan } from '@hbcfield/shared';
import { PrismaService } from '../../common/prisma/prisma.service';
import { NotificationRoutingService } from '../../common/notification-routing.service';

/** Holding any of these, org-wide, is what lets somebody open the register. */
const SEES_ASSETS = ['canViewAllTasks', 'canManageAssets', 'canManageUsers'] as const;
/** Holding any of these, org-wide, is what lets somebody DECIDE on the register. */
const ACTS_ON_ASSETS = ['canManageAssets', 'canManageUsers'] as const;

function grants(permissions: unknown, keys: readonly string[]): boolean {
  const p = (permissions ?? {}) as Record<string, unknown>;
  return keys.some((k) => p[k] === true);
}

/**
 * Who is told about the organization's things, and with what.
 *
 * This service DECIDES WHO; the notification service only delivers. That split
 * is the one every other routed notification here already follows (leave,
 * shift issues, proposals), and it is why the rules below can be tested against
 * a database shape rather than a socket.
 *
 * ⚠️ EVERY EMIT IS BEST EFFORT. An expense that failed to announce is still in
 * the queue, and a handover that failed to announce is still written. Failing
 * the member's filing — at a petrol pump, on one bar of signal — because a
 * notification could not be routed would lose the only copy of what they typed.
 *
 * ⚠️ A BODY CARRIES AN ASSET'S NAME, SO EVERY RECIPIENT MUST BE ABLE TO SEE IT.
 * Watchers and space routing are chosen "about a member", not "about the
 * register": a shift leader watching a driver is a perfectly good person to
 * hear about their late clock-out and not somebody entitled to the fleet list.
 * Routed people are therefore filtered by `whoCanSee` before anything is sent.
 */
@Injectable()
export class AssetNotifier {
  private readonly logger = new Logger(AssetNotifier.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly routing: NotificationRoutingService,
    @Inject('NOTIFICATION_SERVICE') private readonly notifications: ClientProxy,
  ) {}

  // ── Expenses ───────────────────────────────────────────────────────────────

  /**
   * A member sent in what they spent — tell the people who will confirm it.
   *
   * Only ever called for a SUBMITTED entry. An entry the office typed itself is
   * RECORDED on arrival and there is nobody to ask: announcing it would put the
   * office's own bookkeeping in the office's own bell.
   *
   * Routed like a proposal — watchers ∪ the space's routing, with a FALLBACK —
   * and for the same reason: an expense nobody is told about is money a driver
   * is waiting to get back, and the queue it sits in is only read by people who
   * already know to look.
   *
   * Not coalesced here. A phone coming back online replays its queue as a burst
   * of separate filings, and folding those into one push per approver is the
   * notification service's job, because it is the one that knows what it has
   * already sent to whom.
   */
  async expenseSubmitted(entry: {
    id: string;
    organizationId: string;
    assetId: string;
    authorId: string | null;
    category: string;
    amountCents: number;
    occurredAt: Date;
  }): Promise<void> {
    if (!entry.authorId) return;
    try {
      const [asset, author] = await Promise.all([
        this.prisma.asset.findFirst({
          where: { id: entry.assetId, organizationId: entry.organizationId },
          select: { name: true, category: { select: { spaceId: true } } },
        }),
        this.prisma.user.findFirst({
          where: { id: entry.authorId, organizationId: entry.organizationId },
          select: { firstName: true, lastName: true },
        }),
      ]);
      if (!asset) return;
      const spaceId = asset.category?.spaceId ?? null;

      const { ids } = await this.routing.resolveWatchers(entry.authorId, entry.organizationId, 'tasks', false);
      let recipientIds = await this.whoCanSee(entry.organizationId, ids, spaceId, entry.authorId);
      if (recipientIds.length === 0) {
        recipientIds = await this.approvers(entry.organizationId, entry.authorId, spaceId);
      }
      if (recipientIds.length === 0) return;

      this.notifications.emit('asset_expense_submitted', {
        organizationId: entry.organizationId,
        entryId: entry.id,
        assetId: entry.assetId,
        assetName: asset.name,
        spaceId,
        authorId: entry.authorId,
        authorName: `${author?.firstName ?? ''} ${author?.lastName ?? ''}`.trim(),
        category: entry.category,
        amountCents: entry.amountCents,
        occurredAt: entry.occurredAt,
        recipientIds,
      });
    } catch (e) {
      this.logger.warn(`asset expense announce failed: ${(e as Error).message}`);
    }
  }

  /**
   * The office answered — tell the one person who sent it in.
   *
   * Nobody else: the office already knows, it is the office. And not the author
   * either when they decided it themselves (somebody filed as a driver and was
   * later given the register), because a push about your own click is noise.
   */
  async expenseDecided(input: {
    entryId: string;
    organizationId: string;
    decision: 'accept' | 'reject';
    note: string | null;
    reviewerId: string;
  }): Promise<void> {
    try {
      const entry = await this.prisma.assetMoney.findFirst({
        where: { id: input.entryId, organizationId: input.organizationId },
        select: {
          authorId: true, assetId: true, category: true, amountCents: true,
          asset: { select: { name: true } },
        },
      });
      if (!entry?.authorId || entry.authorId === input.reviewerId) return;

      this.notifications.emit('asset_expense_decided', {
        organizationId: input.organizationId,
        entryId: input.entryId,
        assetId: entry.assetId,
        assetName: entry.asset?.name ?? '',
        authorId: entry.authorId,
        decision: input.decision,
        note: input.note,
        amountCents: entry.amountCents,
        category: entry.category,
      });
    } catch (e) {
      this.logger.warn(`asset expense decision announce failed: ${(e as Error).message}`);
    }
  }

  // ── Custody ────────────────────────────────────────────────────────────────

  /**
   * Somebody was given a thing, or had it taken back.
   *
   * Called AFTER the transaction that wrote it has committed — never from inside
   * `AssetCustodyService.apply`, which runs in the caller's transaction: a push
   * sent from there would announce a handover that a later step can still roll
   * back, and "the van is now with you" is not a sentence to take back.
   *
   * A plan with problems wrote nothing and says nothing. Clients are never told
   * — a custody period naming a client is a flat's resident, reached through
   * the portal, not a member with this app — and neither is whoever made the
   * change, who is looking at the screen that did it.
   */
  async handedOver(input: {
    organizationId: string;
    assetId: string;
    actorId: string;
    plan: HandoverPlan;
  }): Promise<void> {
    const { plan } = input;
    if (plan.problems.length) return;
    try {
      const opened = new Set(plan.opening.map((p) => p.userId).filter((v): v is string => !!v));
      // Somebody re-given the thing they had is a receiver, not a loser.
      const closed = new Set(
        plan.closing.map((p) => p.userId).filter((v): v is string => !!v && !opened.has(v)),
      );
      opened.delete(input.actorId);
      closed.delete(input.actorId);
      if (opened.size === 0 && closed.size === 0) return;

      const [asset, people] = await Promise.all([
        this.prisma.asset.findFirst({
          where: { id: input.assetId, organizationId: input.organizationId },
          select: { name: true },
        }),
        // Members of THIS organization, still here. A portal account is a
        // client, whatever a custody row happens to hold.
        this.prisma.user.findMany({
          where: {
            id: { in: [...opened, ...closed] },
            organizationId: input.organizationId,
            isActive: true,
            role: { not: Role.CUSTOMER as never },
          },
          select: { id: true },
        }),
      ]);
      if (!asset) return;
      const members = new Set(people.map((p) => p.id));
      const openedUserIds = [...opened].filter((id) => members.has(id));
      const closedUserIds = [...closed].filter((id) => members.has(id));
      if (openedUserIds.length === 0 && closedUserIds.length === 0) return;

      this.notifications.emit('asset_handed_over', {
        organizationId: input.organizationId,
        assetId: input.assetId,
        assetName: asset.name,
        openedUserIds,
        closedUserIds,
        byUserId: input.actorId,
        at: plan.at,
      });
    } catch (e) {
      this.logger.warn(`asset handover announce failed: ${(e as Error).message}`);
    }
  }

  // ── Who ────────────────────────────────────────────────────────────────────

  /**
   * Everyone who could actually decide — the fallback, never the first choice.
   *
   * ⚠️ `canManageAssets` is NOT a column on User. It is resolved at sign-in from
   * the member's ORG role, so finding the holders means reading the roles that
   * grant it and then the people who hold those roles.
   *
   * ⚠️ ORG-scoped roles only, matching the endpoints: accepting a proposal and
   * reviewing an expense are both `@RequirePermission('canManageAssets')`, so a
   * space role however senior is refused there — and telling somebody about
   * work they will be refused is worse than telling them nothing.
   *
   * Where the thing belongs to a workspace, the approvers ASSIGNED to that
   * workspace are preferred: the manager of the depot, not the owner of the
   * company, is who should hear about a forklift's fuel. When nobody who could
   * decide is assigned there, everybody who could decide is told — preferring
   * must never become nobody.
   */
  async approvers(organizationId: string, exceptUserId: string, spaceId?: string | null): Promise<string[]> {
    const roles = await this.prisma.accessRole.findMany({
      where: { organizationId, isActive: true, scope: { not: 'SPACE' as never } },
      select: { id: true, permissions: true },
    });
    const granting = roles.filter((r) => grants(r.permissions, ACTS_ON_ASSETS)).map((r) => r.id);

    const people = await this.prisma.user.findMany({
      where: {
        organizationId,
        isActive: true,
        isExternal: false,
        id: { not: exceptUserId },
        // An admin is one by being one, exactly as PermissionsGuard decides it.
        OR: [
          { role: Role.ADMIN as never },
          { canManageUsers: true },
          ...(granting.length ? [{ memberRoleId: { in: granting } }] : []),
        ],
      },
      select: { id: true },
      take: 25,
    });
    const ids = people.map((p) => p.id);
    if (!spaceId || ids.length <= 1) return ids;

    const { userId: _any, ...window } = activeAssignmentWhere('');
    const here = await this.prisma.spaceAssignment.findMany({
      where: { ...window, organizationId, spaceId, userId: { in: ids } },
      select: { userId: true },
    });
    const local = new Set(here.map((a) => a.userId));
    const preferred = ids.filter((id) => local.has(id));
    return preferred.length ? preferred : ids;
  }

  /**
   * Of these people, who may open the register this thing is in?
   *
   * The same doors the asset endpoints open: an admin, an org-wide grant (the
   * flag column or the org role), or a grant held in the workspace the thing's
   * kind belongs to. External members are refused outright — `@DenyExternal`
   * closes the organization's property to them whatever they hold — and the
   * subject is never told about themselves.
   */
  private async whoCanSee(
    organizationId: string,
    userIds: string[],
    spaceId: string | null,
    exceptUserId: string,
  ): Promise<string[]> {
    const candidates = [...new Set(userIds)].filter((id) => id && id !== exceptUserId);
    if (candidates.length === 0) return [];

    const users = await this.prisma.user.findMany({
      where: { id: { in: candidates }, organizationId, isActive: true, isExternal: false },
      select: {
        id: true, role: true, canViewAllTasks: true, canManageUsers: true,
        memberRole: { select: { permissions: true, isActive: true } },
      },
    });

    const allowed = new Set<string>();
    const rest: string[] = [];
    for (const u of users) {
      const orgWide =
        u.role === (Role.ADMIN as never) ||
        u.canViewAllTasks ||
        u.canManageUsers ||
        (!!u.memberRole?.isActive && grants(u.memberRole.permissions, SEES_ASSETS));
      if (orgWide) allowed.add(u.id);
      else if (u.role !== (Role.CUSTOMER as never)) rest.push(u.id);
    }

    if (spaceId && rest.length) {
      const { userId: _any, ...window } = activeAssignmentWhere('');
      const assignments = await this.prisma.spaceAssignment.findMany({
        where: { ...window, organizationId, spaceId, userId: { in: rest } },
        select: { userId: true, role: { select: { permissions: true, isActive: true } } },
      });
      for (const a of assignments) {
        if (a.role?.isActive && grants(a.role.permissions, SEES_ASSETS)) allowed.add(a.userId);
      }
    }

    // In the routing's order, so the first-configured watcher stays first.
    return candidates.filter((id) => allowed.has(id));
  }
}
