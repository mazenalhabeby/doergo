import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  Inject,
} from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { PrismaService } from '../../common/prisma/prisma.service';
import { TaskStatus, TaskEventType, success, assertFoundInOrg } from '@hbcfield/shared';
import { TaskSupportService } from './task-support.service';
import {
  resolveOwnedTaskRefs,
  assertMayAssign,
  assertMayCreateUnder,
  assertTargetIsInSpace,
} from './task-scope';

/**
 * Work under and around a task: subtasks and dependencies.
 */
@Injectable()
export class TaskHierarchyService {
  private static readonly MAX_DEPENDENCY_DEPTH = 100;
  private static readonly MAX_SUBTASK_DEPTH = 5;

  constructor(
    private readonly prisma: PrismaService,
    @Inject('NOTIFICATION_SERVICE') private readonly notificationClient: ClientProxy,
    private readonly support: TaskSupportService,
  ) {}

  /**
   * Create a subtask under a parent task
   */
  async createSubtask(data: any) {
    const parent = await this.prisma.task.findUnique({
      where: { id: data.parentId },
    });

    assertFoundInOrg(parent, data.organizationId, 'Parent task');

    // The org is not the boundary for a space-granted member: their "create
    // tasks" applies inside their own spaces only.
    assertMayCreateUnder(parent, data);

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
    if (newDepth > TaskHierarchyService.MAX_SUBTASK_DEPTH) {
      throw new BadRequestException(
        `Maximum subtask nesting depth is ${TaskHierarchyService.MAX_SUBTASK_DEPTH}. Current parent is at depth ${parent.depth ?? 0}.`,
      );
    }

    // Determine position among siblings
    const lastSibling = await this.prisma.task.findFirst({
      where: { parentId: data.parentId },
      orderBy: { position: 'desc' },
      select: { position: true },
    });
    const position = (lastSibling?.position ?? -1) + 1;

    /*
      A subtask is part of its parent's job, so it lives where the parent lives:
      the same workspace and the same task type. It used to be created with
      neither — invisible to a space-scoped list and running on the canonical
      flow beside a parent on "Field Service".
    */
    const spaceId = parent.spaceId ?? null;
    const workflowId = parent.workflowId ?? null;

    /*
      Putting somebody on it is ASSIGNING, and is asked exactly as assign() asks
      it: may this caller assign on the parent's workspace, and is the person on
      that workspace's roster? Without it, "create tasks" in one site was an
      assign right over the whole organization, by id.
    */
    const assignedToId: string | null = typeof data.assignedToId === 'string' && data.assignedToId ? data.assignedToId : null;
    if (assignedToId) {
      const grants = {
        userRole: data.userRole,
        canAssignTasks: data.canAssignTasks,
        assignSpaceIds: Array.isArray(data.assignSpaceIds) ? data.assignSpaceIds : undefined,
      };
      assertMayAssign(parent, grants);
      await assertTargetIsInSpace(this.prisma, parent, assignedToId, grants);
      const worker = await this.prisma.user.findFirst({
        where: { id: assignedToId, organizationId: parent.organizationId, isActive: true },
        select: { id: true },
      });
      if (!worker) throw new NotFoundException('Worker not found in your organization');
    }

    // Every linked record must be the organization's — the helper create() and update() use.
    const owned = await resolveOwnedTaskRefs(this.prisma, parent.organizationId, {
      assetId: data.assetId,
      phaseId: data.phaseId,
      sprintId: data.sprintId,
      epicId: data.epicId,
    });

    // The inherited flow decides the first step, exactly as create() does.
    let initialStatus: string = assignedToId ? TaskStatus.ASSIGNED : TaskStatus.NEW;
    if (workflowId) {
      const firstStatus = await this.prisma.workflowStatus.findFirst({
        where: { workflowId, isCanceled: false },
        orderBy: { position: 'asc' },
        select: { key: true },
      });
      if (firstStatus) initialStatus = firstStatus.key;
    }

    const task = await this.prisma.task.create({
      data: {
        title: data.title,
        description: data.description,
        priority: data.priority || 'MEDIUM',
        status: initialStatus,
        dueDate: data.dueDate ? new Date(data.dueDate) : null,
        startDate: data.startDate ? new Date(data.startDate) : null,
        estimatedHours: data.estimatedHours ?? null,
        locationLat: data.locationLat,
        locationLng: data.locationLng,
        locationAddress: data.locationAddress,
        organizationId: parent.organizationId,
        spaceId,
        workflowId,
        createdById: data.userId,
        assignedToId,
        assetId: owned.assetId ?? null,
        parentId: data.parentId,
        depth: newDepth,
        position,
        phaseId: owned.phaseId ?? null,
        sprintId: owned.sprintId ?? null,
        epicId: owned.epicId ?? null,
        storyPoints: data.storyPoints ?? null,
      },
      include: {
        createdBy: { select: { id: true, firstName: true, lastName: true, email: true, avatarUrl: true } },
        assignedTo: { select: { id: true, firstName: true, lastName: true, email: true, avatarUrl: true } },
        parent: { select: { id: true, title: true } },
      },
    });

    await this.support.createTaskEvent(task.id, data.userId, TaskEventType.CREATED, {
      parentId: data.parentId,
      parentTitle: parent.title,
    });

    this.notificationClient.emit('task_created', task);
    this.support.invalidateStatusCountsCache(task.organizationId);

    return success(task);
  }

  /**
   * Get subtasks of a task
   */
  async getSubtasks(data: {
    taskId: string;
    userId: string;
    userRole: string;
    canViewAllTasks?: boolean;
    organizationId: string;
  }) {
    const task = await this.prisma.task.findUnique({
      where: { id: data.taskId },
    });

    if (!task) {
      throw new NotFoundException('Task not found');
    }

    await this.support.taskAccess.assert(task, data, { roleHolderMayRead: true });

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
    userRole?: string;
    canCreateTasks?: boolean;
    createSpaceIds?: string[];
  }) {
    // Validate both tasks exist and belong to the same org
    const [predecessor, successor] = await Promise.all([
      this.prisma.task.findUnique({ where: { id: data.predecessorId } }),
      this.prisma.task.findUnique({ where: { id: data.successorId } }),
    ]);

    assertFoundInOrg(predecessor, data.organizationId, 'Predecessor task');
    assertFoundInOrg(successor, data.organizationId, 'Successor task');

    /*
      BOTH ends, not just the one named in the route.

      A dependency links two tasks, and linking is a change to each of them:
      "B cannot start until A finishes" constrains A's schedule as much as B's.
      Checking only the successor would let a member granted in one space reach
      into a space they hold nothing in and order the work there.
    */
    assertMayCreateUnder(successor, data);
    assertMayCreateUnder(predecessor, data);

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

    // A dependency changes BOTH tasks' detail views. Checklist and subtask
    // mutations already announce themselves; dependencies did not, so a second
    // viewer's task detail kept the old chain (audit T-D1). Nobody had hit it
    // because the route was 402ing for every organization (T-B1) — fixing that
    // is what makes this reachable.
    this.notificationClient.emit('task_updated', { task: { id: data.predecessorId } });
    this.notificationClient.emit('task_updated', { task: { id: data.successorId } });

    return success(dependency);
  }

  /**
   * Remove a dependency
   */
  async removeDependency(data: {
    dependencyId: string;
    userId: string;
    organizationId: string;
    userRole?: string;
    canCreateTasks?: boolean;
    createSpaceIds?: string[];
  }) {
    const dependency = await this.prisma.taskDependency.findUnique({
      where: { id: data.dependencyId },
      include: {
        // spaceId on both ends: removing a link changes both tasks, so both are
        // checked — the same rule addDependency applies to creating it.
        predecessor: { select: { organizationId: true, spaceId: true } },
        successor: { select: { organizationId: true, spaceId: true } },
      },
    });

    if (!dependency) {
      throw new NotFoundException('Dependency not found');
    }

    // Another organization's dependency answers exactly like a missing one.
    assertFoundInOrg(dependency.predecessor, data.organizationId, 'Dependency');

    assertMayCreateUnder(dependency.successor, data);
    assertMayCreateUnder(dependency.predecessor, data);

    await this.prisma.taskDependency.delete({
      where: { id: data.dependencyId },
    });

    // Both ends of the removed link need refreshing (T-D1).
    this.notificationClient.emit('task_updated', { task: { id: dependency.predecessorId } });
    this.notificationClient.emit('task_updated', { task: { id: dependency.successorId } });

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
    maxDepth: number = TaskHierarchyService.MAX_DEPENDENCY_DEPTH,
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
