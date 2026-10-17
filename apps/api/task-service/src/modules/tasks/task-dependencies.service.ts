import { Injectable, NotFoundException, BadRequestException, Inject } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { PrismaService } from '../../common/prisma/prisma.service';
import { success, assertFoundInOrg } from '@hbcfield/shared';
import { assertMayCreateUnder } from './task-scope';
import { emitEvent, taskUpdatedEvent } from '@hbcfield/shared/microservices';

/** One task waiting on another: adding a dependency (never a circle), removing one. */
@Injectable()
export class TaskDependenciesService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject('NOTIFICATION_SERVICE') private readonly notificationClient: ClientProxy,
  ) {}

  private static readonly MAX_DEPENDENCY_DEPTH = 100;

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
      throw new BadRequestException('Adding this dependency would create a circular dependency chain');
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
    emitEvent(this.notificationClient, taskUpdatedEvent, { task: { id: data.predecessorId } });
    emitEvent(this.notificationClient, taskUpdatedEvent, { task: { id: data.successorId } });

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
    emitEvent(this.notificationClient, taskUpdatedEvent, { task: { id: dependency.predecessorId } });
    emitEvent(this.notificationClient, taskUpdatedEvent, { task: { id: dependency.successorId } });

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
    maxDepth: number = TaskDependenciesService.MAX_DEPENDENCY_DEPTH,
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
      const hasCycle = await this.detectCircularDependency(dep.successorId, targetTaskId, visited, maxDepth - 1);
      if (hasCycle) {
        return true;
      }
    }

    return false;
  }
}
