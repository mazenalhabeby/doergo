import { Injectable, NotFoundException, BadRequestException, Inject } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { PrismaService } from '../../common/prisma/prisma.service';
import { TaskStatus, TaskEventType } from '@doergo/shared';

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

  async create(data: any) {
    const task = await this.prisma.task.create({
      data: {
        title: data.title,
        description: data.description,
        priority: data.priority || 'MEDIUM',
        dueDate: data.dueDate ? new Date(data.dueDate) : null,
        locationLat: data.locationLat,
        locationLng: data.locationLng,
        locationAddress: data.locationAddress,
        organizationId: data.organizationId,
        createdById: data.createdById,
      },
      include: {
        createdBy: {
          select: { id: true, firstName: true, lastName: true },
        },
      },
    });

    // Create task event
    await this.createTaskEvent(task.id, data.createdById, TaskEventType.CREATED);

    // Notify
    this.notificationClient.emit('task_created', task);

    return { success: true, data: task };
  }

  async findAll(query: any) {
    const { page = 1, limit = 10, status, priority, organizationId, assignedToId, createdById } = query;
    const skip = (page - 1) * limit;

    const where: any = {};
    if (status) where.status = status;
    if (priority) where.priority = priority;
    if (organizationId) where.organizationId = organizationId;
    if (assignedToId) where.assignedToId = assignedToId;
    if (createdById) where.createdById = createdById;

    const [tasks, total] = await Promise.all([
      this.prisma.task.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          createdBy: { select: { id: true, firstName: true, lastName: true } },
          assignedTo: { select: { id: true, firstName: true, lastName: true } },
        },
      }),
      this.prisma.task.count({ where }),
    ]);

    return {
      success: true,
      data: tasks,
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async findOne(id: string) {
    const task = await this.prisma.task.findUnique({
      where: { id },
      include: {
        createdBy: { select: { id: true, firstName: true, lastName: true, email: true } },
        assignedTo: { select: { id: true, firstName: true, lastName: true, email: true } },
        comments: {
          orderBy: { createdAt: 'desc' },
          take: 10,
          include: { user: { select: { id: true, firstName: true, lastName: true } } },
        },
        attachments: { orderBy: { createdAt: 'desc' } },
      },
    });

    if (!task) {
      throw new NotFoundException('Task not found');
    }

    return { success: true, data: task };
  }

  async update(id: string, data: any) {
    const task = await this.prisma.task.update({
      where: { id },
      data: {
        ...(data.title && { title: data.title }),
        ...(data.description !== undefined && { description: data.description }),
        ...(data.priority && { priority: data.priority }),
        ...(data.dueDate && { dueDate: new Date(data.dueDate) }),
        ...(data.locationLat !== undefined && { locationLat: data.locationLat }),
        ...(data.locationLng !== undefined && { locationLng: data.locationLng }),
        ...(data.locationAddress !== undefined && { locationAddress: data.locationAddress }),
      },
    });

    if (data.userId) {
      await this.createTaskEvent(id, data.userId, TaskEventType.UPDATED, { changes: data });
    }

    return { success: true, data: task };
  }

  async assign(taskId: string, workerId: string, assignedById: string) {
    const task = await this.prisma.task.findUnique({ where: { id: taskId } });

    if (!task) {
      throw new NotFoundException('Task not found');
    }

    const updatedTask = await this.prisma.task.update({
      where: { id: taskId },
      data: {
        assignedToId: workerId,
        status: TaskStatus.ASSIGNED,
      },
      include: {
        assignedTo: { select: { id: true, firstName: true, lastName: true, email: true } },
      },
    });

    await this.createTaskEvent(taskId, assignedById, TaskEventType.ASSIGNED, { workerId });

    // Notify worker
    this.notificationClient.emit('task_assigned', {
      task: updatedTask,
      workerId,
    });

    return { success: true, data: updatedTask };
  }

  async updateStatus(taskId: string, newStatus: string, userId: string, reason?: string) {
    const task = await this.prisma.task.findUnique({ where: { id: taskId } });

    if (!task) {
      throw new NotFoundException('Task not found');
    }

    // Validate status transition
    const allowedTransitions = STATUS_TRANSITIONS[task.status] || [];
    if (!allowedTransitions.includes(newStatus)) {
      throw new BadRequestException(
        `Invalid status transition from ${task.status} to ${newStatus}`,
      );
    }

    const updatedTask = await this.prisma.task.update({
      where: { id: taskId },
      data: { status: newStatus as any },
    });

    await this.createTaskEvent(taskId, userId, TaskEventType.STATUS_CHANGED, {
      oldStatus: task.status,
      newStatus,
      reason,
    });

    // Notify about status change
    this.notificationClient.emit('task_status_changed', {
      task: updatedTask,
      oldStatus: task.status,
      newStatus,
    });

    return { success: true, data: updatedTask };
  }

  async remove(id: string) {
    await this.prisma.task.delete({ where: { id } });
    return { success: true, message: 'Task deleted successfully' };
  }

  async getTimeline(taskId: string) {
    const events = await this.prisma.taskEvent.findMany({
      where: { taskId },
      orderBy: { createdAt: 'desc' },
      include: {
        user: { select: { id: true, firstName: true, lastName: true } },
      },
    });

    return { success: true, data: events };
  }

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
