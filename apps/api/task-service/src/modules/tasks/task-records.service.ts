import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  Inject,
  forwardRef,
} from '@nestjs/common';
import { RolePoolService } from './role-pool.service';
import { ClientProxy } from '@nestjs/microservices';
import { findPrior } from '../../common/create-once.util';
import { PrismaService } from '../../common/prisma/prisma.service';
import { assertWorkflowInOrg, assertSpaceInOrg } from '../../common/tenant-scope.util';
import { resolveSpaceDefaultWorkflowId, listSpaceWorkflowIds } from '../../common/space-workflow.util';
import {
  TaskStatus,
  TaskEventType,
  success,
  accessAllowsInSpace,
  activeAssignmentWhere, assertFoundInOrg,
} from '@hbcfield/shared';
import { TaskSupportService } from './task-support.service';
import { TaskAssignmentService } from './task-assignment.service';
import { resolveOwnedTaskRefs, assertMayCreateUnder } from './task-scope';

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
  async create(data: any) {
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
      throw new BadRequestException({ message: 'Assign people or open the task to a role, not both', code: 'ROLE_TASK_PEOPLE_OR_ROLE' });
    }

    // One lookup for the primary assignee and the list together — a task must
    // not be created already assigned to someone who cannot see it.
    await this.assignment.assertAssigneesCanReceiveTasks(
      [data.assignedToId, ...assigneeIds],
      (data as any).workflowId,
      data.organizationId,
    );

    /*
      SPACE-scoped users create inside a workspace they are assigned to.

      ⚠️ The phone's New job may send NO workspace (it was never required, and
      this rule was dead code until the gateway forwarded the scope). A member
      assigned to exactly ONE workspace has an unambiguous answer, so it is
      used; only somebody with a real choice is asked to make it. Refusing them
      all would have broken job creation on every installed phone.
    */
    if (data.taskCreationScope === 'SPACE' && !data.spaceId) {
      const mine = await this.prisma.spaceAssignment.findMany({
        where: activeAssignmentWhere(data.userId),
        select: { spaceId: true },
        distinct: ['spaceId'],
        take: 2,
      });
      if (mine.length !== 1) {
        throw new ForbiddenException('Task creation scope is SPACE — you must select a space');
      }
      data.spaceId = mine[0]!.spaceId;
    }

    // Un-triaged portal requests are intentionally space-less + flow-less: they
    // live only in the "pending triage" inbox until an admin routes them (picks
    // space + flow + worker). Skip the default-space fallback for them.
    const isUntriaged = data.triaged === false;

    // Space-centric: every (triaged) task belongs to a space. If none was chosen,
    // fall back to the org's default ("General") space so no task is space-less.
    if (!data.spaceId && !isUntriaged) {
      const defaultSpace = await this.prisma.companyLocation.findFirst({
        where: { organizationId: data.organizationId, isDefault: true },
        select: { id: true },
      });
      if (defaultSpace) data.spaceId = defaultSpace.id;
    }

    // If spaceId provided, validate it belongs to the org and auto-populate location
    let locationLat = data.locationLat;
    let locationLng = data.locationLng;
    let locationAddress = data.locationAddress;
    let spaceWorkflowId: string | null = null;
    // The org the task will BELONG to. For a cross-org shared space the task lives
    // in the OWNER org (so the owner sees/counts it), even though a guest created it.
    let effectiveOrgId: string = data.organizationId;
    if (data.spaceId) {
      const space = await this.prisma.companyLocation.findUnique({
        where: { id: data.spaceId },
        select: { organizationId: true, lat: true, lng: true, address: true, workflowId: true },
      });
      if (!space) {
        throw new NotFoundException('Space not found');
      }
      // Through the shared resolver: the join first, the column as fallback.
      spaceWorkflowId = await resolveSpaceDefaultWorkflowId(this.prisma, data.spaceId);
      if (space.organizationId !== data.organizationId) {
        // Foreign space → allowed ONLY if the caller holds a cross-org CONTRIBUTE/
        // CONTROL grant for THIS exact space (server-authoritative access, checked
        // against the resource's real spaceId). The task then belongs to the owner.
        if (!accessAllowsInSpace(data.access, 'canCreateTasks', data.spaceId)) {
          // No relationship to this space at all → it does not exist for them
          // (a 403 confirmed a real workspace of another organization). A guest
          // who CAN see the shared space but not create in it keeps the 403.
          if (!data.access?.perSpace?.[data.spaceId]) throw new NotFoundException('Space not found');
          throw new ForbiddenException('Cannot create task in a space outside your organization');
        }
        effectiveOrgId = space.organizationId;
      } else if (data.taskCreationScope === 'SPACE') {
        // Native space, SPACE scope → user must be assigned to the space.
        // Assigned NOW — a row whose window has closed is a former member.
        const assignment = await this.prisma.spaceAssignment.findFirst({
          where: { ...activeAssignmentWhere(data.userId), spaceId: data.spaceId },
          select: { id: true },
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
    // Un-triaged requests carry no flow yet (chosen at triage) → canonical NEW.
    const effWorkflowId: string | null = isUntriaged
      ? null
      : ((data.workflowId as string | undefined) ?? spaceWorkflowId ?? null);

    /*
      A workflow id arriving from a client says nothing about whose it is.

      This was used unchecked: the status lookup below filters on workflowId
      alone, so passing another tenant's id created a task running on THEIR
      state machine — their status names, their transitions, inside this
      organization. Narrow to exploit and trivial to prevent.

      Checked against effectiveOrgId, the org the TASK will belong to, which is
      not always the caller's: in a cross-org shared space the task belongs to
      the space's owner, so its workflow must be the owner's too. The triage
      path has always done this; creation had not.
    */
    await assertWorkflowInOrg(this.prisma, effWorkflowId, effectiveOrgId);

    /*
      And it must be a task type this SPACE offers — not merely one the
      organization owns.

      Owning it is no longer enough now that each space chooses its own set: a
      space that deliberately does not offer "Logistics" should not receive a
      task running on it because someone passed the id. One level stricter than
      the ownership check above, and the same shape — an id from a client says
      nothing about where it may be used.

      Only when the space HAS offerings. A space still on the legacy column has
      none, and its inherited default already passed the ownership check.
    */
    if (effWorkflowId && data.spaceId) {
      const offered = await listSpaceWorkflowIds(this.prisma, data.spaceId);
      if (offered.length > 0 && !offered.includes(effWorkflowId)) {
        throw new BadRequestException('That task type is not available in this space');
      }
    }

    let initialStatus: string = hasAssignment ? TaskStatus.ASSIGNED : TaskStatus.NEW;
    if (effWorkflowId) {
      const firstStatus = await this.prisma.workflowStatus.findFirst({
        where: { workflowId: effWorkflowId, isCanceled: false },
        orderBy: { position: 'asc' },
        select: { key: true },
      });
      if (firstStatus) initialStatus = firstStatus.key;
    }

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
      throw new BadRequestException({ message: 'Choose a workspace to open a task to a role', code: 'ROLE_TASK_NEEDS_SPACE' });
    }
    /*
      The role is checked against the task's FINAL workspace (after the default-
      space fallback) — including the right to open it there, for a caller whose
      assign right is per workspace (the gateway forwards those spaces only when
      no workspace was named). Not refused: the task is still raised, unopened,
      exactly as the gateway strips it when the named workspace is not theirs.
    */
    const mayOpenHere = !Array.isArray(data.roleAssignSpaceIds) || data.roleAssignSpaceIds.includes(data.spaceId);
    const openRole = openRoleId && mayOpenHere
      ? await this.rolePool.resolveOpenRole(effectiveOrgId, data.spaceId, openRoleId)
      : null;

    const task = await this.prisma.$transaction(async (tx) => {
      const createdTask = await tx.task.create({
        data: {
          ...(typeof data.id === 'string' && data.id ? { id: data.id } : {}),
          ...(openRole ? this.rolePool.openColumns(openRole.id, data.openSpots) : {}),
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
    await this.support.createTaskEvent(task.id, data.userId, TaskEventType.CREATED);

    // If assigned during creation, also create assignment event and notify
    if (hasAssignment) {
      await this.support.createTaskEvent(task.id, data.userId, TaskEventType.ASSIGNED, {
        workerId: data.assignedToId,
        workerName: task.assignedTo ? `${task.assignedTo.firstName} ${task.assignedTo.lastName}` : '',
      });

      this.notificationClient.emit('task_assigned', {
        task,
        workerId: data.assignedToId,
        // Who did it — so the person who assigns work to themselves is not emailed about it.
        actorId: data.userId,
        watcherIds: await this.support.taskWatcherIds(data.assignedToId, task.organizationId),
      });
    }

    // Notify
    this.notificationClient.emit('task_created', task);

    // Opened to a role: the record, then the first wave (the free ones now).
    if (openRole) await this.rolePool.afterOpened(task.id, data.userId, openRole, (task as any).openSpots ?? 1);

    this.support.invalidateStatusCountsCache(task.organizationId);

    return success(task);
  }

  /**
   * Re-sync every task in a space onto that space's workflow.
   *
   * Legacy tasks may carry a workflowId/status from before the space's workflow
   * was set, so they no longer match the space-driven board columns. This points
   * all of the space's tasks at the space's workflow and remaps any status that
   * isn't valid in that workflow to a sensible target (keeping final/canceled
   * intent where we can, otherwise resetting to the workflow's first status).
   */
  async resyncSpaceWorkflow(data: { spaceId: string; organizationId: string }) {
    // 1. Load the space (org-scoped). No workflow → nothing to sync.
    const space = await this.prisma.companyLocation.findFirst({
      where: { id: data.spaceId, organizationId: data.organizationId },
      select: { id: true, workflowId: true },
    });
    if (!space) {
      throw new NotFoundException('Space not found');
    }
    const targetWorkflowId = await resolveSpaceDefaultWorkflowId(this.prisma, space.id);
    if (!targetWorkflowId) {
      return success({ updated: 0, remapped: 0, reason: 'space has no workflow' });
    }

    // 2. Load the target workflow's statuses (ordered by position).
    const statuses = await this.prisma.workflowStatus.findMany({
      where: { workflowId: targetWorkflowId },
      orderBy: { position: 'asc' },
      select: { key: true, position: true, isFinal: true, isCanceled: true },
    });
    if (statuses.length === 0) {
      return success({ updated: 0, remapped: 0, reason: 'workflow has no statuses' });
    }
    // First non-canceled status by position (fallback to the very first).
    const firstKey = (statuses.find((s) => !s.isCanceled) ?? statuses[0]).key;
    const finalKey = statuses.find((s) => s.isFinal)?.key ?? null;
    const canceledKey = statuses.find((s) => s.isCanceled)?.key ?? null;
    const validKeys = new Set(statuses.map((s) => s.key));

    // Canonical fallbacks so pre-workflow tasks (NEW/ASSIGNED/COMPLETED/CANCELED…)
    // are classified sanely even though those keys aren't in the target workflow.
    const CANONICAL_FINAL = new Set<string>([
      TaskStatus.COMPLETED,
      TaskStatus.CLOSED,
    ]);
    const CANONICAL_CANCELED = new Set<string>([TaskStatus.CANCELED]);

    // 3. Load every task in the space (org-scoped).
    const tasks = await this.prisma.task.findMany({
      where: { spaceId: space.id, organizationId: data.organizationId },
      select: { id: true, status: true, workflowId: true },
    });

    // Compute the target status for each task; group by resulting status so we
    // can updateMany per bucket instead of one write per task.
    const remapStatus = (oldStatus: string): string => {
      // Already valid in the target workflow → keep it.
      if (validKeys.has(oldStatus)) return oldStatus;
      // Was a final/canceled state → map to the target's final/canceled if any.
      if (CANONICAL_FINAL.has(oldStatus) && finalKey) return finalKey;
      if (CANONICAL_CANCELED.has(oldStatus) && canceledKey) return canceledKey;
      // Unknown/other → reset to the workflow's first status.
      return firstKey;
    };

    // taskIds grouped by the status they should end up with — but only tasks
    // that actually change (status or workflowId differs).
    const byTargetStatus = new Map<string, string[]>();
    let remapped = 0;
    for (const task of tasks) {
      const newStatus = remapStatus(task.status);
      const statusChanged = newStatus !== task.status;
      const workflowChanged = task.workflowId !== targetWorkflowId;
      if (!statusChanged && !workflowChanged) continue; // no-op
      if (statusChanged) remapped++;
      const bucket = byTargetStatus.get(newStatus);
      if (bucket) bucket.push(task.id);
      else byTargetStatus.set(newStatus, [task.id]);
    }

    let updated = 0;
    if (byTargetStatus.size > 0) {
      await this.prisma.$transaction(
        Array.from(byTargetStatus.entries()).map(([status, ids]) =>
          this.prisma.task.updateMany({
            where: { id: { in: ids } },
            data: { workflowId: targetWorkflowId, status },
          }),
        ),
      );
      for (const ids of byTargetStatus.values()) updated += ids.length;
    }

    this.support.invalidateStatusCountsCache(data.organizationId);

    return success({ updated, remapped });
  }

  /**
   * Re-sync EVERY space in the org onto its own workflow (one-click admin action).
   * Loops each space that has a workflow and reuses resyncSpaceWorkflow, then
   * aggregates the totals. Sequential to avoid DB contention (infrequent action).
   */
  async resyncAllSpaces(data: { organizationId: string }) {
    const spaces = await this.prisma.companyLocation.findMany({
      where: { organizationId: data.organizationId, workflowId: { not: null } },
      select: { id: true },
    });
    let updated = 0;
    let remapped = 0;
    let spacesProcessed = 0;
    for (const space of spaces) {
      const res = await this.resyncSpaceWorkflow({ spaceId: space.id, organizationId: data.organizationId });
      const d = (res as { data?: { updated?: number; remapped?: number } })?.data;
      updated += d?.updated ?? 0;
      remapped += d?.remapped ?? 0;
      spacesProcessed += 1;
    }
    return success({ spacesProcessed, updated, remapped });
  }

  /**
   * Update a task (CLIENT or DISPATCHER - any task in their org)
   */
  async update(data: any) {
    // `access` is the caller's resolved grant (for foreign-space authz) — pull it
    // out so it never leaks into the Prisma update payload.
    // The caller's grants come out too, so they can never reach the write or
    // the event's `changes` metadata.
    const {
      id, userId, userRole, organizationId, access,
      canCreateTasks, createSpaceIds, canViewAllTasks, viewAllSpaceIds, canAssignTasks, sharedSpaceIds, taskCreationScope,
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
      const destination = updateData.spaceId === undefined ? undefined : ((updateData.spaceId as string) || null);
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
    const closeRole = updateData.spaceId !== undefined && (updateData.spaceId || null) !== existingTask.spaceId && !!existingTask.openRoleId;

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
        ...(updateData.startDate !== undefined && { startDate: updateData.startDate ? new Date(updateData.startDate) : null }),
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
    this.notificationClient.emit('task_updated', { task });

    return success(task);
  }

  /**
   * Delete a task (CLIENT only - own tasks)
   */
  async remove(data: { id: string; userId: string; userRole: string; canViewAllTasks?: boolean; organizationId: string }) {
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
    this.notificationClient.emit('task_deleted', {
      taskId: data.id,
      organizationId: task.organizationId,
      spaceId: task.spaceId ?? null,
    });

    this.support.invalidateStatusCountsCache(task.organizationId);

    return success(null, 'Task deleted successfully');
  }
}
