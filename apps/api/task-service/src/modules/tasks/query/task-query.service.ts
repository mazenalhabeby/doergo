import { Injectable, BadRequestException, ForbiddenException } from '@nestjs/common';
import { TASK_LIST_INCLUDE, annotateTracksLocation } from '../core/task-list-shape';
import { buildTaskVisibilityWhere, type TaskVisibilityFacts } from '../core/task-visibility';
import {
  PrismaService,
  TaskStatus,
  paginated,
  buildDateRangeFilter,
  clampListLimit,
  clampListPage,
} from '@hbcfield/shared';
import { WorkflowConfigCache } from '../../workflows/config-cache/workflow-config-cache.service';
import { type TaskAccessFacts } from '../access/task-access.service';
import { TaskSubmissionsService } from './task-submissions.service';
import type { Prisma } from '@prisma/client';
import type { RpcRequest, findAllTasks } from '@hbcfield/shared/microservices';

/**
 * Reading tasks: the list, one task, its space, its job time and the step
 * submissions recorded on it. Nothing here writes.
 */
@Injectable()
export class TaskQueryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly workflowCache: WorkflowConfigCache,
    private readonly submissions: TaskSubmissionsService,
  ) {}

  private static readonly MAX_SEARCH_LENGTH = 200;

  /** See task-visibility.ts — kept as a method so existing call sites read unchanged. */
  private buildVisibilityWhere(opts: TaskVisibilityFacts) {
    return buildTaskVisibilityWhere(opts);
  }

  /**
   * Find all tasks with role-based filtering
   * - CLIENT: sees tasks created by them in their organization
   * - DISPATCHER: sees all tasks in their organization (and accessible orgs)
   * - TECHNICIAN: sees only tasks assigned to them
   */
  async findAll(query: RpcRequest<typeof findAllTasks>) {
    const {
      page = 1,
      limit = 100,
      status,
      priority,
      search,
      startDate,
      endDate,
      includeNoDueDate,
      userId,
      userRole,
      canViewAllTasks,
      organizationId,
      spaceId,
      sharedSpaceIds, // server-authoritative cross-org shared spaces (from the token grant)
      viewAllSpaceIds, // spaces where canViewAllTasks is held by a SPACE role
      assignedToMe, // narrow to the caller's OWN work, whatever else they may see
    } = query;
    // Is this a query for a foreign space shared with the caller's org?
    const isSharedSpace = !!spaceId && Array.isArray(sharedSpaceIds) && sharedSpaceIds.includes(spaceId);
    const safePage = clampListPage(page);
    const safeLimit = clampListLimit(limit, 20, 500);
    const skip = (safePage - 1) * safeLimit;
    const take = safeLimit;

    // Build where clause based on role
    const where: Prisma.TaskWhereInput = {};

    /*
      "What should I work on" — asked of the SERVER, not of a page of results.

      Somebody who oversees the work sees the whole organization, so their own
      task is one row among hundreds and might not even be in the first page the
      app fetches: it was not findable by scrolling, let alone quickly. This
      narrows to their own work in the query, ANDed with whatever they are
      allowed to see rather than replacing it, so it can never widen anybody's
      visibility — the worst it can do is show them fewer of their own tasks.

      Both halves of the assignment model, because a member can be on a task
      through either. Indexed on each side: tasks(assignedToId, dueDate) and
      task_assignees(userId).
    */
    if (assignedToMe && userId) {
      where.AND = [
        ...(Array.isArray(where.AND) ? where.AND : []),
        { OR: [{ assignedToId: userId }, { assignees: { some: { userId } } }] },
      ];
    }

    // Status filter. `statuses` (comma-separated or array) carries a tab group —
    // e.g. "active" is several statuses — which a single `status` cannot express,
    // so the client used to filter those client-side over one page of results.
    const statusList = Array.isArray(query.statuses)
      ? query.statuses
      : typeof query.statuses === 'string' && query.statuses.trim()
        ? query.statuses
            .split(',')
            .map((x: string) => x.trim())
            .filter(Boolean)
        : null;
    if (statusList?.length) where.status = { in: statusList };
    else if (status) where.status = status;

    // Priority filter
    if (priority) where.priority = priority;

    // Sprint / epic. "none" means explicitly unassigned — that is the backlog.
    /*
      Filter ids are STRINGS or nothing. A query string can carry an object —
      `?customerId[not]=x` parses to { not: 'x' } — and these went straight into
      the Prisma where, where an object is an OPERATOR. The gateway already keeps
      only strings; this is the second lock, for any other caller.
    */
    const idFilter = (v: unknown): string | undefined => (typeof v === 'string' && v ? v : undefined);
    const sprintFilter = idFilter(query.sprintId);
    const epicFilter = idFilter(query.epicId);
    const customerFilter = idFilter(query.customerId);
    const unitFilter = idFilter(query.unitId);
    if (sprintFilter) where.sprintId = sprintFilter === 'none' ? null : sprintFilter;
    if (epicFilter) where.epicId = epicFilter === 'none' ? null : epicFilter;

    if (isSharedSpace) {
      // Cross-org shared space: the grant is server-authoritative (validated in
      // auth-service, forwarded on the token). Scope strictly to that ONE space —
      // NO org filter (the space itself is the boundary) and NO own-tasks
      // restriction (the share confers view-all within the space). This is the
      // only place the org isolation filter is intentionally bypassed, and only
      // for a spaceId proven to be in the caller's received-shares set.
      where.spaceId = spaceId;
    } else {
      // Visibility — one rule, shared with getStatusCounts (see above).
      const visibility = this.buildVisibilityWhere({
        userId,
        userRole,
        canViewAllTasks,
        organizationId,
        viewAllSpaceIds,
      });
      where.organizationId = visibility.organizationId;
      if (visibility.AND)
        where.AND = [...((where.AND as Prisma.TaskWhereInput[] | undefined) || []), ...visibility.AND];

      // Space filter — verify it belongs to the user's org before applying
      if (spaceId) {
        const space = await this.prisma.companyLocation.findUnique({
          where: { id: spaceId },
          select: { organizationId: true },
        });
        if (!space || space.organizationId !== organizationId) {
          throw new ForbiddenException('Access denied to this space');
        }
        where.spaceId = spaceId;
      }
    }

    // Customer filter (CRM record → its tasks). Composes with org/visibility.
    if (customerFilter) where.customerId = customerFilter;
    // Unit filter (apartment → its tasks/requests, the apartment history).
    if (unitFilter) where.unitId = unitFilter;

    // Build AND conditions for date range and search
    const andConditions: Prisma.TaskWhereInput[] = [];

    // Date range filter on dueDate
    const dateFilter = buildDateRangeFilter(startDate, endDate);
    if (dateFilter) {
      const shouldIncludeNoDueDate = includeNoDueDate === 'true' || includeNoDueDate === true;
      if (shouldIncludeNoDueDate) {
        // "Current" tab: tasks due in range, OR with no due date, OR overdue but
        // still active (an in-progress task due last month is still current work).
        const orClauses: Prisma.TaskWhereInput[] = [{ dueDate: dateFilter }, { dueDate: null }];
        if (startDate) {
          orClauses.push({
            dueDate: { lt: new Date(startDate) },
            status: { notIn: [TaskStatus.COMPLETED, TaskStatus.CLOSED, TaskStatus.CANCELED] },
          });
        }
        andConditions.push({ OR: orClauses });
      } else {
        andConditions.push({ dueDate: dateFilter });
      }
    }

    // Search filter on title and description
    const trimmedSearch = search?.trim();
    if (trimmedSearch && trimmedSearch.length > TaskQueryService.MAX_SEARCH_LENGTH) {
      throw new BadRequestException('Search query too long');
    }
    if (trimmedSearch) {
      andConditions.push({
        OR: [
          { title: { contains: trimmedSearch, mode: 'insensitive' } },
          { description: { contains: trimmedSearch, mode: 'insensitive' } },
        ],
      });
    }

    // IMPORTANT: append, never overwrite — role scoping (e.g. an employee's
    // own-tasks filter) is already stored on where.AND above.
    if (andConditions.length > 0) {
      where.AND = [...((where.AND as Prisma.TaskWhereInput[] | undefined) || []), ...andConditions];
    }

    const [tasks, total] = await Promise.all([
      this.prisma.task.findMany({
        where,
        skip,
        take,
        orderBy: { createdAt: 'desc' },
        include: TASK_LIST_INCLUDE,
      }),
      this.prisma.task.count({ where }),
    ]);

    const withTracking = await annotateTracksLocation(this.prisma, tasks, (orgId, id) =>
      this.workflowCache.getWorkflow(orgId, id),
    );

    return paginated(withTracking, { page: safePage, limit: safeLimit, total });
  }

  /** The step forms answered on the way through this job — see TaskSubmissionsService. */
  getSubmissions(data: TaskAccessFacts & { id: string }) {
    return this.submissions.getSubmissions(data);
  }
}
