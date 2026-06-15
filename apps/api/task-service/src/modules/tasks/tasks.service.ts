import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  Inject,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ClientProxy } from '@nestjs/microservices';
import Redis from 'ioredis';
import { PrismaService } from '../../common/prisma/prisma.service';
import {
  TaskStatus,
  TaskEventType,
  Role,
  STATUS_TRANSITIONS,
  success,
  paginated,
  buildDateRangeFilter,
  haversineDistance,
  getTaskCapabilities,
} from '@hbcfield/shared';

const STATUS_COUNTS_TTL = 30; // seconds

@Injectable()
export class TasksService {
  private readonly logger = new Logger(TasksService.name);
  private readonly redis: Redis;

  private static readonly SUGGESTION_LIMIT = 100;
  private static readonly MAX_SEARCH_LENGTH = 200;
  private static readonly MAX_DEPENDENCY_DEPTH = 100;
  private static readonly GEOFENCE_RADIUS_METERS = 20;

  constructor(
    private readonly prisma: PrismaService,
    @Inject('NOTIFICATION_SERVICE') private readonly notificationClient: ClientProxy,
    configService: ConfigService,
  ) {
    const redisHost = configService.get<string>('REDIS_HOST', 'localhost') || 'localhost';
    const redisPort = configService.get<number>('REDIS_PORT', 6379) || 6379;
    this.redis = new Redis({ host: redisHost, port: redisPort, maxRetriesPerRequest: 1 });
  }

  /**
   * Create a new task (CLIENT or DISPATCHER)
   */
  async create(data: any) {
    const hasAssignment = !!data.assignedToId;
    const assigneeIds: string[] = data.assigneeIds || [];

    // SPACE-scoped users MUST provide a spaceId
    if (data.taskCreationScope === 'SPACE' && !data.spaceId) {
      throw new ForbiddenException('Task creation scope is SPACE — you must select a space');
    }

    // If spaceId provided, validate it belongs to the org and auto-populate location
    let locationLat = data.locationLat;
    let locationLng = data.locationLng;
    let locationAddress = data.locationAddress;
    let spaceWorkflowId: string | null = null;
    if (data.spaceId) {
      const space = await this.prisma.companyLocation.findUnique({
        where: { id: data.spaceId },
        select: { organizationId: true, lat: true, lng: true, address: true, workflowId: true },
      });
      if (!space) {
        throw new NotFoundException('Space not found');
      }
      spaceWorkflowId = space.workflowId ?? null;
      if (space.organizationId !== data.organizationId) {
        throw new ForbiddenException('Cannot create task in a space outside your organization');
      }

      // SPACE scope validation — user must be assigned to the space
      if (data.taskCreationScope === 'SPACE') {
        const assignment = await this.prisma.technicianAssignment.findFirst({
          where: { userId: data.userId, locationId: data.spaceId },
        });
        if (!assignment) {
          throw new ForbiddenException('You can only create tasks in spaces you are assigned to');
        }
      }

      // Auto-populate location from space if not provided
      if (!locationLat && !locationLng && !locationAddress) {
        locationLat = space.lat;
        locationLng = space.lng;
        locationAddress = space.address;
      }
    }

    // Task type = workflow: explicit, else inherited from the space. A new task
    // starts at that workflow's first status (e.g. Office → TODO, Sales →
    // SCHEDULED); with no workflow it uses the canonical NEW/ASSIGNED.
    const effWorkflowId: string | null = (data.workflowId as string | undefined) ?? spaceWorkflowId ?? null;
    let initialStatus: string = hasAssignment ? TaskStatus.ASSIGNED : TaskStatus.NEW;
    if (effWorkflowId) {
      const firstStatus = await this.prisma.workflowStatus.findFirst({
        where: { workflowId: effWorkflowId, isCanceled: false },
        orderBy: { position: 'asc' },
        select: { key: true },
      });
      if (firstStatus) initialStatus = firstStatus.key;
    }

    const task = await this.prisma.$transaction(async (tx) => {
      const createdTask = await tx.task.create({
        data: {
          title: data.title,
          description: data.description,
          priority: data.priority || 'MEDIUM',
          status: initialStatus,
          workflowId: effWorkflowId,
          dueDate: data.dueDate ? new Date(data.dueDate) : null,
          startDate: data.startDate ? new Date(data.startDate) : null,
          estimatedHours: data.estimatedHours ?? null,
          locationLat,
          locationLng,
          locationAddress,
          organizationId: data.organizationId,
          createdById: data.userId,
          assignedToId: data.assignedToId || null,
          assetId: data.assetId || null,
          parentId: data.parentId || null,
          phaseId: data.phaseId || null,
          sprintId: data.sprintId || null,
          epicId: data.epicId || null,
          storyPoints: data.storyPoints ?? null,
          spaceId: data.spaceId || null,
        },
        include: {
          createdBy: {
            select: { id: true, firstName: true, lastName: true, email: true, avatarUrl: true },
          },
          assignedTo: {
            select: { id: true, firstName: true, lastName: true, email: true, avatarUrl: true },
          },
          organization: {
            select: { id: true, name: true },
          },
        },
      });

      // Create TaskAssignee records if assigneeIds provided
      if (assigneeIds.length > 0) {
        // If there is a primary assignedToId, mark them as LEAD
        const assigneeData = assigneeIds.map((userId: string) => ({
          taskId: createdTask.id,
          userId,
          role: userId === data.assignedToId ? 'LEAD' as const : 'MEMBER' as const,
        }));

        await tx.taskAssignee.createMany({
          data: assigneeData,
          skipDuplicates: true,
        });
      }

      // If assignedToId is set but not in assigneeIds, add as LEAD assignee
      if (hasAssignment && !assigneeIds.includes(data.assignedToId)) {
        await tx.taskAssignee.create({
          data: {
            taskId: createdTask.id,
            userId: data.assignedToId,
            role: 'LEAD',
          },
        }).catch(() => {
          // Ignore duplicate
        });
      }

      return createdTask;
    });

    // Create task event
    await this.createTaskEvent(task.id, data.userId, TaskEventType.CREATED);

    // If assigned during creation, also create assignment event and notify
    if (hasAssignment) {
      await this.createTaskEvent(task.id, data.userId, TaskEventType.ASSIGNED, {
        workerId: data.assignedToId,
        workerName: task.assignedTo ? `${task.assignedTo.firstName} ${task.assignedTo.lastName}` : '',
      });

      this.notificationClient.emit('task_assigned', {
        task,
        workerId: data.assignedToId,
      });
    }

    // Notify
    this.notificationClient.emit('task_created', task);

    this.invalidateStatusCountsCache(task.organizationId);

    return success(task);
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
      organizationId,
      spaceId,
    } = query;
    const safePage = Math.max(1, Number(page) || 1);
    const safeLimit = Math.min(Math.max(1, Number(limit) || 20), 500);
    const skip = (safePage - 1) * safeLimit;
    const take = safeLimit;

    // Build where clause based on role
    const where: any = {};

    // Status filter
    if (status) where.status = status;

    // Priority filter
    if (priority) where.priority = priority;

    // Role-based filtering
    // Normalize legacy roles
    const normalizedRole = userRole === 'CLIENT' ? Role.ADMIN
      : userRole === 'DISPATCHER' ? Role.MANAGER
      : userRole === 'TECHNICIAN' ? Role.EMPLOYEE
      : userRole;

    switch (normalizedRole) {
      case Role.ADMIN:
        // Admin sees all tasks in their org
        where.organizationId = organizationId;
        break;

      case Role.MANAGER:
        // Manager sees all tasks in their org
        where.organizationId = organizationId;
        break;

      case Role.EMPLOYEE:
        // Employee sees tasks assigned to them — as the LEAD (legacy
        // assignedToId, incl. seed data) OR as any multi-assignee MEMBER.
        // Wrapped in AND so it composes with other OR filters below.
        where.AND = [
          ...(where.AND || []),
          { OR: [{ assignedToId: userId }, { assignees: { some: { userId } } }] },
        ];
        break;

      default:
        return paginated([], { page: safePage, limit: safeLimit, total: 0 });
    }

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
    if (trimmedSearch && trimmedSearch.length > TasksService.MAX_SEARCH_LENGTH) {
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
        include: {
          createdBy: { select: { id: true, firstName: true, lastName: true, avatarUrl: true } },
          assignedTo: { select: { id: true, firstName: true, lastName: true, avatarUrl: true } },
          assignees: {
            take: 4, // List view only needs a few for stacked avatars
            orderBy: { createdAt: 'asc' },
            include: {
              user: { select: { id: true, firstName: true, lastName: true, avatarUrl: true } },
            },
          },
          space: { select: { id: true, name: true } },
          phase: { select: { id: true, name: true, color: true, type: true } },
          sprint: { select: { id: true, name: true, status: true } },
          epic: { select: { id: true, name: true, color: true, status: true } },
          parent: { select: { id: true, title: true } },
          _count: {
            select: { checklistItems: true, subtasks: true, assignees: true },
          },
        },
      }),
      this.prisma.task.count({ where }),
    ]);

    return paginated(tasks, { page: safePage, limit: safeLimit, total });
  }

  /**
   * Find a single task by ID with authorization
   */
  async findOne(data: { id: string; userId: string; userRole: string; organizationId: string }) {
    const task = await this.prisma.task.findUnique({
      where: { id: data.id },
      include: {
        createdBy: { select: { id: true, firstName: true, lastName: true, email: true, avatarUrl: true } },
        assignedTo: { select: { id: true, firstName: true, lastName: true, email: true, avatarUrl: true } },
        organization: { select: { id: true, name: true } },
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
        attachments: { orderBy: { createdAt: 'desc' } },
        assignees: {
          include: {
            user: { select: { id: true, firstName: true, lastName: true, email: true, avatarUrl: true } },
          },
        },
        checklistItems: {
          orderBy: { position: 'asc' },
        },
        // Subtask hierarchy
        parent: { select: { id: true, title: true } },
        subtasks: {
          orderBy: { position: 'asc' },
          include: {
            assignedTo: { select: { id: true, firstName: true, lastName: true, avatarUrl: true } },
            _count: { select: { subtasks: true, checklistItems: true } },
          },
        },
        // Space (+ its workflow as a fallback flow source)
        space: {
          select: {
            id: true, name: true, enabledModules: true, workflowId: true,
            workflow: { include: { statuses: { orderBy: { position: 'asc' } } } },
          },
        },
        // The task's own workflow drives its status flow + capabilities
        workflow: { include: { statuses: { orderBy: { position: 'asc' } } } },
        // Phase & Sprint
        phase: { select: { id: true, name: true, color: true, type: true } },
        sprint: { select: { id: true, name: true, status: true } },
        // Dependencies
        predecessors: {
          include: {
            predecessor: { select: { id: true, title: true, status: true } },
          },
        },
        successors: {
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
    await this.checkTaskAccess(task, data.userId, data.userRole, data.organizationId);

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

    // Effective flow = the task's own workflow, else its space's workflow.
    // Capabilities are derived from the workflow (defaults to field-service).
    const effectiveWorkflow =
      (task as any).workflow ?? (task as any).space?.workflow ?? null;
    const capabilities = getTaskCapabilities(effectiveWorkflow?.name);

    return success({
      ...task,
      acceptedAt,
      completedAt,
      capabilities,
      workflow: effectiveWorkflow,
    });
  }

  /**
   * Update a task (CLIENT or DISPATCHER - any task in their org)
   */
  async update(data: any) {
    const { id, userId, userRole, organizationId, ...updateData } = data;

    // Find existing task
    const existingTask = await this.prisma.task.findUnique({
      where: { id },
    });

    if (!existingTask) {
      throw new NotFoundException('Task not found');
    }

    // Authorization: CLIENT and DISPATCHER can update any task in their organization
    if (existingTask.organizationId !== organizationId) {
      throw new ForbiddenException('You can only update tasks in your organization');
    }

    // Don't allow updating completed/closed tasks
    if ([TaskStatus.COMPLETED, TaskStatus.CLOSED, TaskStatus.CANCELED].includes(existingTask.status as TaskStatus)) {
      throw new BadRequestException('Cannot update a completed, closed, or canceled task');
    }

    const task = await this.prisma.task.update({
      where: { id },
      data: {
        ...(updateData.title && { title: updateData.title }),
        ...(updateData.description !== undefined && { description: updateData.description }),
        ...(updateData.priority && { priority: updateData.priority }),
        ...(updateData.dueDate && { dueDate: new Date(updateData.dueDate) }),
        ...(updateData.startDate !== undefined && { startDate: updateData.startDate ? new Date(updateData.startDate) : null }),
        ...(updateData.estimatedHours !== undefined && { estimatedHours: updateData.estimatedHours }),
        ...(updateData.locationLat !== undefined && { locationLat: updateData.locationLat }),
        ...(updateData.locationLng !== undefined && { locationLng: updateData.locationLng }),
        ...(updateData.locationAddress !== undefined && { locationAddress: updateData.locationAddress }),
        ...(updateData.assetId !== undefined && { assetId: updateData.assetId }),
        ...(updateData.spaceId !== undefined && { spaceId: updateData.spaceId || null }),
        ...(updateData.phaseId !== undefined && { phaseId: updateData.phaseId || null }),
        ...(updateData.sprintId !== undefined && { sprintId: updateData.sprintId || null }),
        ...(updateData.epicId !== undefined && { epicId: updateData.epicId || null }),
        ...(updateData.storyPoints !== undefined && { storyPoints: updateData.storyPoints }),
      },
      include: {
        createdBy: { select: { id: true, firstName: true, lastName: true, avatarUrl: true } },
        assignedTo: { select: { id: true, firstName: true, lastName: true, avatarUrl: true } },
      },
    });

    await this.createTaskEvent(id, userId, TaskEventType.UPDATED, { changes: updateData });

    this.invalidateStatusCountsCache(task.organizationId);

    // Notify via Socket.IO for real-time updates
    this.notificationClient.emit('task_updated', { task });

    return success(task);
  }

  /**
   * Assign a task to a technician (CLIENT or DISPATCHER)
   */
  async assign(data: { id: string; workerId: string; userId: string; userRole: string; organizationId: string }) {
    const task = await this.prisma.task.findUnique({
      where: { id: data.id },
    });

    if (!task) {
      throw new NotFoundException('Task not found');
    }

    // Authorization: CLIENT/DISPATCHER can only assign tasks in their org
    if (task.organizationId !== data.organizationId) {
      this.logger.warn(`Authorization denied: assign task across orgs`, { userId: data.userId, taskId: data.id });
      throw new ForbiddenException('You can only assign tasks in your organization');
    }

    // Admin/Dispatcher can reassign at any stage except completed/canceled/closed
    const cannotReassign = [TaskStatus.COMPLETED, TaskStatus.CANCELED, TaskStatus.CLOSED];
    if (cannotReassign.includes(task.status as TaskStatus)) {
      throw new BadRequestException(`Cannot assign a task with status ${task.status}`);
    }

    // Verify the worker exists and belongs to the same org
    const worker = await this.prisma.user.findFirst({
      where: {
        id: data.workerId,
        organizationId: data.organizationId,
        isActive: true,
      },
    });

    if (!worker) {
      throw new NotFoundException('Worker not found or not in your organization');
    }

    const previousAssignee = task.assignedToId;
    const isReassign = previousAssignee && previousAssignee !== data.workerId;

    const updatedTask = await this.prisma.task.update({
      where: { id: data.id },
      data: {
        assignedToId: data.workerId,
        status: TaskStatus.ASSIGNED, // Reset to ASSIGNED on (re)assign
      },
      include: {
        assignedTo: { select: { id: true, firstName: true, lastName: true, email: true, avatarUrl: true } },
        createdBy: { select: { id: true, firstName: true, lastName: true, avatarUrl: true } },
      },
    });

    if (isReassign) {
      await this.createTaskEvent(data.id, data.userId, TaskEventType.UNASSIGNED, {
        previousWorkerId: previousAssignee,
      });
    }

    await this.createTaskEvent(data.id, data.userId, TaskEventType.ASSIGNED, {
      workerId: data.workerId,
      workerName: `${worker.firstName} ${worker.lastName}`,
    });

    // Notify worker
    this.notificationClient.emit('task_assigned', {
      task: updatedTask,
      workerId: data.workerId,
    });

    this.invalidateStatusCountsCache(updatedTask.organizationId);

    return success(updatedTask);
  }

  /**
   * Decline task assignment (TECHNICIAN only)
   * Returns task to NEW status and removes assignment
   */
  async decline(data: { id: string; userId: string; userRole: string; organizationId: string }) {
    const task = await this.prisma.task.findUnique({
      where: { id: data.id },
      include: {
        assignedTo: { select: { id: true, firstName: true, lastName: true, avatarUrl: true } },
      },
    });

    if (!task) {
      throw new NotFoundException('Task not found');
    }

    // Only assigned technician can decline
    if (task.assignedToId !== data.userId) {
      throw new ForbiddenException('You can only decline tasks assigned to you');
    }

    // Can only decline ASSIGNED tasks
    if (task.status !== TaskStatus.ASSIGNED) {
      throw new BadRequestException('Can only decline tasks that are in ASSIGNED status');
    }

    const previousWorker = task.assignedTo;

    const updatedTask = await this.prisma.task.update({
      where: { id: data.id },
      data: {
        assignedToId: null,
        status: TaskStatus.NEW,
      },
      include: {
        createdBy: { select: { id: true, firstName: true, lastName: true, avatarUrl: true } },
      },
    });

    await this.createTaskEvent(data.id, data.userId, TaskEventType.UNASSIGNED, {
      reason: 'Technician declined the assignment',
      previousWorkerId: previousWorker?.id,
      previousWorkerName: previousWorker ? `${previousWorker.firstName} ${previousWorker.lastName}` : null,
    });

    // Notify dispatcher/client that task was declined
    this.notificationClient.emit('task_declined', {
      task: updatedTask,
      declinedBy: previousWorker,
    });

    this.invalidateStatusCountsCache(updatedTask.organizationId);

    return success(updatedTask, 'Task declined and returned for reassignment');
  }

  /**
   * Update task status (role-based)
   * - TECHNICIAN: can update assigned tasks (IN_PROGRESS, BLOCKED, COMPLETED)
   * - CLIENT: can cancel their own tasks
   * - DISPATCHER: can cancel any task in their org
   */
  async updateStatus(data: {
    id: string;
    status: string;
    userId: string;
    userRole: string;
    organizationId: string;
    reason?: string;
    lat?: number;
    lng?: number;
  }) {
    const task = await this.prisma.task.findUnique({
      where: { id: data.id },
    });

    if (!task) {
      throw new NotFoundException('Task not found');
    }

    // Role-based authorization
    // Any assigned user can set execution statuses on their assigned tasks
    // ADMIN/DISPATCHER can also cancel tasks they have authority over.
    // Recognise BOTH the LEAD (assignedToId) and multi-assignee MEMBER rows.
    const isAssignedUser =
      task.assignedToId === data.userId ||
      !!(await this.prisma.taskAssignee.findFirst({
        where: { taskId: task.id, userId: data.userId },
        select: { id: true },
      }));
    const isExecutionStatus = data.status !== TaskStatus.CANCELED && data.status !== TaskStatus.ASSIGNED;
    const isCancelation = data.status === TaskStatus.CANCELED;

    if (isExecutionStatus) {
      // Execution statuses (ACCEPTED, EN_ROUTE, ARRIVED, IN_PROGRESS, BLOCKED, COMPLETED)
      // Only the assigned user can set these
      if (!isAssignedUser) {
        this.logger.warn(`Authorization denied: non-assigned user attempted status update`, { userId: data.userId, taskId: data.id, status: data.status });
        throw new ForbiddenException('You can only update execution status of tasks assigned to you');
      }
    } else if (isCancelation) {
      // Cancellation authorization
      switch (data.userRole) {
        case Role.ADMIN:
          if (task.createdById !== data.userId && task.organizationId !== data.organizationId) {
            throw new ForbiddenException('You can only cancel tasks in your organization');
          }
          break;
        case Role.MANAGER:
          if (task.organizationId !== data.organizationId) {
            throw new ForbiddenException('You can only cancel tasks in your organization');
          }
          break;
        case Role.EMPLOYEE:
          // Technicians (non-assigned) cannot cancel
          if (!isAssignedUser) {
            throw new ForbiddenException('You can only update status of tasks assigned to you');
          }
          throw new ForbiddenException('Technicians cannot cancel tasks. Contact the dispatcher.');
        default:
          // For any other role, check if they are the assigned user
          if (isAssignedUser) {
            // Assigned users cannot cancel their own tasks
            throw new ForbiddenException('You cannot cancel tasks assigned to you. Contact a dispatcher.');
          }
          throw new ForbiddenException('Access denied');
      }
    } else {
      throw new ForbiddenException('Access denied');
    }

    // Validate status transition — honor the task's workflow (its own, else its
    // space's) when present; otherwise the canonical field-service machine.
    let effWorkflowId: string | null = (task as any).workflowId ?? null;
    if (!effWorkflowId && (task as any).spaceId) {
      const sp = await this.prisma.companyLocation.findUnique({
        where: { id: (task as any).spaceId },
        select: { workflowId: true },
      });
      effWorkflowId = sp?.workflowId ?? null;
    }
    let allowedTransitions: string[] | null = null;
    if (effWorkflowId) {
      const cur = await this.prisma.workflowStatus.findFirst({
        where: { workflowId: effWorkflowId, key: task.status },
        select: { transitions: true },
      });
      if (cur) allowedTransitions = cur.transitions;
    }
    // Fallback to the canonical machine when there's no workflow, or the current
    // status isn't part of it (mixed/legacy data).
    if (allowedTransitions === null) {
      allowedTransitions = STATUS_TRANSITIONS[task.status as TaskStatus] || [];
    }
    if (!allowedTransitions.includes(data.status as string)) {
      throw new BadRequestException(
        `Invalid status transition from ${task.status} to ${data.status}. Allowed: ${allowedTransitions.join(', ') || 'none'}`,
      );
    }

    // ── Assigned user execution enforcement ──

    // (0) Location Verification — assigned user must be within geofence of task location to arrive/start
    const locationRequiredStatuses = [TaskStatus.ARRIVED, TaskStatus.IN_PROGRESS];

    if (
      isAssignedUser &&
      locationRequiredStatuses.includes(data.status as TaskStatus) &&
      task.locationLat != null &&
      task.locationLng != null
    ) {
      if (data.lat == null || data.lng == null) {
        throw new BadRequestException(
          'Location verification required. Please enable GPS and try again.',
        );
      }

      const distance = haversineDistance(data.lat, data.lng, task.locationLat, task.locationLng);

      if (distance > TasksService.GEOFENCE_RADIUS_METERS) {
        throw new BadRequestException(
          `You are ${Math.round(distance)}m from the job site. You must be within ${TasksService.GEOFENCE_RADIUS_METERS}m to ${data.status === TaskStatus.ARRIVED ? 'mark as arrived' : 'start the job'}. Please move closer and try again.`,
        );
      }
    }

    // (a) Due Date Gate — cannot start a task whose dueDate is in the future
    if (isAssignedUser && data.status === TaskStatus.EN_ROUTE) {
      if (task.dueDate) {
        const endOfToday = new Date();
        endOfToday.setHours(23, 59, 59, 999);
        if (task.dueDate > endOfToday) {
          throw new BadRequestException(
            'Cannot start this task yet — it is scheduled for a future date. You can start it on the due date.',
          );
        }
      }
    }

    // (b) Single Active Task — only one task in execution state at a time
    //     BLOCKED is excluded, so blocking a task frees the slot
    if (isAssignedUser && data.status === TaskStatus.ACCEPTED) {
      const activeTaskCount = await this.prisma.task.count({
        where: {
          assignedToId: data.userId,
          status: { in: [TaskStatus.ACCEPTED, TaskStatus.EN_ROUTE, TaskStatus.ARRIVED, TaskStatus.IN_PROGRESS] },
          id: { not: data.id },
        },
      });

      if (activeTaskCount > 0) {
        const activeTask = await this.prisma.task.findFirst({
          where: {
            assignedToId: data.userId,
            status: { in: [TaskStatus.ACCEPTED, TaskStatus.EN_ROUTE, TaskStatus.ARRIVED, TaskStatus.IN_PROGRESS] },
            id: { not: data.id },
          },
          select: { title: true },
        });
        throw new BadRequestException(
          `You already have an active task: "${activeTask?.title || 'Unknown'}". Complete or block it before accepting another.`,
        );
      }
    }

    // Build update data with route timestamps
    const updateData: any = { status: data.status as any };

    // Set routeStartedAt when transitioning to EN_ROUTE
    if (data.status === TaskStatus.EN_ROUTE) {
      updateData.routeStartedAt = new Date();
      // Reset route data for a fresh tracking session
      updateData.routeDistance = 0;
      updateData.routeEndedAt = null;
    }

    // Set routeEndedAt when transitioning to ARRIVED
    if (data.status === TaskStatus.ARRIVED) {
      updateData.routeEndedAt = new Date();
    }

    const updatedTask = await this.prisma.task.update({
      where: { id: data.id },
      data: updateData,
      include: {
        assignedTo: { select: { id: true, firstName: true, lastName: true, avatarUrl: true } },
        createdBy: { select: { id: true, firstName: true, lastName: true, avatarUrl: true } },
      },
    });

    await this.createTaskEvent(data.id, data.userId, TaskEventType.STATUS_CHANGED, {
      oldStatus: task.status,
      newStatus: data.status,
      reason: data.reason,
    });

    // Notify about status change
    this.notificationClient.emit('task_status_changed', {
      task: updatedTask,
      oldStatus: task.status,
      newStatus: data.status,
    });

    // (c) Blocked Task Reminder — after accepting a new task, remind about blocked ones
    if (isAssignedUser && data.status === TaskStatus.ACCEPTED) {
      try {
        const blockedTasks = await this.prisma.task.findMany({
          where: { assignedToId: data.userId, status: TaskStatus.BLOCKED },
          select: { id: true, title: true },
        });
        if (blockedTasks.length > 0) {
          this.notificationClient.emit('blocked_tasks_reminder', {
            userId: data.userId,
            blockedTasks: blockedTasks.map(t => ({ id: t.id, title: t.title })),
            newTaskId: data.id,
            newTaskTitle: updatedTask.title,
          });
        }
      } catch (err) {
        this.logger.warn('Failed to send blocked tasks reminder', err);
      }
    }

    this.invalidateStatusCountsCache(updatedTask.organizationId);

    return success(updatedTask);
  }

  /**
   * Delete a task (CLIENT only - own tasks)
   */
  async remove(data: { id: string; userId: string; userRole: string; organizationId: string }) {
    const task = await this.prisma.task.findUnique({
      where: { id: data.id },
    });

    if (!task) {
      throw new NotFoundException('Task not found');
    }

    // Authorization: CLIENT (org owner) can delete any task in their organization
    if (task.organizationId !== data.organizationId) {
      throw new ForbiddenException('You can only delete tasks in your organization');
    }

    // Don't allow deleting in-progress or completed tasks
    if ([TaskStatus.IN_PROGRESS, TaskStatus.COMPLETED, TaskStatus.CLOSED].includes(task.status as TaskStatus)) {
      throw new BadRequestException('Cannot delete a task that is in progress or completed');
    }

    await this.prisma.task.delete({ where: { id: data.id } });

    // Notify via Socket.IO for real-time updates
    this.notificationClient.emit('task_deleted', {
      taskId: data.id,
      organizationId: task.organizationId,
    });

    this.invalidateStatusCountsCache(task.organizationId);

    return success(null, 'Task deleted successfully');
  }

  /**
   * Get task timeline/activity
   */
  async getTimeline(data: { id: string; userId: string; userRole: string; organizationId: string }) {
    // First verify access
    const task = await this.prisma.task.findUnique({
      where: { id: data.id },
    });

    if (!task) {
      throw new NotFoundException('Task not found');
    }

    await this.checkTaskAccess(task, data.userId, data.userRole, data.organizationId);

    const events = await this.prisma.taskEvent.findMany({
      where: { taskId: data.id },
      orderBy: { createdAt: 'desc' },
      include: {
        user: { select: { id: true, firstName: true, lastName: true, avatarUrl: true } },
      },
    });

    return success(events);
  }

  /**
   * Check if user has access to a task
   */
  private async checkTaskAccess(
    task: any,
    userId: string,
    userRole: string,
    organizationId: string,
  ) {
    // Any user assigned to the task can access it (regardless of role). This
    // covers BOTH the legacy single-assignee field (LEAD, mirrored into
    // assignedToId) AND multi-assignee MEMBER rows in TaskAssignee — otherwise
    // a MEMBER assignee would be locked out of their own task.
    if (task.assignedToId === userId) {
      return;
    }
    if (Array.isArray(task.assignees)) {
      if (task.assignees.some((a: any) => a.userId === userId)) return;
    } else {
      const membership = await this.prisma.taskAssignee.findFirst({
        where: { taskId: task.id, userId },
        select: { id: true },
      });
      if (membership) return;
    }

    switch (userRole) {
      case Role.ADMIN:
        // ADMIN can access tasks they created or in their org
        if (task.createdById !== userId && task.organizationId !== organizationId) {
          this.logger.warn(`Authorization denied: ADMIN access to task outside org`, { userId, taskId: task.id });
          throw new ForbiddenException('Access denied');
        }
        break;

      case Role.MANAGER:
        // DISPATCHER can access all tasks in their org
        if (task.organizationId !== organizationId) {
          this.logger.warn(`Authorization denied: DISPATCHER access to task outside org`, { userId, taskId: task.id });
          throw new ForbiddenException('Access denied');
        }
        break;

      case Role.EMPLOYEE:
        // TECHNICIAN can only access tasks assigned to them (already checked above)
        this.logger.warn(`Authorization denied: TECHNICIAN access to unassigned task`, { userId, taskId: task.id });
        throw new ForbiddenException('Access denied');

      default:
        this.logger.warn(`Authorization denied: unknown role`, { userId, userRole, taskId: task.id });
        throw new ForbiddenException('Access denied');
    }
  }

  /**
   * Add a comment to a task
   */
  async addComment(data: {
    taskId: string;
    content: string;
    userId: string;
    userRole: string;
    organizationId: string;
  }) {
    // First verify the task exists and user has access
    const task = await this.prisma.task.findUnique({
      where: { id: data.taskId },
    });

    if (!task) {
      throw new NotFoundException('Task not found');
    }

    // Authorization check
    await this.checkTaskAccess(task, data.userId, data.userRole, data.organizationId);

    const comment = await this.prisma.comment.create({
      data: {
        content: data.content,
        taskId: data.taskId,
        userId: data.userId,
      },
      include: {
        user: { select: { id: true, firstName: true, lastName: true, avatarUrl: true } },
      },
    });

    // Create task event with comment preview
    await this.createTaskEvent(data.taskId, data.userId, TaskEventType.COMMENT_ADDED, {
      commentId: comment.id,
      content: data.content.length > 100 ? data.content.slice(0, 100) + '...' : data.content,
    });

    // Notify
    this.notificationClient.emit('task_comment_added', {
      taskId: data.taskId,
      comment,
    });

    return success(comment);
  }

  /**
   * Get comments for a task
   */
  async getComments(data: {
    taskId: string;
    userId: string;
    userRole: string;
    organizationId: string;
  }) {
    // First verify the task exists and user has access
    const task = await this.prisma.task.findUnique({
      where: { id: data.taskId },
    });

    if (!task) {
      throw new NotFoundException('Task not found');
    }

    // Authorization check
    await this.checkTaskAccess(task, data.userId, data.userRole, data.organizationId);

    const comments = await this.prisma.comment.findMany({
      where: { taskId: data.taskId },
      orderBy: { createdAt: 'desc' },
      include: {
        user: { select: { id: true, firstName: true, lastName: true, avatarUrl: true } },
      },
    });

    return success(comments);
  }

  /**
   * Create a task event for audit trail
   */
  private async createTaskEvent(
    taskId: string,
    userId: string,
    eventType: TaskEventType,
    metadata?: Record<string, any>,
  ) {
    return this.prisma.taskEvent.create({
      data: {
        taskId,
        userId,
        eventType,
        metadata,
      },
    });
  }

  // ============ Assignee Methods ============

  /**
   * Add an assignee to a task
   */
  async addAssignee(data: {
    taskId: string;
    userId: string;
    role?: string;
    requestUserId: string;
    userRole: string;
    organizationId: string;
  }) {
    const task = await this.prisma.task.findUnique({ where: { id: data.taskId } });
    if (!task) throw new NotFoundException('Task not found');
    if (task.organizationId !== data.organizationId) {
      throw new ForbiddenException('You can only manage assignees for tasks in your organization');
    }

    // Verify the target user exists in the organization
    const user = await this.prisma.user.findFirst({
      where: { id: data.userId, organizationId: data.organizationId, isActive: true },
      select: { id: true, firstName: true, lastName: true, avatarUrl: true },
    });
    if (!user) throw new NotFoundException('User not found or not in your organization');

    const role = (data.role as any) || 'MEMBER';

    // If adding as LEAD, demote existing LEAD to MEMBER
    if (role === 'LEAD') {
      await this.prisma.taskAssignee.updateMany({
        where: { taskId: data.taskId, role: 'LEAD' },
        data: { role: 'MEMBER' },
      });
    }

    const assignee = await this.prisma.taskAssignee.upsert({
      where: { taskId_userId: { taskId: data.taskId, userId: data.userId } },
      create: { taskId: data.taskId, userId: data.userId, role },
      update: { role },
      include: {
        user: { select: { id: true, firstName: true, lastName: true, email: true, avatarUrl: true } },
      },
    });

    // Sync the primary assignedToId field
    await this.syncPrimaryAssignee(data.taskId);

    await this.createTaskEvent(data.taskId, data.requestUserId, TaskEventType.ASSIGNEE_ADDED, {
      assigneeId: data.userId,
      assigneeName: `${user.firstName} ${user.lastName}`,
      role,
    });

    this.notificationClient.emit('task_updated', { task: { ...task, id: data.taskId } });

    return success(assignee);
  }

  /**
   * Remove an assignee from a task
   */
  async removeAssignee(data: {
    taskId: string;
    userId: string;
    requestUserId: string;
    userRole: string;
    organizationId: string;
  }) {
    const task = await this.prisma.task.findUnique({ where: { id: data.taskId } });
    if (!task) throw new NotFoundException('Task not found');
    if (task.organizationId !== data.organizationId) {
      throw new ForbiddenException('You can only manage assignees for tasks in your organization');
    }

    const existing = await this.prisma.taskAssignee.findUnique({
      where: { taskId_userId: { taskId: data.taskId, userId: data.userId } },
      include: { user: { select: { id: true, firstName: true, lastName: true, avatarUrl: true } } },
    });
    if (!existing) throw new NotFoundException('Assignee not found on this task');

    await this.prisma.taskAssignee.delete({
      where: { taskId_userId: { taskId: data.taskId, userId: data.userId } },
    });

    // Sync the primary assignedToId field
    await this.syncPrimaryAssignee(data.taskId);

    await this.createTaskEvent(data.taskId, data.requestUserId, TaskEventType.ASSIGNEE_REMOVED, {
      assigneeId: data.userId,
      assigneeName: existing.user ? `${existing.user.firstName} ${existing.user.lastName}` : '',
    });

    this.notificationClient.emit('task_updated', { task: { ...task, id: data.taskId } });

    return success(null, 'Assignee removed');
  }

  /**
   * Sync the legacy assignedToId field with the LEAD assignee from TaskAssignee records.
   * This keeps backward compatibility with existing single-assignee flows.
   */
  private async syncPrimaryAssignee(taskId: string) {
    const leadAssignee = await this.prisma.taskAssignee.findFirst({
      where: { taskId, role: 'LEAD' },
    });

    await this.prisma.task.update({
      where: { id: taskId },
      data: { assignedToId: leadAssignee?.userId || null },
    });
  }

  // ============ Checklist Methods ============

  /**
   * Add a checklist item to a task
   */
  async addChecklistItem(data: {
    taskId: string;
    text: string;
    position?: number;
    userId: string;
    userRole: string;
    organizationId: string;
  }) {
    const task = await this.prisma.task.findUnique({ where: { id: data.taskId } });
    if (!task) throw new NotFoundException('Task not found');
    await this.checkTaskAccess(task, data.userId, data.userRole, data.organizationId);

    // Determine position: use provided or append at end
    let position = data.position;
    if (position === undefined || position === null) {
      const lastItem = await this.prisma.checklistItem.findFirst({
        where: { taskId: data.taskId },
        orderBy: { position: 'desc' },
        select: { position: true },
      });
      position = (lastItem?.position ?? -1) + 1;
    }

    const item = await this.prisma.checklistItem.create({
      data: {
        taskId: data.taskId,
        text: data.text,
        position,
      },
    });

    await this.createTaskEvent(data.taskId, data.userId, TaskEventType.CHECKLIST_ITEM_ADDED, {
      itemId: item.id,
      text: data.text,
    });

    this.notificationClient.emit('task_updated', { task: { ...task, id: data.taskId } });

    return success(item);
  }

  /**
   * Update a checklist item (toggle completion or update text)
   */
  async updateChecklistItem(data: {
    taskId: string;
    itemId: string;
    text?: string;
    isCompleted?: boolean;
    userId: string;
    userRole: string;
    organizationId: string;
  }) {
    const task = await this.prisma.task.findUnique({ where: { id: data.taskId } });
    if (!task) throw new NotFoundException('Task not found');
    await this.checkTaskAccess(task, data.userId, data.userRole, data.organizationId);

    const existing = await this.prisma.checklistItem.findFirst({
      where: { id: data.itemId, taskId: data.taskId },
    });
    if (!existing) throw new NotFoundException('Checklist item not found');

    const updateData: any = {};
    if (data.text !== undefined) updateData.text = data.text;
    if (data.isCompleted !== undefined) updateData.isCompleted = data.isCompleted;

    const item = await this.prisma.checklistItem.update({
      where: { id: data.itemId },
      data: updateData,
    });

    if (data.isCompleted !== undefined) {
      await this.createTaskEvent(data.taskId, data.userId, TaskEventType.CHECKLIST_ITEM_TOGGLED, {
        itemId: item.id,
        text: item.text,
        isCompleted: item.isCompleted,
      });
    }

    this.notificationClient.emit('task_updated', { task: { ...task, id: data.taskId } });

    return success(item);
  }

  /**
   * Delete a checklist item
   */
  async deleteChecklistItem(data: {
    taskId: string;
    itemId: string;
    userId: string;
    userRole: string;
    organizationId: string;
  }) {
    const task = await this.prisma.task.findUnique({ where: { id: data.taskId } });
    if (!task) throw new NotFoundException('Task not found');
    await this.checkTaskAccess(task, data.userId, data.userRole, data.organizationId);

    const existing = await this.prisma.checklistItem.findFirst({
      where: { id: data.itemId, taskId: data.taskId },
    });
    if (!existing) throw new NotFoundException('Checklist item not found');

    await this.prisma.checklistItem.delete({ where: { id: data.itemId } });

    await this.createTaskEvent(data.taskId, data.userId, TaskEventType.CHECKLIST_ITEM_REMOVED, {
      itemId: data.itemId,
      text: existing.text,
    });

    this.notificationClient.emit('task_updated', { task: { ...task, id: data.taskId } });

    return success(null, 'Checklist item deleted');
  }

  /**
   * Reorder checklist items
   */
  async reorderChecklist(data: {
    taskId: string;
    itemIds: string[];
    userId: string;
    userRole: string;
    organizationId: string;
  }) {
    const task = await this.prisma.task.findUnique({ where: { id: data.taskId } });
    if (!task) throw new NotFoundException('Task not found');
    await this.checkTaskAccess(task, data.userId, data.userRole, data.organizationId);

    // Update positions in a transaction
    await this.prisma.$transaction(
      data.itemIds.map((itemId, index) =>
        this.prisma.checklistItem.updateMany({
          where: { id: itemId, taskId: data.taskId },
          data: { position: index },
        }),
      ),
    );

    // Fetch the reordered items
    const items = await this.prisma.checklistItem.findMany({
      where: { taskId: data.taskId },
      orderBy: { position: 'asc' },
    });

    return success(items);
  }

  /**
   * Get task assignees (READ - for direct microservice calls)
   */
  async getAssignees(data: {
    taskId: string;
    userId: string;
    userRole: string;
    organizationId: string;
  }) {
    const task = await this.prisma.task.findUnique({ where: { id: data.taskId } });
    if (!task) throw new NotFoundException('Task not found');
    await this.checkTaskAccess(task, data.userId, data.userRole, data.organizationId);

    const assignees = await this.prisma.taskAssignee.findMany({
      where: { taskId: data.taskId },
      include: {
        user: { select: { id: true, firstName: true, lastName: true, email: true, avatarUrl: true } },
      },
      orderBy: { createdAt: 'asc' },
    });

    return success(assignees);
  }

  /**
   * Get task checklist items (READ - for direct microservice calls)
   */
  async getChecklist(data: {
    taskId: string;
    userId: string;
    userRole: string;
    organizationId: string;
  }) {
    const task = await this.prisma.task.findUnique({ where: { id: data.taskId } });
    if (!task) throw new NotFoundException('Task not found');
    await this.checkTaskAccess(task, data.userId, data.userRole, data.organizationId);

    const items = await this.prisma.checklistItem.findMany({
      where: { taskId: data.taskId },
      orderBy: { position: 'asc' },
    });

    return success(items);
  }

  /**
   * Get task counts grouped by status
   * Returns counts for all statuses based on role-based filtering
   */
  async getStatusCounts(query: {
    userId: string;
    userRole: string;
    organizationId: string;
    spaceId?: string;
  }) {
    const { userId, userRole, organizationId, spaceId } = query;

    if (!userRole) {
      return success({});
    }

    // Check Redis cache first
    const cacheKey = `status_counts:${userRole}:${userId}:${organizationId}${spaceId ? `:${spaceId}` : ''}`;
    try {
      const cached = await this.redis.get(cacheKey);
      if (cached) {
        return success(JSON.parse(cached));
      }
    } catch (err) {
      this.logger.warn('Redis cache read failed for status counts', err);
    }

    // Build where clause based on role (same logic as findAll)
    const where: any = {};

    switch (userRole) {
      case Role.ADMIN:
        where.organizationId = organizationId;
        where.createdById = userId;
        break;

      case Role.MANAGER:
        where.organizationId = organizationId;
        break;

      case Role.EMPLOYEE:
        where.assignedToId = userId;
        break;
    }

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

    // Get counts grouped by status using Prisma groupBy
    const statusCounts = await this.prisma.task.groupBy({
      by: ['status'],
      where,
      _count: {
        status: true,
      },
    });

    // Transform to a simple object { NEW: 5, ASSIGNED: 3, ... }
    const counts: Record<string, number> = {};
    let total = 0;
    for (const item of statusCounts) {
      counts[item.status] = item._count.status;
      total += item._count.status;
    }
    counts['all'] = total;

    // Cache for 30 seconds
    try {
      await this.redis.setex(cacheKey, STATUS_COUNTS_TTL, JSON.stringify(counts));
    } catch (err) {
      this.logger.warn('Redis cache write failed for status counts', err);
    }

    return success(counts);
  }

  /**
   * Invalidate status counts cache for an organization
   * Called after task create/update/delete/status-change operations
   */
  private async invalidateStatusCountsCache(organizationId: string) {
    try {
      const keys = await this.redis.keys(`status_counts:*:*:${organizationId}`);
      if (keys.length > 0) {
        await this.redis.del(...keys);
      }
    } catch (err) {
      this.logger.warn('Failed to invalidate status counts cache', err);
    }
  }

  /**
   * Get suggested technicians for a task with weighted scoring
   *
   * Scoring weights:
   * - Distance (30%): Closer to task location is better
   * - Availability (25%): Has capacity for more jobs today
   * - Specialization (20%): Matches task specialty/category
   * - Workload (15%): Fewer active tasks is better
   * - Rating (10%): Higher rating is better
   */
  async getSuggestedTechnicians(data: {
    taskId: string;
    userId: string;
    userRole: string;
    organizationId: string;
  }) {
    // First verify task exists and user has access
    const task = await this.prisma.task.findUnique({
      where: { id: data.taskId },
    });

    if (!task) {
      throw new NotFoundException('Task not found');
    }

    // Authorization: Only DISPATCHER or CLIENT can see suggested technicians
    if (data.userRole !== Role.MANAGER && data.userRole !== Role.ADMIN) {
      throw new ForbiddenException('Only dispatchers and clients can view suggested technicians');
    }

    if (task.organizationId !== data.organizationId) {
      throw new ForbiddenException('Task is not in your organization');
    }

    // Get all active members in the organization (exclude ON_SITE workers who can't be assigned to tasks, exclude task creator)
    const technicians = await this.prisma.user.findMany({
      where: {
        organizationId: data.organizationId,
        isActive: true,
        id: { not: task.createdById ?? undefined },
      },
      take: TasksService.SUGGESTION_LIMIT, // Cap to prevent unbounded queries in large orgs
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        specialty: true,
        rating: true,
        ratingCount: true,
        maxDailyJobs: true,
        lastLocation: {
          select: { lat: true, lng: true, updatedAt: true },
        },
        _count: {
          select: {
            assignedTasks: {
              where: {
                status: {
                  in: [TaskStatus.ASSIGNED, TaskStatus.ACCEPTED, TaskStatus.EN_ROUTE, TaskStatus.ARRIVED, TaskStatus.IN_PROGRESS],
                },
              },
            },
          },
        },
      },
    });

    // Get today's date range for workload calculation
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const todayEnd = new Date();
    todayEnd.setHours(23, 59, 59, 999);

    // Batch query: get today's completed task counts for all technicians at once (avoids N+1)
    const techIds = technicians.map((t) => t.id);
    const todayCompletedCounts = await this.prisma.task.groupBy({
      by: ['assignedToId'],
      where: {
        assignedToId: { in: techIds },
        status: TaskStatus.COMPLETED,
        updatedAt: {
          gte: todayStart,
          lte: todayEnd,
        },
      },
      _count: { id: true },
    });

    const completedCountMap = new Map<string, number>();
    for (const row of todayCompletedCounts) {
      if (row.assignedToId) {
        completedCountMap.set(row.assignedToId, row._count.id);
      }
    }

    // Calculate scores for each technician
    const scoredTechnicians = technicians.map((tech) => {
        const todayCompletedCount = completedCountMap.get(tech.id) || 0;

        const activeTaskCount = tech._count.assignedTasks;
        const todayTaskCount = activeTaskCount + todayCompletedCount;
        const maxDailyJobs = tech.maxDailyJobs || 5;

        // Calculate individual scores (0-100 scale)
        const distanceScore = this.calculateDistanceScore(task, tech.lastLocation);
        const availabilityScore = this.calculateAvailabilityScore(todayTaskCount, maxDailyJobs);
        const specializationScore = this.calculateSpecializationScore(task.title, tech.specialty);
        const workloadScore = this.calculateWorkloadScore(activeTaskCount);
        const ratingScore = this.calculateRatingScore(tech.rating);

        // Weighted total score
        const totalScore =
          distanceScore * 0.30 +
          availabilityScore * 0.25 +
          specializationScore * 0.20 +
          workloadScore * 0.15 +
          ratingScore * 0.10;

        // Calculate distance in km
        const distanceKm = this.calculateDistance(
          task.locationLat,
          task.locationLng,
          tech.lastLocation?.lat,
          tech.lastLocation?.lng,
        );

        return {
          id: tech.id,
          firstName: tech.firstName,
          lastName: tech.lastName,
          email: tech.email,
          specialty: tech.specialty,
          rating: tech.rating || 5.0,
          ratingCount: tech.ratingCount || 0,
          activeTaskCount,
          todayTaskCount,
          maxDailyJobs,
          distanceKm: distanceKm !== null ? Math.round(distanceKm * 10) / 10 : null,
          hasLocation: !!tech.lastLocation,
          score: Math.round(totalScore * 100) / 100,
          scoreBreakdown: {
            distance: Math.round(distanceScore),
            availability: Math.round(availabilityScore),
            specialization: Math.round(specializationScore),
            workload: Math.round(workloadScore),
            rating: Math.round(ratingScore),
          },
        };
      });

    // Sort by score (highest first)
    scoredTechnicians.sort((a, b) => b.score - a.score);

    return success({
      taskId: data.taskId,
      technicians: scoredTechnicians,
      suggestedTechnicianId: scoredTechnicians.length > 0 ? scoredTechnicians[0].id : null,
    });
  }

  /**
   * Calculate distance score (0-100)
   * Closer = higher score
   */
  private calculateDistanceScore(
    task: { locationLat: number | null; locationLng: number | null },
    techLocation: { lat: number; lng: number } | null,
  ): number {
    if (!task.locationLat || !task.locationLng || !techLocation) {
      return 50; // Neutral score if no location data
    }

    const distanceKm = this.calculateDistance(
      task.locationLat,
      task.locationLng,
      techLocation.lat,
      techLocation.lng,
    );

    if (distanceKm === null) return 50;

    // Score based on distance thresholds:
    // 0-5km: 100, 5-10km: 80, 10-20km: 60, 20-50km: 40, 50+km: 20
    if (distanceKm <= 5) return 100;
    if (distanceKm <= 10) return 80;
    if (distanceKm <= 20) return 60;
    if (distanceKm <= 50) return 40;
    return 20;
  }

  /**
   * Calculate availability score (0-100)
   * More remaining capacity = higher score
   */
  private calculateAvailabilityScore(currentTasks: number, maxTasks: number): number {
    if (currentTasks >= maxTasks) return 0; // At capacity
    const remainingCapacity = maxTasks - currentTasks;
    const capacityRatio = remainingCapacity / maxTasks;
    return Math.round(capacityRatio * 100);
  }

  /**
   * Calculate specialization score (0-100)
   * Matching specialty = higher score
   */
  private calculateSpecializationScore(taskTitle: string, techSpecialty: string | null): number {
    if (!techSpecialty) return 50; // Neutral if no specialty

    const titleLower = taskTitle.toLowerCase();
    const specialtyLower = techSpecialty.toLowerCase();

    // Direct match in title
    if (titleLower.includes(specialtyLower)) return 100;

    // Related keywords
    const specialtyKeywords: Record<string, string[]> = {
      electrical: ['electric', 'wiring', 'outlet', 'switch', 'panel', 'circuit', 'light', 'power'],
      plumbing: ['plumb', 'pipe', 'drain', 'leak', 'faucet', 'toilet', 'water', 'sewer'],
      mechanical: ['mechanic', 'machine', 'motor', 'engine', 'repair', 'hvac', 'ac', 'heating'],
      general: [], // General matches anything
    };

    const keywords = specialtyKeywords[specialtyLower] || [];

    // Check if any keyword matches
    for (const keyword of keywords) {
      if (titleLower.includes(keyword)) return 80;
    }

    // General specialty gets neutral score
    if (specialtyLower === 'general') return 50;

    return 30; // No match
  }

  /**
   * Calculate workload score (0-100)
   * Fewer active tasks = higher score
   */
  private calculateWorkloadScore(activeTaskCount: number): number {
    // 0 tasks: 100, 1: 80, 2: 60, 3: 40, 4: 20, 5+: 0
    if (activeTaskCount === 0) return 100;
    if (activeTaskCount === 1) return 80;
    if (activeTaskCount === 2) return 60;
    if (activeTaskCount === 3) return 40;
    if (activeTaskCount === 4) return 20;
    return 0;
  }

  /**
   * Calculate rating score (0-100)
   * Higher rating = higher score
   */
  private calculateRatingScore(rating: number | null): number {
    if (rating === null) return 50; // Neutral for no rating
    // Scale 1-5 rating to 0-100
    return Math.round(((rating - 1) / 4) * 100);
  }

  /**
   * Calculate distance between two points using Haversine formula
   * Returns distance in kilometers
   */
  private calculateDistance(
    lat1: number | null,
    lng1: number | null,
    lat2: number | null | undefined,
    lng2: number | null | undefined,
  ): number | null {
    if (lat1 === null || lng1 === null || lat2 === null || lat2 === undefined || lng2 === null || lng2 === undefined) {
      return null;
    }

    const R = 6371; // Earth's radius in km
    const dLat = this.toRad(lat2 - lat1);
    const dLng = this.toRad(lng2 - lng1);

    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(this.toRad(lat1)) * Math.cos(this.toRad(lat2)) *
      Math.sin(dLng / 2) * Math.sin(dLng / 2);

    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }

  private toRad(deg: number): number {
    return deg * (Math.PI / 180);
  }

  // ============ Subtask Methods ============

  private static readonly MAX_SUBTASK_DEPTH = 5;

  /**
   * Create a subtask under a parent task
   */
  async createSubtask(data: any) {
    const parent = await this.prisma.task.findUnique({
      where: { id: data.parentId },
    });

    if (!parent) {
      throw new NotFoundException('Parent task not found');
    }

    if (parent.organizationId !== data.organizationId) {
      throw new ForbiddenException('Parent task is not in your organization');
    }

    // Verify no circular parent-child relationship
    let current: string | null = data.parentId;
    const visited = new Set<string>();
    while (current) {
      if (visited.has(current)) {
        throw new BadRequestException('Circular parent-child relationship detected');
      }
      visited.add(current);
      const p = await this.prisma.task.findUnique({ where: { id: current }, select: { parentId: true } });
      current = p?.parentId || null;
    }

    // Validate depth
    const newDepth = (parent.depth ?? 0) + 1;
    if (newDepth > TasksService.MAX_SUBTASK_DEPTH) {
      throw new BadRequestException(
        `Maximum subtask nesting depth is ${TasksService.MAX_SUBTASK_DEPTH}. Current parent is at depth ${parent.depth ?? 0}.`,
      );
    }

    // Determine position among siblings
    const lastSibling = await this.prisma.task.findFirst({
      where: { parentId: data.parentId },
      orderBy: { position: 'desc' },
      select: { position: true },
    });
    const position = (lastSibling?.position ?? -1) + 1;

    const hasAssignment = !!data.assignedToId;

    const task = await this.prisma.task.create({
      data: {
        title: data.title,
        description: data.description,
        priority: data.priority || 'MEDIUM',
        status: hasAssignment ? TaskStatus.ASSIGNED : TaskStatus.NEW,
        dueDate: data.dueDate ? new Date(data.dueDate) : null,
        startDate: data.startDate ? new Date(data.startDate) : null,
        estimatedHours: data.estimatedHours ?? null,
        locationLat: data.locationLat,
        locationLng: data.locationLng,
        locationAddress: data.locationAddress,
        organizationId: data.organizationId,
        createdById: data.userId,
        assignedToId: data.assignedToId || null,
        assetId: data.assetId || null,
        parentId: data.parentId,
        depth: newDepth,
        position,
        phaseId: data.phaseId || null,
        sprintId: data.sprintId || null,
        epicId: data.epicId || null,
        storyPoints: data.storyPoints ?? null,
      },
      include: {
        createdBy: { select: { id: true, firstName: true, lastName: true, email: true, avatarUrl: true } },
        assignedTo: { select: { id: true, firstName: true, lastName: true, email: true, avatarUrl: true } },
        parent: { select: { id: true, title: true } },
      },
    });

    await this.createTaskEvent(task.id, data.userId, TaskEventType.CREATED, {
      parentId: data.parentId,
      parentTitle: parent.title,
    });

    this.notificationClient.emit('task_created', task);
    this.invalidateStatusCountsCache(task.organizationId);

    return success(task);
  }

  /**
   * Get subtasks of a task
   */
  async getSubtasks(data: {
    taskId: string;
    userId: string;
    userRole: string;
    organizationId: string;
  }) {
    const task = await this.prisma.task.findUnique({
      where: { id: data.taskId },
    });

    if (!task) {
      throw new NotFoundException('Task not found');
    }

    await this.checkTaskAccess(task, data.userId, data.userRole, data.organizationId);

    const subtasks = await this.prisma.task.findMany({
      where: { parentId: data.taskId },
      orderBy: { position: 'asc' },
      include: {
        assignedTo: { select: { id: true, firstName: true, lastName: true, avatarUrl: true } },
        _count: { select: { subtasks: true, checklistItems: true } },
      },
    });

    return success(subtasks);
  }

  // ============ Dependency Methods ============

  /**
   * Add a dependency between two tasks
   */
  async addDependency(data: {
    predecessorId: string;
    successorId: string;
    type?: string;
    lagDays?: number;
    userId: string;
    organizationId: string;
  }) {
    // Validate both tasks exist and belong to the same org
    const [predecessor, successor] = await Promise.all([
      this.prisma.task.findUnique({ where: { id: data.predecessorId } }),
      this.prisma.task.findUnique({ where: { id: data.successorId } }),
    ]);

    if (!predecessor) {
      throw new NotFoundException('Predecessor task not found');
    }
    if (!successor) {
      throw new NotFoundException('Successor task not found');
    }

    if (predecessor.organizationId !== data.organizationId) {
      throw new ForbiddenException('Predecessor task is not in your organization');
    }
    if (successor.organizationId !== data.organizationId) {
      throw new ForbiddenException('Successor task is not in your organization');
    }

    if (data.predecessorId === data.successorId) {
      throw new BadRequestException('A task cannot depend on itself');
    }

    // Check for circular dependency
    const hasCircular = await this.detectCircularDependency(data.successorId, data.predecessorId);
    if (hasCircular) {
      throw new BadRequestException(
        'Adding this dependency would create a circular dependency chain',
      );
    }

    // Check if dependency already exists
    const existing = await this.prisma.taskDependency.findUnique({
      where: {
        predecessorId_successorId: {
          predecessorId: data.predecessorId,
          successorId: data.successorId,
        },
      },
    });

    if (existing) {
      throw new BadRequestException('This dependency already exists');
    }

    const dependency = await this.prisma.taskDependency.create({
      data: {
        predecessorId: data.predecessorId,
        successorId: data.successorId,
        type: (data.type as any) || 'FINISH_TO_START',
        lagDays: data.lagDays ?? 0,
      },
      include: {
        predecessor: { select: { id: true, title: true, status: true } },
        successor: { select: { id: true, title: true, status: true } },
      },
    });

    return success(dependency);
  }

  /**
   * Remove a dependency
   */
  async removeDependency(data: {
    dependencyId: string;
    userId: string;
    organizationId: string;
  }) {
    const dependency = await this.prisma.taskDependency.findUnique({
      where: { id: data.dependencyId },
      include: {
        predecessor: { select: { organizationId: true } },
      },
    });

    if (!dependency) {
      throw new NotFoundException('Dependency not found');
    }

    if (dependency.predecessor.organizationId !== data.organizationId) {
      throw new ForbiddenException('Dependency is not in your organization');
    }

    await this.prisma.taskDependency.delete({
      where: { id: data.dependencyId },
    });

    return success(null, 'Dependency removed successfully');
  }

  /**
   * Detect circular dependencies by walking the predecessor chain.
   * Returns true if adding a dependency from predecessorId to successorId
   * would create a cycle.
   *
   * We check: does successorId eventually reach predecessorId
   * through existing predecessor chains?
   */
  private async detectCircularDependency(
    fromTaskId: string,
    targetTaskId: string,
    visited: Set<string> = new Set(),
    maxDepth: number = TasksService.MAX_DEPENDENCY_DEPTH,
  ): Promise<boolean> {
    if (maxDepth <= 0) {
      throw new BadRequestException('Dependency chain too deep — possible circular dependency');
    }

    if (fromTaskId === targetTaskId) {
      return true;
    }

    if (visited.has(fromTaskId)) {
      return false;
    }

    visited.add(fromTaskId);

    // Find all tasks that fromTaskId is a predecessor of
    const dependencies = await this.prisma.taskDependency.findMany({
      where: { predecessorId: fromTaskId },
      select: { successorId: true },
    });

    for (const dep of dependencies) {
      const hasCycle = await this.detectCircularDependency(
        dep.successorId,
        targetTaskId,
        visited,
        maxDepth - 1,
      );
      if (hasCycle) {
        return true;
      }
    }

    return false;
  }
}
