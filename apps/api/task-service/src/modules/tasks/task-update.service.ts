import { Injectable, NotFoundException, BadRequestException, ForbiddenException, Inject } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { PrismaService } from '../../common/prisma/prisma.service';
import { assertSpaceInOrg } from '../../common/tenant-scope.util';
import { TaskStatus, TaskEventType, success, accessAllowsInSpace, assertFoundInOrg } from '@hbcfield/shared';
import { TaskSupportService } from './task-support.service';
import { resolveOwnedTaskRefs, assertMayCreateUnder } from './task-scope';
import { emitEvent, taskDeletedEvent, taskUpdatedEvent } from '@hbcfield/shared/microservices';

/** Changing a task's fields (never its open-role columns or its status), and deleting one. */
@Injectable()
export class TaskUpdateService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject('NOTIFICATION_SERVICE') private readonly notificationClient: ClientProxy,
    private readonly support: TaskSupportService,
  ) {}

  /**
   * Update a task (CLIENT or DISPATCHER - any task in their org)
   */
  async update(data: any) {
    // `access` is the caller's resolved grant (for foreign-space authz) — pull it
    // out so it never leaks into the Prisma update payload.
    // The caller's grants come out too, so they can never reach the write or
    // the event's `changes` metadata.
    const {
      id,
      userId,
      userRole,
      organizationId,
      access,
      canCreateTasks,
      createSpaceIds,
      canViewAllTasks,
      viewAllSpaceIds,
      canAssignTasks,
      sharedSpaceIds,
      taskCreationScope,
      ...updateData
    } = data;
    // The open-role columns have their own path (RolePoolService.setOpenRole) — never written raw. (The write
    // below lists its fields explicitly too; this is the belt to that braces.)
    for (const k of ['openRoleId', 'openSpots', 'openSpotsLeft', 'openedAt', 'openWave']) delete (updateData as any)[k];

    // Find existing task
    const existingTask = await this.prisma.task.findUnique({
      where: { id },
    });

    if (!existingTask) {
      throw new NotFoundException('Task not found');
    }

    // Authorization: own-org tasks always; a foreign task ONLY with a cross-org
    // CONTRIBUTE/CONTROL grant (canCreateTasks) for that task's real space.
    if (existingTask.organizationId !== organizationId) {
      if (!existingTask.spaceId || !accessAllowsInSpace(access, 'canCreateTasks', existingTask.spaceId)) {
        throw new ForbiddenException('You can only update tasks in your organization');
      }
      // Don't let a guest move an owner's task into another space (incl. one they
      // can't reach). Foreign tasks stay in their space.
      if (updateData.spaceId !== undefined && updateData.spaceId !== existingTask.spaceId) {
        throw new ForbiddenException('Cannot move a shared task to another space');
      }
    } else {
      /*
        Own-org task: being in the organization is not enough.

        The gateway's `@RequirePermissionInSpace('canCreateTasks')` is satisfied
        by a grant in ANY space when the body names none, so this route let a
        member who may create tasks at one site rewrite — and MOVE — any task in
        the organization, including into a workspace they hold nothing in. The
        same question subtasks and dependencies ask (assertMayCreateUnder), asked
        of the task's CURRENT space and, when it moves, of the DESTINATION.
      */
      const grants = { userRole, canCreateTasks, createSpaceIds };
      assertMayCreateUnder(existingTask, grants);
      const destination = updateData.spaceId === undefined ? undefined : (updateData.spaceId as string) || null;
      if (destination !== undefined && destination !== existingTask.spaceId) {
        assertMayCreateUnder({ spaceId: destination }, grants);
        // An id from a client says nothing about whose it is — and an archived
        // workspace takes no new work. The shared tenant check, not a copy of it.
        await assertSpaceInOrg(this.prisma, destination, existingTask.organizationId, { activeOnly: true });
      }
    }

    /*
      Every linked record must be the task's organization's — the same helper
      create() uses. Creation drops an unowned id; an EDIT refuses it, because
      dropping would silently clear a link the caller meant to set.
    */
    const refKeys = ['assetId', 'customerId', 'unitId', 'phaseId', 'sprintId', 'epicId'] as const;
    const owned = await resolveOwnedTaskRefs(
      this.prisma,
      existingTask.organizationId,
      Object.fromEntries(refKeys.filter((k) => updateData[k] !== undefined).map((k) => [k, updateData[k]])),
    );
    for (const k of refKeys) {
      if (owned[k] === null) throw new NotFoundException(`${k.replace(/Id$/, '')} not found in this organization`);
    }

    // A role is a fact about ONE workspace: moving the task closes it to the role (who took it stays on it).
    const closeRole =
      updateData.spaceId !== undefined &&
      (updateData.spaceId || null) !== existingTask.spaceId &&
      !!existingTask.openRoleId;

    // Don't allow updating completed/closed tasks
    if ([TaskStatus.COMPLETED, TaskStatus.CLOSED, TaskStatus.CANCELED].includes(existingTask.status as TaskStatus)) {
      throw new BadRequestException('Cannot update a completed, closed, or canceled task');
    }

    // Changing the FLOW (task type / workflow). Validate the target belongs to the
    // org, then keep the current status if it still exists in the new flow, else
    // drop to the new flow's first status (or canonical NEW/ASSIGNED when cleared).
    let statusOverride: string | undefined;
    if (updateData.workflowId !== undefined) {
      const wfId: string | null = updateData.workflowId || null;
      if (wfId) {
        const wf = await this.prisma.statusWorkflow.findFirst({
          where: { id: wfId, organizationId: existingTask.organizationId },
          select: { id: true },
        });
        if (!wf) throw new NotFoundException('Flow not found');
        const statuses = await this.prisma.workflowStatus.findMany({
          where: { workflowId: wfId },
          orderBy: { position: 'asc' },
          select: { key: true, isCanceled: true },
        });
        if (!statuses.some((s) => s.key === existingTask.status)) {
          statusOverride = (statuses.find((s) => !s.isCanceled) || statuses[0])?.key;
        }
      } else {
        statusOverride = existingTask.assignedToId ? TaskStatus.ASSIGNED : TaskStatus.NEW;
      }
    }

    const task = await this.prisma.task.update({
      where: { id },
      data: {
        ...(updateData.workflowId !== undefined && { workflowId: updateData.workflowId || null }),
        ...(statusOverride && { status: statusOverride }),
        ...(closeRole && { openRoleId: null, openSpots: null, openSpotsLeft: null, openedAt: null, openWave: 0 }),
        ...(updateData.title && { title: updateData.title }),
        ...(updateData.description !== undefined && { description: updateData.description }),
        ...(updateData.priority && { priority: updateData.priority }),
        /*
          Moving the date re-arms the "leave now" nudge.

          Without the reset, rescheduling a job to a different hour leaves it
          marked as already announced and the member is never told to set off
          for the NEW time — the silent half of a bug whose loud half would be
          being told twice.
        */
        ...(updateData.dueDate && {
          dueDate: new Date(updateData.dueDate),
          departureNotifiedAt: null,
        }),
        ...(updateData.startDate !== undefined && {
          startDate: updateData.startDate ? new Date(updateData.startDate) : null,
        }),
        ...(updateData.estimatedHours !== undefined && { estimatedHours: updateData.estimatedHours }),
        ...(updateData.locationLat !== undefined && { locationLat: updateData.locationLat }),
        ...(updateData.locationLng !== undefined && { locationLng: updateData.locationLng }),
        ...(updateData.locationAddress !== undefined && { locationAddress: updateData.locationAddress }),
        ...(updateData.assetId !== undefined && { assetId: updateData.assetId || null }),
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

    await this.support.createTaskEvent(id, userId, TaskEventType.UPDATED, { changes: updateData });

    this.support.invalidateStatusCountsCache(task.organizationId);

    // Notify via Socket.IO for real-time updates
    emitEvent(this.notificationClient, taskUpdatedEvent, { task });

    return success(task);
  }

  /**
   * Delete a task (CLIENT only - own tasks)
   */
  async remove(data: {
    id: string;
    userId: string;
    userRole: string;
    canViewAllTasks?: boolean;
    organizationId: string;
  }) {
    const task = await this.prisma.task.findUnique({
      where: { id: data.id },
    });

    // Authorization: an ADMIN may delete any task in their organization.
    assertFoundInOrg(task, data.organizationId, 'Task');

    // Don't allow deleting in-progress or completed tasks
    if ([TaskStatus.IN_PROGRESS, TaskStatus.COMPLETED, TaskStatus.CLOSED].includes(task.status as TaskStatus)) {
      throw new BadRequestException('Cannot delete a task that is in progress or completed');
    }

    await this.prisma.task.delete({ where: { id: data.id } });

    // Notify via Socket.IO for real-time updates (spaceId lets cross-org shared
    // guests receive the delete on the space room too).
    emitEvent(this.notificationClient, taskDeletedEvent, {
      taskId: data.id,
      organizationId: task.organizationId,
      spaceId: task.spaceId ?? null,
    });

    this.support.invalidateStatusCountsCache(task.organizationId);

    return success(null, 'Task deleted successfully');
  }
}
