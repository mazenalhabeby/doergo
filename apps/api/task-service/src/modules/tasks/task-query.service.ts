import { Injectable, NotFoundException, BadRequestException, ForbiddenException } from '@nestjs/common';
import { WorkflowConfigCache } from '../../common/cache/workflow-config-cache.service';
import { TASK_LIST_INCLUDE, annotateTracksLocation } from './task-list-shape';
import { buildTaskVisibilityWhere, type TaskVisibilityFacts } from './task-visibility';
import { MediaSigner } from '../../common/storage/media-signer.service';
import { JobTimeService } from './handover/job-time.service';
import { CrewService } from './handover/crew.service';
import { PrismaService } from '../../common/prisma/prisma.service';
import { type TaskAccessFacts } from '../../common/task-access/task-access.service';
import {
  TaskStatus,
  TaskEventType,
  success,
  paginated,
  buildDateRangeFilter,
  getStatusCapabilities,
  parseStoredStepForm,
  stepFormFileIds,
  type StepFormAnswers,
  clampListLimit,
  clampListPage,
} from '@hbcfield/shared';
import { TaskSupportService } from './task-support.service';
import { CHECKLIST_PEOPLE } from './task-checklist.service';

/**
 * Reading tasks: the list, one task, its space, its job time and the step
 * submissions recorded on it. Nothing here writes.
 */
@Injectable()
export class TaskQueryService {
  private static readonly MAX_SEARCH_LENGTH = 200;

  constructor(
    private readonly prisma: PrismaService,
    private readonly workflowCache: WorkflowConfigCache,
    private readonly media: MediaSigner,
    // Job time (shared tasks/job-time.ts) — read, never stored.
    private readonly jobTime: JobTimeService,
    // A crew on one job: presence, own stops, the lead (shared tasks/crew.ts).
    private readonly crew: CrewService,
    private readonly support: TaskSupportService,
  ) {}

  /** See task-visibility.ts — kept as a method so existing call sites read unchanged. */
  private buildVisibilityWhere(opts: TaskVisibilityFacts): any {
    return buildTaskVisibilityWhere(opts);
  }

  /**
   * Find all tasks with role-based filtering
   * - CLIENT: sees tasks created by them in their organization
   * - DISPATCHER: sees all tasks in their organization (and accessible orgs)
   * - TECHNICIAN: sees only tasks assigned to them
   */
  async findAll(query: any) {
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
    const where: any = {};

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
        ? query.statuses.split(',').map((x: string) => x.trim()).filter(Boolean)
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
      const visibility = this.buildVisibilityWhere({ userId, userRole, canViewAllTasks, organizationId, viewAllSpaceIds });
      where.organizationId = visibility.organizationId;
      if (visibility.AND) where.AND = [...(where.AND || []), ...visibility.AND];

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
    const andConditions: any[] = [];

    // Date range filter on dueDate
    const dateFilter = buildDateRangeFilter(startDate, endDate);
    if (dateFilter) {
      const shouldIncludeNoDueDate = includeNoDueDate === 'true' || includeNoDueDate === true;
      if (shouldIncludeNoDueDate) {
        // "Current" tab: tasks due in range, OR with no due date, OR overdue but
        // still active (an in-progress task due last month is still current work).
        const orClauses: any[] = [{ dueDate: dateFilter }, { dueDate: null }];
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
      where.AND = [...(where.AND || []), ...andConditions];
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

    const withTracking = await annotateTracksLocation(tasks, (id) => this.workflowCache.getWorkflow(query.organizationId, id));

    return paginated(withTracking, { page: safePage, limit: safeLimit, total });
  }

  /**
   * Find a single task by ID with authorization
   */
  /** The workspace a task lives in, or null. The space id only — no task data. */
  async spaceOf(data: { id: string; organizationId: string }) {
    const task = await this.prisma.task.findFirst({
      where: { id: data.id, organizationId: data.organizationId },
      select: { spaceId: true },
    });
    return success({ spaceId: task?.spaceId ?? null });
  }

  async findOne(data: { id: string; userId: string; userRole: string; canViewAllTasks?: boolean; organizationId: string; sharedSpaceIds?: string[]; viewAllSpaceIds?: string[] }) {
    const task = await this.prisma.task.findUnique({
      where: { id: data.id },
      include: {
        createdBy: { select: { id: true, firstName: true, lastName: true, email: true, avatarUrl: true } },
        assignedTo: { select: { id: true, firstName: true, lastName: true, email: true, avatarUrl: true } },
        organization: { select: { id: true, name: true } },
        openRole: { select: { id: true, name: true } },
        asset: {
          include: {
            category: { select: { id: true, name: true, color: true, icon: true } },
            type: { select: { id: true, name: true } },
          },
        },
        comments: {
          orderBy: { createdAt: 'desc' },
          take: 20,
          include: { user: { select: { id: true, firstName: true, lastName: true, avatarUrl: true } } },
        },
        attachments: { orderBy: { createdAt: 'desc' }, take: 50 },
        // What the people before wrote — the newest is the card at the top of the job.
        handovers: {
          orderBy: { createdAt: 'desc' },
          take: 5,
          include: { author: { select: { id: true, firstName: true, lastName: true, avatarUrl: true } } },
        },
        assignees: {
          take: 20,
          include: {
            user: { select: { id: true, firstName: true, lastName: true, email: true, avatarUrl: true } },
          },
        },
        checklistItems: {
          orderBy: { position: 'asc' },
          take: 100,
          include: CHECKLIST_PEOPLE,
        },
        // Subtask hierarchy
        parent: { select: { id: true, title: true } },
        subtasks: {
          orderBy: { position: 'asc' },
          take: 50,
          include: {
            assignedTo: { select: { id: true, firstName: true, lastName: true, avatarUrl: true } },
            _count: { select: { subtasks: true, checklistItems: true } },
          },
        },
        // Space — only need its workflowId; the workflow itself comes from the
        // per-org cache (no workflow_statuses join on the hot path).
        space: { select: { id: true, name: true, enabledModules: true, workflowId: true } },
        // Phase & Sprint
        phase: { select: { id: true, name: true, color: true, type: true } },
        sprint: { select: { id: true, name: true, status: true } },
        // Dependencies
        predecessors: {
          take: 50,
          include: {
            predecessor: { select: { id: true, title: true, status: true } },
          },
        },
        successors: {
          take: 50,
          include: {
            successor: { select: { id: true, title: true, status: true } },
          },
        },
      },
    });

    if (!task) {
      throw new NotFoundException('Task not found');
    }

    // Authorization check
    await this.support.taskAccess.assert(task, data, { roleHolderMayRead: true });

    // Derive task-time anchors from the status history (no schema change), so the
    // timer is DB-backed and identical on web, mobile and the admin view:
    //   acceptedAt  = when the employee first accepted (status → ACCEPTED)
    //   completedAt = when it was completed/closed (freezes the running timer)
    const statusEvents = await this.prisma.taskEvent.findMany({
      where: { taskId: data.id, eventType: TaskEventType.STATUS_CHANGED },
      orderBy: { createdAt: 'asc' },
      select: { createdAt: true, metadata: true },
    });
    const ACTIVE = [TaskStatus.ACCEPTED, TaskStatus.EN_ROUTE, TaskStatus.ARRIVED, TaskStatus.IN_PROGRESS];
    let acceptedAt: Date | null = null;
    let completedAt: Date | null = null;
    for (const ev of statusEvents) {
      const ns = (ev.metadata as any)?.newStatus;
      if (!acceptedAt && ns === TaskStatus.ACCEPTED) acceptedAt = ev.createdAt;
      if (!completedAt && (ns === TaskStatus.COMPLETED || ns === TaskStatus.CLOSED)) completedAt = ev.createdAt;
    }
    // Fallback chain for tasks with no recorded ACCEPTED event (e.g. created
    // directly in an active state, or seed data): first active transition →
    // route start → the task's creation time. Always stable/DB-backed so the
    // timer never resets on reopen.
    if (!acceptedAt) {
      const firstActive = statusEvents.find((ev) => ACTIVE.includes((ev.metadata as any)?.newStatus));
      const ACTIVE_OR_DONE = [...ACTIVE, TaskStatus.BLOCKED, TaskStatus.COMPLETED, TaskStatus.CLOSED];
      acceptedAt =
        firstActive?.createdAt ??
        (task as any).routeStartedAt ??
        (ACTIVE_OR_DONE.includes(task.status as any) ? task.createdAt : null);
    }

    // Effective flow = the task's own workflow, else its space's workflow —
    // resolved from the per-org cache (Redis) instead of a DB join.
    const effWorkflowId = (task as any).workflowId ?? (task as any).space?.workflowId ?? null;
    const effectiveWorkflow = await this.workflowCache.getWorkflow(data.organizationId, effWorkflowId);
    // Capabilities active AT the current status (per-step). The status's own
    // DB-stored capabilities are authoritative (admin-editable); fall back to the
    // shared map only when there's no matching workflow status (legacy tasks).
    const currentStatus = effectiveWorkflow?.statuses?.find((s: any) => s.key === task.status);
    const capabilities = currentStatus
      ? (currentStatus.capabilities ?? [])
      : getStatusCapabilities(effectiveWorkflow?.name, task.status);

    return success({
      ...task,
      // Signed links, never the stored provider URL — see MediaSigner.
      attachments: await this.media.signAll(task.attachments),
      ...(await this.pauseFacts(task)),
      acceptedAt,
      completedAt,
      capabilities,
      workflow: effectiveWorkflow,
    });
  }

  /**
   * Who paused the job and who still owes its note, by name, with the time they
   * put in — what the reassign warning says ("Mike hasn't written a handover yet
   * — he worked 2h 15m"). Nothing is asked of a job that is neither.
   */
  private async pauseFacts(task: { id: string; pausedById?: string | null; handoverDueById?: string | null }) {
    const ids = [...new Set([task.pausedById, task.handoverDueById].filter((x): x is string => !!x))];
    if (ids.length === 0) return { pausedBy: null, handoverDue: null };
    const [people, lastPause] = await Promise.all([
      this.prisma.user.findMany({ where: { id: { in: ids } }, select: { id: true, firstName: true, lastName: true } }),
      task.handoverDueById
        ? this.prisma.taskEvent.findFirst({
            where: { taskId: task.id, userId: task.handoverDueById, eventType: TaskEventType.PAUSED },
            orderBy: { createdAt: 'desc' },
            select: { metadata: true },
          })
        : null,
    ]);
    const byId = new Map(people.map((p) => [p.id, p]));
    const who = (id?: string | null) => (id && byId.get(id)) || null;
    return {
      pausedBy: who(task.pausedById),
      handoverDue: task.handoverDueById
        ? { user: who(task.handoverDueById), workedMinutes: (lastPause?.metadata as { workedMinutes?: number } | null)?.workedMinutes ?? null }
        : null,
    };
  }

  /**
   * A job's time — travel, working, blocked — per worker and in total, and who
   * started it. Anybody who may see the job may see its time.
   */
  async getJobTime(data: TaskAccessFacts & { id: string }) {
    const task = await this.prisma.task.findUnique({ where: { id: data.id } });
    if (!task) throw new NotFoundException('Task not found');
    await this.support.taskAccess.assert(task, data, { roleHolderMayRead: true });
    // The crew panel rides with the time: one request for the job page and the phone.
    const [time, crew] = await Promise.all([this.jobTime.forTask(task), this.crew.viewFor(task.id)]);
    return success({ ...time, crew });
  }

  /** One worker's job time over a period. The gateway decides who may ask about whom. */
  async getJobTimeReport(data: { userId: string; organizationId: string; from: string; to: string }) {
    const from = new Date(data.from);
    const to = new Date(data.to);
    if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime()) || to <= from || to.getTime() - from.getTime() > 93 * 86_400_000) {
      throw new BadRequestException('Choose a period of up to three months.');
    }
    return success(await this.jobTime.report({ userId: data.userId, organizationId: data.organizationId, from, to }));
  }

  /**
   * The step forms answered on the way through this job — its report section.
   *
   * Gated exactly like reading the task. Each submission carries the form it
   * answered (the snapshot, not today's definition), and every photo and
   * signature it names is resolved to a short-lived signed link, the same way
   * attachments are everywhere else. One query for the submissions, one for all
   * their files — no N+1 however many moves the job made.
   */
  async getSubmissions(data: TaskAccessFacts & { id: string }) {
    const task = await this.prisma.task.findUnique({ where: { id: data.id } });
    if (!task) throw new NotFoundException('Task not found');
    /*
      NOT open to a holder of the job's open role. The role-holder exemption is
      for deciding whether to TAKE the job — the task itself. A step submission
      carries what somebody already did on site: answers, signed photo links, a
      customer's signature. That belongs to the people on the job.
    */
    await this.support.taskAccess.assert(task, data);

    const rows = await this.prisma.taskStepSubmission.findMany({
      where: { taskId: task.id },
      orderBy: { submittedAt: 'asc' },
      take: 100,
      select: { id: true, statusKey: true, formVersion: true, form: true, answers: true, submittedById: true, submittedAt: true },
    });
    if (!rows.length) return success([]);

    const fileIds = new Set<string>();
    for (const r of rows) {
      const form = parseStoredStepForm(r.form);
      if (form) stepFormFileIds(form, (r.answers ?? {}) as StepFormAnswers).forEach((id) => fileIds.add(id));
    }
    const userIds = [...new Set(rows.map((r) => r.submittedById))];
    const [files, users] = await Promise.all([
      fileIds.size
        ? this.prisma.attachment.findMany({
            // Scoped to THIS task: a stored id can only ever resolve to this job's own file.
            where: { id: { in: [...fileIds] }, taskId: task.id },
            select: { id: true, fileName: true, fileKey: true, fileUrl: true, mimeType: true, fileType: true, fileSize: true, createdAt: true },
          })
        : Promise.resolve([]),
      this.prisma.user.findMany({
        where: { id: { in: userIds } },
        select: { id: true, firstName: true, lastName: true, avatarUrl: true },
      }),
    ]);
    const signed = await this.media.signAll(files);
    const fileById = Object.fromEntries(signed.map((f) => [f.id, f]));
    const userById = new Map(users.map((u) => [u.id, u]));

    return success(
      rows.map((r) => {
        const form = parseStoredStepForm(r.form);
        const answers = (r.answers ?? {}) as StepFormAnswers;
        const own = form ? stepFormFileIds(form, answers) : [];
        return {
          id: r.id,
          statusKey: r.statusKey,
          formVersion: r.formVersion,
          form: r.form,
          answers,
          files: Object.fromEntries(own.filter((id) => fileById[id]).map((id) => [id, fileById[id]])),
          submittedAt: r.submittedAt,
          submittedBy: userById.get(r.submittedById) ?? { id: r.submittedById, firstName: null, lastName: null, avatarUrl: null },
        };
      }),
    );
  }
}
