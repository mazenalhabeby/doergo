import { Role } from '@hbcfield/shared';
import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { ListOrgMembersDto } from './dto';
import {
  DIRECTORY_MEMBER_SELECT,
  MANAGER_CANDIDATE_SELECT,
  ORG_MEMBER_SELECT,
} from './users-common';

/**
 * Reading the organization's people: one account, the worker list, the contacts
 * picker, and the Members list in one shape.
 *
 * Part of member management; `UsersService` is the facade every caller uses.
 */
@Injectable()
export class MemberDirectoryService {
  constructor(
    private readonly prisma: PrismaService,
  ) {}

  async findOne(id: string, organizationId?: string) {
    // Tenant isolation (S1): when the caller's org is supplied, scope the lookup
    // to it so a user in another org can never be read by id — defense-in-depth
    // behind the gateway's own org check.
    const user = await this.prisma.user.findFirst({
      where: { id, ...(organizationId ? { organizationId } : {}) },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        role: true,
        organizationId: true,
        onboardingCompleted: true,
        avatarUrl: true,
        isActive: true,
        createdAt: true,
        // Permission fields
        canCreateTasks: true,
        taskCreationScope: true,
        canViewAllTasks: true,
        canAssignTasks: true,
        canManageUsers: true,
        organization: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    return { success: true, data: user };
  }

  /**
   * @param canViewTracking — coordinates only for a caller who may follow people
   *   on a map. Absent/false keeps `lastLocation.updatedAt` (is somebody around)
   *   and withholds where they are. Must be a real boolean; a query-string
   *   "true" does not count.
   */
  async getWorkers(organizationId?: string, canViewTracking = false) {
    // Tenant floor (S3): never list users without an org scope. A missing org id
    // must fail closed, not fall through to every active user in every tenant.
    if (!organizationId) {
      throw new BadRequestException('organizationId is required');
    }
    const where: any = { isActive: true, organizationId };

    const workers = await this.prisma.user.findMany({
      where,
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        avatarUrl: true,
        organizationId: true,
        lastLocation: true,
        // Access Profile — lets the UI tell whether a worker can receive tasks.
        enabledModules: true,
      },
    });

    if (canViewTracking === true) return { success: true, data: workers };
    return {
      success: true,
      data: workers.map((w) => ({
        ...w,
        lastLocation: w.lastLocation ? { updatedAt: w.lastLocation.updatedAt } : null,
      })),
    };
  }

  async getWorkerTasks(workerId: string, organizationId?: string) {
    const tasks = await this.prisma.task.findMany({
      // Org-scoped when the caller's org is supplied (defense-in-depth): a foreign
      // workerId can't surface another tenant's tasks.
      where: { assignedToId: workerId, ...(organizationId ? { organizationId } : {}) },
      orderBy: { createdAt: 'desc' },
      take: 100, // Limit to prevent unbounded queries
      select: {
        id: true,
        title: true,
        description: true,
        status: true,
        priority: true,
        dueDate: true,
        locationAddress: true,
        createdAt: true,
      },
    });

    return { success: true, data: tasks };
  }

  /**
   * Contacts directory — ANY org member can see the org's admins/managers to
   * reach out to. Safe fields only (no email/permissions); includes presence so
   * teammates know availability. Independent of member-management permission.
   */
  async listOrgContacts(organizationId: string, userId: string) {
    // The requesting member's contact policy (secure by default: NONE).
    const me = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { contactScope: true, contactAllowedIds: true },
    });
    if (!me || me.contactScope === 'NONE') {
      return { success: true, data: [] };
    }

    // Directory = admins + managers ONLY. "Manager" = holds an elevated permission
    // (view-all / assign tasks / manage users). NOT merely "has a named role":
    // in the unified role system every member has a role, so `memberRoleId != null`
    // matched plain employees (Technician, Maintenance Worker) too.
    const candidates = await this.prisma.user.findMany({
      where: {
        organizationId,
        isActive: true,
        id: { not: userId },
        OR: [
          { role: Role.ADMIN },
          { canViewAllTasks: true },
          { canAssignTasks: true },
          { canManageUsers: true },
        ],
      },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        role: true,
        avatarUrl: true,
        presence: true,
        position: true,
        lastActiveAt: true,
      },
      orderBy: [{ role: 'asc' }, { firstName: 'asc' }],
      // Capped (audit M-C2): this is a contact directory, not an export. Bounded in
      // practice by admins+managers per org, but an uncapped list endpoint is one
      // bad org away from a slow query.
      take: 500,
    });

    // SELECTED → only the explicitly allowed contacts; ALL → everyone in the directory.
    const data =
      me.contactScope === 'SELECTED'
        ? candidates.filter((c) => me.contactAllowedIds.includes(c.id))
        : candidates;

    return { success: true, data };
  }

  /**
   * List all members of an organization with filtering and pagination
   */
  async listOrgMembers(dto: ListOrgMembersDto & { managersOnly?: boolean; includeIds?: string[]; excludeId?: string; lite?: boolean }) {
    const { organizationId, search, role } = dto;
    // Clamp pagination server-side so a client can't request an unbounded page (M6).
    const page = Math.max(1, Number(dto.page) || 1);
    const limit = Math.min(200, Math.max(1, Number(dto.limit) || 10));

    // Members = staff only. Portal customers (they carry a customerId) live in
    // Clients Portals, not here — excluding them keeps admins from accidentally
    // re-roling a customer into a staff account (which breaks their portal login).
    const where: any = { organizationId, customerId: null };

    /*
      One filter, two kinds of thing.

      The screen's Role column shows a member's ASSIGNED ROLE where they have one
      ("Manager", "Sales") and falls back to the account type otherwise. The
      filter beside it only ever offered the account types, so a role an
      organization created could be visible in every row and selectable in none.

      An access-role id is a cuid; the account types are a closed set of
      upper-case words. Matching the words first means a role can never be
      mistaken for a type, whatever it is called — and anything else is treated
      as a role id, which simply matches nobody if it is nonsense.
    */
    if (role) {
      if (role === 'ADMIN' || role === 'EMPLOYEE' || role === 'CUSTOMER') {
        where.role = role;
      } else if (role === 'none') {
        // "No role" is a real thing to look for: these members hold no org-wide
        // permissions at all, which the Employee badge hides rather than shows.
        where.memberRoleId = null;
      } else {
        where.memberRoleId = role;
      }
    }

    /*
      Admins and managers only — the leadership set.

      Shared by every picker that offers "an admin or a manager": the contact
      allow-list and the notification watchers both need exactly this, and each
      had grown its own client-side approximation of it. The watchers list
      matched `!!memberRole`, which in the unified role system is every member
      who has any role at all — technicians included.

      The picker used to ask for 200 members and filter them in the browser, so
      an organization's whole staff list — Access Profiles, contact allow-lists,
      role joins — was read, serialised and thrown away to render a handful of
      rows. Same defect the spaces list had: the filter belongs in the query.

      `includeIds` keeps anyone already on the member's allow-list in the
      result even if they no longer qualify. Leaving them out would not remove
      the grant, only hide it.
    */
    if (dto.excludeId) {
      where.id = { not: dto.excludeId };
    }

    if (dto.managersOnly) {
      where.isActive = true;
      /*
        Candidates are defined by ROLE: the ADMIN system role, or an assigned
        role whose permission set grants canManageUsers.

        Deliberately NOT the canManageUsers column on the user row. That column
        is legacy — buildResolvedAccess still merges it, so it does still grant
        the capability, but it is drift rather than a position anyone was given.
        Including it listed people the organization does not consider managers
        (a technician carrying a stale flag) as if they were, which is the whole
        confusion this picker should not add to. Clean that drift up on the
        member's Access tab, where it is shown as a direct grant.
      */
      const or: any[] = [
        { role: 'ADMIN' },
        { memberRole: { is: { permissions: { path: ['canManageUsers'], equals: true } } } },
      ];
      const keep = (dto.includeIds ?? []).filter(Boolean);
      if (keep.length) or.push({ id: { in: keep } });
      // Combined with a search's own OR via AND so neither clause swallows the other.
      if (where.OR) {
        where.AND = [{ OR: where.OR }, { OR: or }];
        delete where.OR;
      } else {
        where.OR = or;
      }
    }

    if (search) {
      where.OR = [
        { firstName: { contains: search, mode: 'insensitive' } },
        { lastName: { contains: search, mode: 'insensitive' } },
        { email: { contains: search, mode: 'insensitive' } },
      ];
    }

    const total = await this.prisma.user.count({ where });

    const members = await this.prisma.user.findMany({
      where,
      // The picker renders a name, an avatar and a label — it has no use for
      // Access Profiles or allow-lists, and those are the expensive columns.
      select: dto.managersOnly
        ? MANAGER_CANDIDATE_SELECT
        : dto.lite
        ? DIRECTORY_MEMBER_SELECT
        : ORG_MEMBER_SELECT,
      orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }],
      skip: (page - 1) * limit,
      take: limit,
    });

    /*
      Who owns this organization, once per page rather than once per row.

      One primary-key lookup on a column that is unique, against a row already in
      cache on any warm instance. Flagging the rows here means the screen can
      label the owner and grey out the actions that would be refused, instead of
      offering them and reporting the refusal afterwards.
    */
    const org = await this.prisma.organization.findUnique({
      where: { id: organizationId },
      select: { ownerId: true },
    });

    return {
      success: true,
      data: members.map((m: any) => ({ ...m, isOwner: !!org?.ownerId && m.id === org.ownerId })),
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * Fetch a SINGLE org member by id, in the same shape as a list row. Org-scoped;
   * excludes portal customers. Lets the member detail page fetch one row instead
   * of pulling the whole org and finding it client-side (P1).
   */
  async getOrgMemberById(memberId: string, organizationId: string) {
    const member = await this.prisma.user.findFirst({
      where: { id: memberId, organizationId, customerId: null },
      select: ORG_MEMBER_SELECT,
    });
    if (!member) throw new NotFoundException('Member not found');
    return { success: true, data: member };
  }
}
