import { Inject, Injectable, Logger } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { Role, activeAssignmentWhere, staffAccessFlags } from '@hbcfield/shared';
import { PrismaService } from '@hbcfield/shared';
import { NotificationRoutingService } from '../../../common/notification-routing.service';
import { AssetResponsibleService } from './asset-responsible.service';
import { SEES_ASSETS, SEES_ASSETS_IN_SPACE, grants } from './asset-notifier-helpers';

/** Who is told about an asset: the people who can approve its expenses, and who can see it. */
@Injectable()
export abstract class AssetNotifierBase {
  protected readonly logger = new Logger(this.constructor.name);

  constructor(
    protected readonly prisma: PrismaService,
    protected readonly routing: NotificationRoutingService,
    @Inject('NOTIFICATION_SERVICE') protected readonly notifications: ClientProxy,
    protected readonly responsible: AssetResponsibleService,
  ) {}

  // ── Who ────────────────────────────────────────────────────────────────────

  /**
   * Everyone who could actually decide — the fallback, never the first choice.
   *
   * ⚠️ `canManageAssets` is NOT a column on User. It is resolved at sign-in from
   * the member's ORG role, so finding the holders means reading the roles that
   * grant it and then the people who hold those roles.
   *
   * ⚠️ ORG-scoped roles only, as a FALLBACK. Accepting a proposal and
   * reviewing an expense are open to a workspace manager in that workspace
   * now, and those people are reached through the routing (watchers ∪ space
   * roles) before this is asked; the fallback reaches whoever can decide
   * ANYTHING, which only an org-wide grant guarantees.
   *
   * Where the thing belongs to a workspace, the approvers ASSIGNED to that
   * workspace are preferred: the manager of the depot, not the owner of the
   * company, is who should hear about a forklift's fuel. When nobody who could
   * decide is assigned there, everybody who could decide is told — preferring
   * must never become nobody.
   */
  async approvers(organizationId: string, exceptUserId: string, spaceId?: string | null): Promise<string[]> {
    // One definition of "who can decide", shared with proposals and the logbook's reminders.
    const ids = await this.responsible.orgManagers(organizationId, exceptUserId);
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
   * kind belongs to. External members are refused outright: everything told
   * here is about the organization's custody system for its staff (expenses
   * filed by custody, handovers, proposals), which is closed to them whatever
   * register keys they hold — and the subject is never told about themselves.
   */
  protected async whoCanSee(
    organizationId: string,
    userIds: string[],
    spaceId: string | null,
    exceptUserId: string,
  ): Promise<string[]> {
    const candidates = [...new Set(userIds)].filter((id) => id && id !== exceptUserId);
    if (candidates.length === 0) return [];

    const users = await staffAccessFlags(this.prisma, candidates, organizationId);

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
        if (a.role?.isActive && grants(a.role.permissions, SEES_ASSETS_IN_SPACE)) allowed.add(a.userId);
      }
    }

    // In the routing's order, so the first-configured watcher stays first.
    return candidates.filter((id) => allowed.has(id));
  }
}
