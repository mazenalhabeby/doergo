import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  Inject,
} from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { PrismaService } from '../../common/prisma/prisma.service';
import {
  TaskStatus,
  TaskEventType,
  Role,
  STATUS_TRANSITIONS,
  isValidStatusTransition,
  canRoleSetStatus,
  success,
  paginated,
} from '@doergo/shared';

@Injectable()
export class TasksService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject('NOTIFICATION_SERVICE') private readonly notificationClient: ClientProxy,
  ) {}

  /**
   * Create a new task (CLIENT or DISPATCHER)
   */
  async create(data: any) {
    const task = await this.prisma.task.create({
      data: {
        title: data.title,
        description: data.description,
        priority: data.priority || 'MEDIUM',
        status: TaskStatus.NEW, // New tasks start as NEW
        dueDate: data.dueDate ? new Date(data.dueDate) : null,
        locationLat: data.locationLat,
        locationLng: data.locationLng,
        locationAddress: data.locationAddress,
        organizationId: data.organizationId,
        createdById: data.userId, // Map from gateway's userId
        assetId: data.assetId || null,
      },
      include: {
        createdBy: {
          select: { id: true, firstName: true, lastName: true, email: true },
        },
        organization: {
          select: { id: true, name: true },
        },
      },
    });

    // Create task event
    await this.createTaskEvent(task.id, data.userId, TaskEventType.CREATED);

    // Notify
    this.notificationClient.emit('task_created', task);

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
      limit = 10,
      status,
      priority,
      userId,
      userRole,
      organizationId,
    } = query;
    const skip = (page - 1) * Number(limit);
    const take = Number(limit);

    // Build where clause based on role
    const where: any = {};

    // Status filter
    if (status) where.status = status;

    // Priority filter
    if (priority) where.priority = priority;

    // Role-based filtering
    switch (userRole) {
      case Role.CLIENT:
        // CLIENT sees only their own tasks in their org
        where.organizationId = organizationId;
        where.createdById = userId;
        break;

      case Role.DISPATCHER:
        // DISPATCHER sees all tasks in their org
        // TODO: Also include tasks from orgs they have access to via OrganizationAccess
        where.organizationId = organizationId;
        break;

      case Role.TECHNICIAN:
        // TECHNICIAN sees only tasks assigned to them
        where.assignedToId = userId;
        break;

      default:
        // No access
        return paginated([], { page: Number(page), limit: take, total: 0 });
    }

    const [tasks, total] = await Promise.all([
      this.prisma.task.findMany({
        where,
        skip,
        take,
        orderBy: { createdAt: 'desc' },
        include: {
          createdBy: { select: { id: true, firstName: true, lastName: true } },
          assignedTo: { select: { id: true, firstName: true, lastName: true } },
          organization: { select: { id: true, name: true } },
          asset: {
            select: {
              id: true,
              name: true,
              serialNumber: true,
              category: { select: { id: true, name: true } },
              type: { select: { id: true, name: true } },
            },
          },
        },
      }),
      this.prisma.task.count({ where }),
    ]);

    return paginated(tasks, { page: Number(page), limit: take, total });
  }

  /**
   * Find a single task by ID with authorization
   */
  async findOne(data: { id: string; userId: string; userRole: string; organizationId: string }) {
    const task = await this.prisma.task.findUnique({
      where: { id: data.id },
      include: {
        createdBy: { select: { id: true, firstName: true, lastName: true, email: true } },
        assignedTo: { select: { id: true, firstName: true, lastName: true, email: true } },
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
          include: { user: { select: { id: true, firstName: true, lastName: true } } },
        },
        attachments: { orderBy: { createdAt: 'desc' } },
      },
    });

    if (!task) {
      throw new NotFoundException('Task not found');
    }

    // Authorization check
    this.checkTaskAccess(task, data.userId, data.userRole, data.organizationId);

    return success(task);
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
        ...(updateData.locationLat !== undefined && { locationLat: updateData.locationLat }),
        ...(updateData.locationLng !== undefined && { locationLng: updateData.locationLng }),
        ...(updateData.locationAddress !== undefined && { locationAddress: updateData.locationAddress }),
        ...(updateData.assetId !== undefined && { assetId: updateData.assetId }),
      },
      include: {
        createdBy: { select: { id: true, firstName: true, lastName: true } },
        assignedTo: { select: { id: true, firstName: true, lastName: true } },
      },
    });

    await this.createTaskEvent(id, userId, TaskEventType.UPDATED, { changes: updateData });

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
      throw new ForbiddenException('You can only assign tasks in your organization');
    }

    // Verify the task is in a state that can be assigned
    if (![TaskStatus.NEW, TaskStatus.ASSIGNED].includes(task.status as TaskStatus)) {
      throw new BadRequestException(`Cannot assign a task with status ${task.status}`);
    }

    // Verify the worker exists and is a TECHNICIAN in the same org
    const worker = await this.prisma.user.findFirst({
      where: {
        id: data.workerId,
        role: Role.TECHNICIAN,
        organizationId: data.organizationId,
      },
    });

    if (!worker) {
      throw new NotFoundException('Technician not found or not in your organization');
    }

    const updatedTask = await this.prisma.task.update({
      where: { id: data.id },
      data: {
        assignedToId: data.workerId,
        status: TaskStatus.ASSIGNED,
      },
      include: {
        assignedTo: { select: { id: true, firstName: true, lastName: true, email: true } },
        createdBy: { select: { id: true, firstName: true, lastName: true } },
      },
    });

    await this.createTaskEvent(data.id, data.userId, TaskEventType.ASSIGNED, {
      workerId: data.workerId,
      workerName: `${worker.firstName} ${worker.lastName}`,
    });

    // Notify worker
    this.notificationClient.emit('task_assigned', {
      task: updatedTask,
      workerId: data.workerId,
    });

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
        assignedTo: { select: { id: true, firstName: true, lastName: true } },
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
        createdBy: { select: { id: true, firstName: true, lastName: true } },
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
  }) {
    const task = await this.prisma.task.findUnique({
      where: { id: data.id },
    });

    if (!task) {
      throw new NotFoundException('Task not found');
    }

    // Role-based authorization
    switch (data.userRole) {
      case Role.TECHNICIAN:
        // TECHNICIAN can only update tasks assigned to them
        if (task.assignedToId !== data.userId) {
          throw new ForbiddenException('You can only update status of tasks assigned to you');
        }
        // TECHNICIAN can only set execution statuses (not CANCELED - that's for CLIENT/DISPATCHER)
        if (data.status === TaskStatus.CANCELED) {
          throw new ForbiddenException('Technicians cannot cancel tasks. Contact the dispatcher.');
        }
        break;

      case Role.CLIENT:
        // CLIENT can only update their own tasks
        if (task.createdById !== data.userId || task.organizationId !== data.organizationId) {
          throw new ForbiddenException('You can only update status of your own tasks');
        }
        // CLIENT can only cancel (not change execution status)
        if (data.status !== TaskStatus.CANCELED) {
          throw new ForbiddenException('Clients can only cancel tasks. Execution status is managed by technicians.');
        }
        break;

      case Role.DISPATCHER:
        // DISPATCHER can update any task in their org
        if (task.organizationId !== data.organizationId) {
          throw new ForbiddenException('You can only update tasks in your organization');
        }
        // DISPATCHER can only cancel (not change execution status)
        if (data.status !== TaskStatus.CANCELED) {
          throw new ForbiddenException('Dispatchers can only cancel tasks. Execution status is managed by technicians.');
        }
        break;

      default:
        throw new ForbiddenException('Access denied');
    }

    // Validate status transition
    const allowedTransitions = STATUS_TRANSITIONS[task.status] || [];
    if (!allowedTransitions.includes(data.status as TaskStatus)) {
      throw new BadRequestException(
        `Invalid status transition from ${task.status} to ${data.status}. Allowed: ${allowedTransitions.join(', ') || 'none'}`,
      );
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
        assignedTo: { select: { id: true, firstName: true, lastName: true } },
        createdBy: { select: { id: true, firstName: true, lastName: true } },
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

    this.checkTaskAccess(task, data.userId, data.userRole, data.organizationId);

    const events = await this.prisma.taskEvent.findMany({
      where: { taskId: data.id },
      orderBy: { createdAt: 'desc' },
      include: {
        user: { select: { id: true, firstName: true, lastName: true } },
      },
    });

    return success(events);
  }

  /**
   * Check if user has access to a task
   */
  private checkTaskAccess(
    task: any,
    userId: string,
    userRole: string,
    organizationId: string,
  ) {
    switch (userRole) {
      case Role.CLIENT:
        // CLIENT can only access their own tasks
        if (task.createdById !== userId || task.organizationId !== organizationId) {
          throw new ForbiddenException('Access denied');
        }
        break;

      case Role.DISPATCHER:
        // DISPATCHER can access all tasks in their org
        if (task.organizationId !== organizationId) {
          throw new ForbiddenException('Access denied');
        }
        break;

      case Role.TECHNICIAN:
        // TECHNICIAN can only access tasks assigned to them
        if (task.assignedToId !== userId) {
          throw new ForbiddenException('Access denied');
        }
        break;

      default:
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
    this.checkTaskAccess(task, data.userId, data.userRole, data.organizationId);

    const comment = await this.prisma.comment.create({
      data: {
        content: data.content,
        taskId: data.taskId,
        userId: data.userId,
      },
      include: {
        user: { select: { id: true, firstName: true, lastName: true } },
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
    this.checkTaskAccess(task, data.userId, data.userRole, data.organizationId);

    const comments = await this.prisma.comment.findMany({
      where: { taskId: data.taskId },
      orderBy: { createdAt: 'desc' },
      include: {
        user: { select: { id: true, firstName: true, lastName: true } },
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

  /**
   * Get task counts grouped by status
   * Returns counts for all statuses based on role-based filtering
   */
  async getStatusCounts(query: {
    userId: string;
    userRole: string;
    organizationId: string;
  }) {
    const { userId, userRole, organizationId } = query;

    // Build where clause based on role (same logic as findAll)
    const where: any = {};

    switch (userRole) {
      case Role.CLIENT:
        where.organizationId = organizationId;
        where.createdById = userId;
        break;

      case Role.DISPATCHER:
        where.organizationId = organizationId;
        break;

      case Role.TECHNICIAN:
        where.assignedToId = userId;
        break;

      default:
        return success({});
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
    for (const item of statusCounts) {
      counts[item.status] = item._count.status;
    }

    // Also get total count
    const total = await this.prisma.task.count({ where });
    counts['all'] = total;

    return success(counts);
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
    if (data.userRole !== Role.DISPATCHER && data.userRole !== Role.CLIENT) {
      throw new ForbiddenException('Only dispatchers and clients can view suggested technicians');
    }

    if (task.organizationId !== data.organizationId) {
      throw new ForbiddenException('Task is not in your organization');
    }

    // Get all active technicians in the organization
    const technicians = await this.prisma.user.findMany({
      where: {
        role: Role.TECHNICIAN,
        organizationId: data.organizationId,
        isActive: true,
      },
      include: {
        lastLocation: true,
        assignedTasks: {
          where: {
            status: {
              in: [TaskStatus.ASSIGNED, TaskStatus.ACCEPTED, TaskStatus.EN_ROUTE, TaskStatus.ARRIVED, TaskStatus.IN_PROGRESS],
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

    // Calculate scores for each technician
    const scoredTechnicians = await Promise.all(
      technicians.map(async (tech) => {
        // Get today's completed tasks count
        const todayCompletedCount = await this.prisma.task.count({
          where: {
            assignedToId: tech.id,
            status: TaskStatus.COMPLETED,
            updatedAt: {
              gte: todayStart,
              lte: todayEnd,
            },
          },
        });

        const todayTaskCount = tech.assignedTasks.length + todayCompletedCount;
        const maxDailyJobs = tech.maxDailyJobs || 5;

        // Calculate individual scores (0-100 scale)
        const distanceScore = this.calculateDistanceScore(task, tech.lastLocation);
        const availabilityScore = this.calculateAvailabilityScore(todayTaskCount, maxDailyJobs);
        const specializationScore = this.calculateSpecializationScore(task.title, tech.specialty);
        const workloadScore = this.calculateWorkloadScore(tech.assignedTasks.length);
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
          activeTaskCount: tech.assignedTasks.length,
          todayTaskCount,
          maxDailyJobs,
          distanceKm: distanceKm !== null ? Math.round(distanceKm * 10) / 10 : null,
          hasLocation: !!tech.lastLocation,
          lastLocationUpdatedAt: tech.lastLocation?.updatedAt || null,
          score: Math.round(totalScore * 100) / 100,
          scoreBreakdown: {
            distance: Math.round(distanceScore),
            availability: Math.round(availabilityScore),
            specialization: Math.round(specializationScore),
            workload: Math.round(workloadScore),
            rating: Math.round(ratingScore),
          },
        };
      }),
    );

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
}
