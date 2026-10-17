import type { Prisma } from '@prisma/client';
import { Role } from '@hbcfield/shared';
import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';

/**
 * Reading the organization's people: one account, the worker list, the contacts
 * picker, and the Members list in one shape.
 *
 * Part of member management; `UsersService` is the facade every caller uses.
 */
@Injectable()
export class MemberDirectoryService {
  constructor(private readonly prisma: PrismaService) {}

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
    const where: Prisma.UserWhereInput = { isActive: true, organizationId };

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
        OR: [{ role: Role.ADMIN }, { canViewAllTasks: true }, { canAssignTasks: true }, { canManageUsers: true }],
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
      me.contactScope === 'SELECTED' ? candidates.filter((c) => me.contactAllowedIds.includes(c.id)) : candidates;

    return { success: true, data };
  }
}
