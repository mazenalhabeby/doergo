import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  Inject,
} from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { PrismaService } from '../../common/prisma/prisma.service';
import { TaskStatus, TaskEventType, Role } from '@doergo/shared';

// Valid status transitions
const STATUS_TRANSITIONS: Record<string, string[]> = {
  [TaskStatus.DRAFT]: [TaskStatus.NEW],
  [TaskStatus.NEW]: [TaskStatus.ASSIGNED, TaskStatus.CANCELED],
  [TaskStatus.ASSIGNED]: [TaskStatus.IN_PROGRESS, TaskStatus.CANCELED],
  [TaskStatus.IN_PROGRESS]: [TaskStatus.BLOCKED, TaskStatus.COMPLETED, TaskStatus.CANCELED],
  [TaskStatus.BLOCKED]: [TaskStatus.IN_PROGRESS, TaskStatus.CANCELED],
  [TaskStatus.COMPLETED]: [TaskStatus.CLOSED],
  [TaskStatus.CANCELED]: [],
  [TaskStatus.CLOSED]: [],
};

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

    return { success: true, data: task };
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
        return { success: true, data: [], meta: { page, limit: take, total: 0, totalPages: 0 } };
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
        },
      }),
      this.prisma.task.count({ where }),
    ]);

    return {
      success: true,
      data: tasks,
      meta: {
        page: Number(page),
        limit: take,
        total,
        totalPages: Math.ceil(total / take),
      },
    };
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

    return { success: true, data: task };
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
      },
      include: {
        createdBy: { select: { id: true, firstName: true, lastName: true } },
        assignedTo: { select: { id: true, firstName: true, lastName: true } },
      },
    });

    await this.createTaskEvent(id, userId, TaskEventType.UPDATED, { changes: updateData });

    return { success: true, data: task };
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

    return { success: true, data: updatedTask };
  }

  /**
   * Update task status (TECHNICIAN only - for assigned tasks)
   */
  async updateStatus(data: {
    id: string;
    status: string;
    technicianId: string;
    reason?: string;
  }) {
    const task = await this.prisma.task.findUnique({
      where: { id: data.id },
    });

    if (!task) {
      throw new NotFoundException('Task not found');
    }

    // Authorization: TECHNICIAN can only update status of tasks assigned to them
    if (task.assignedToId !== data.technicianId) {
      throw new ForbiddenException('You can only update status of tasks assigned to you');
    }

    // Validate status transition
    const allowedTransitions = STATUS_TRANSITIONS[task.status] || [];
    if (!allowedTransitions.includes(data.status)) {
      throw new BadRequestException(
        `Invalid status transition from ${task.status} to ${data.status}. Allowed: ${allowedTransitions.join(', ') || 'none'}`,
      );
    }

    const updatedTask = await this.prisma.task.update({
      where: { id: data.id },
      data: { status: data.status as any },
      include: {
        assignedTo: { select: { id: true, firstName: true, lastName: true } },
        createdBy: { select: { id: true, firstName: true, lastName: true } },
      },
    });

    await this.createTaskEvent(data.id, data.technicianId, TaskEventType.STATUS_CHANGED, {
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

    return { success: true, data: updatedTask };
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

    return { success: true, message: 'Task deleted successfully' };
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

    return { success: true, data: events };
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

    // Create task event
    await this.createTaskEvent(data.taskId, data.userId, TaskEventType.COMMENT_ADDED, {
      commentId: comment.id,
    });

    // Notify
    this.notificationClient.emit('task_comment_added', {
      taskId: data.taskId,
      comment,
    });

    return { success: true, data: comment };
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

    return { success: true, data: comments };
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
}
