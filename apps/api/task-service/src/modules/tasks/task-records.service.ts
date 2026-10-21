import { Injectable, BadRequestException, Inject, forwardRef } from '@nestjs/common';
import { RolePoolService } from './role-pool.service';
import { ClientProxy } from '@nestjs/microservices';
import { findPrior } from '../../common/create-once.util';
import { PrismaService } from '@hbcfield/shared';
import { personName, TaskEventType, success } from '@hbcfield/shared';
import { TaskSupportService } from './task-support.service';
import { TaskAssignmentService } from './task-assignment.service';
import { resolveOwnedTaskRefs } from './task-scope';
import {
  assertWorkflowUsable,
  initialTaskStatus,
  resolveCreatePlacement,
  settleCreateSpace,
  TASK_CREATE_INCLUDE,
  writeCreateAssignees,
} from './task-create-steps';
import { emitEvent, taskAssignedEvent, taskCreatedEvent } from '@hbcfield/shared/microservices';
import type { Prisma, TaskPriority } from '@prisma/client';
import type { TaskCreateJob } from '@hbcfield/shared';

/**
 * A task as a record: create it, edit it, delete it, and re-point a space's
 * tasks at that space's workflow.
 */
@Injectable()
export class TaskRecordsService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject('NOTIFICATION_SERVICE') private readonly notificationClient: ClientProxy,
    private readonly support: TaskSupportService,
    private readonly assignment: TaskAssignmentService,
    // A task open to a WORK role (shared tasks/role-pool.ts) — beside the name flow.
    @Inject(forwardRef(() => RolePoolService)) private readonly rolePool: RolePoolService,
  ) {}

  /**
   * Create a new task (CLIENT or DISPATCHER)
   */
  async create(data: TaskCreateJob) {
    // The same task sent again from the phone's queue: the task it made.
    const prior = await findPrior({
      id: data.id,
      find: (id) => this.prisma.task.findUnique({ where: { id } }),
      isSame: (t) => t.createdById === data.userId && t.organizationId === data.organizationId,
    });
    if (prior) return success(prior, 'Task already created');

    const hasAssignment = !!data.assignedToId;
    const assigneeIds: string[] = data.assigneeIds || [];
    /*
      People OR a role — never both at once. A task opened to "a Mechanic" with
      Ahmad already named on it would offer a place he already holds.
    */
    const openRoleId: string | null = typeof data.openRoleId === 'string' && data.openRoleId ? data.openRoleId : null;
    if (openRoleId && (hasAssignment || assigneeIds.length > 0)) {
      throw new BadRequestException({
        message: 'Assign people or open the task to a role, not both',
        code: 'ROLE_TASK_PEOPLE_OR_ROLE',
      });
    }

    // One lookup for the primary assignee and the list together — a task must
    // not be created already assigned to someone who cannot see it.
    await this.assignment.assertAssigneesCanReceiveTasks(
      [data.assignedToId, ...assigneeIds],
      data.workflowId,
      data.organizationId,
    );

    // Un-triaged portal requests are intentionally space-less + flow-less: they
    // live only in the "pending triage" inbox until an admin routes them (picks
    // space + flow + worker). Skip the default-space fallback for them.
    const isUntriaged = data.triaged === false;
    await settleCreateSpace(this.prisma, data, isUntriaged);

    const { locationLat, locationLng, locationAddress, spaceWorkflowId, effectiveOrgId } = await resolveCreatePlacement(
      this.prisma,
      data,
    );

    // Task type = workflow: explicit, else inherited from the space. A new task
    // starts at that workflow's first status (e.g. Office → TODO, Sales →
    // SCHEDULED); with no workflow it uses the canonical NEW/ASSIGNED.
    // Un-triaged requests carry no flow yet (chosen at triage) → canonical NEW.
    const effWorkflowId: string | null = isUntriaged
      ? null
      : ((data.workflowId as string | undefined) ?? spaceWorkflowId ?? null);

    await assertWorkflowUsable(this.prisma, effWorkflowId, effectiveOrgId, data.spaceId);

    const initialStatus = await initialTaskStatus(this.prisma, effWorkflowId, hasAssignment);

    /*
      Every id the client named that points at another record — unit, asset,
      customer, phase, sprint, epic — must belong to the org the task will live
      in. One helper, shared with update(), so the two cannot disagree. Creation
      DROPS an unowned id rather than fail the whole submission (a portal
      request with a stale unit should still arrive).
    */
    const portal = data.source === 'CUSTOMER_PORTAL' ? { customerId: data.customerId || null } : undefined;
    const owned = await resolveOwnedTaskRefs(
      this.prisma,
      effectiveOrgId,
      {
        unitId: data.unitId,
        assetId: data.assetId,
        customerId: data.customerId,
        phaseId: data.phaseId,
        sprintId: data.sprintId,
        epicId: data.epicId,
      },
      portal,
    );
    const effUnitId = owned.unitId ?? null;
    const effAssetId = owned.assetId ?? null;
    const effCustomerId = owned.customerId ?? null;

    // A role belongs to a workspace; an un-triaged request has none yet — say so rather than drop it.
    if (openRoleId && isUntriaged) {
      throw new BadRequestException({
        message: 'Choose a workspace to open a task to a role',
        code: 'ROLE_TASK_NEEDS_SPACE',
      });
    }
    /*
      The role is checked against the task's FINAL workspace (after the default-
      space fallback) — including the right to open it there, for a caller whose
      assign right is per workspace (the gateway forwards those spaces only when
      no workspace was named). Not refused: the task is still raised, unopened,
      exactly as the gateway strips it when the named workspace is not theirs.
    */
    const mayOpenHere =
      !Array.isArray(data.roleAssignSpaceIds) ||
      (data.spaceId != null && data.roleAssignSpaceIds.includes(data.spaceId));
    const openRole =
      openRoleId && mayOpenHere ? await this.rolePool.resolveOpenRole(effectiveOrgId, data.spaceId, openRoleId) : null;

    const task = await this.prisma.$transaction(async (tx) => {
      const createdTask = await tx.task.create({
        data: {
          ...(typeof data.id === 'string' && data.id ? { id: data.id } : {}),
          ...(openRole ? this.rolePool.openColumns(openRole.id, data.openSpots) : {}),
          title: data.title,
          description: data.description,
          // The gateway's DTO checks it (@IsEnum); Prisma refuses anything else, as before.
          priority: (data.priority || 'MEDIUM') as TaskPriority,
          status: initialStatus,
          workflowId: effWorkflowId,
          dueDate: data.dueDate ? new Date(data.dueDate) : null,
          startDate: data.startDate ? new Date(data.startDate) : null,
          estimatedHours: data.estimatedHours ?? null,
          locationLat,
          locationLng,
          locationAddress,
          organizationId: effectiveOrgId,
          createdById: data.userId,
          assignedToId: data.assignedToId || null,
          assetId: effAssetId,
          parentId: data.parentId || null,
          phaseId: owned.phaseId ?? null,
          sprintId: owned.sprintId ?? null,
          epicId: owned.epicId ?? null,
          storyPoints: data.storyPoints ?? null,
          spaceId: data.spaceId || null,
          // Customer link + origin (portal requests carry these; internal tasks
          // default to source=INTERNAL and no customer/unit). unitId is validated
          // above for portal requests.
          customerId: effCustomerId,
          unitId: effUnitId,
          source: data.source === 'CUSTOMER_PORTAL' ? 'CUSTOMER_PORTAL' : 'INTERNAL',
          // Portal requests are born un-triaged; everything else is born routed.
          triaged: !isUntriaged,
        },
        include: TASK_CREATE_INCLUDE,
      });

      await writeCreateAssignees(tx, createdTask.id, assigneeIds, data.assignedToId);

      return createdTask;
    });

    await this.announceCreated(task, data.userId, hasAssignment ? data.assignedToId : null);

    // Notify
    emitEvent(this.notificationClient, taskCreatedEvent, task);

    // Opened to a role: the record, then the first wave (the free ones now).
    if (openRole) await this.rolePool.afterOpened(task.id, data.userId, openRole, task.openSpots ?? 1);

    this.support.invalidateStatusCountsCache(task.organizationId);

    return success(task);
  }

  /** The CREATED record, and — when it was born assigned — the ASSIGNED record and the push. */
  private async announceCreated(
    task: Prisma.TaskGetPayload<{ include: typeof TASK_CREATE_INCLUDE }>,
    userId: string,
    assignedToId: string | null | undefined,
  ) {
    // Create task event
    await this.support.createTaskEvent(task.id, userId, TaskEventType.CREATED);

    // If assigned during creation, also create assignment event and notify
    if (assignedToId) {
      await this.support.createTaskEvent(task.id, userId, TaskEventType.ASSIGNED, {
        workerId: assignedToId,
        workerName: task.assignedTo ? personName(task.assignedTo) : '',
      });

      emitEvent(this.notificationClient, taskAssignedEvent, {
        task,
        workerId: assignedToId,
        // Who did it — so the person who assigns work to themselves is not emailed about it.
        actorId: userId,
        watcherIds: await this.support.taskWatcherIds(assignedToId, task.organizationId),
      });
    }
  }
}
