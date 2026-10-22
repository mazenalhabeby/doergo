import { Injectable, NotFoundException, BadRequestException, ForbiddenException } from '@nestjs/common';
import { resolveSpaceDefaultWorkflowId } from '../../common/space-workflow.util';
import {
  personName,
  notEndedWhere,
  TaskStatus,
  TaskEventType,
  success,
  canReceiveTasks,
  scopeAllows,
  type SpaceScopeIds,
  unitAddress,
  workerToAssign,
} from '@hbcfield/shared';
import { TaskPortalBase } from './task-portal.base';
import { emitEvent, taskAssignedEvent, taskUpdatedEvent } from '@hbcfield/shared/microservices';
import type { TaskPriority } from '@prisma/client';

/** Turning a client's request into a job, closing it, or sending it back — triage. */
@Injectable()
export class TaskTriageService extends TaskPortalBase {
  /**
   * Triage a pending portal request → a live task. The admin picks the SPACE
   * (required, so the task is always related to a space), the FLOW (task type /
   * workflow — defaults to the space's flow but can be anything, so the task is
   * dynamic), the priority and optionally the worker. Flips triaged → true and
   * the request drops out of the inbox onto the chosen space's board.
   */
  async triageRequest(data: {
    id: string;
    organizationId: string;
    spaceId: string;
    workflowId?: string | null;
    priority?: string;
    assignedToId?: string | null;
    userId: string;
    /** Workspaces the caller ANSWERS portal requests in (undefined/null = org-wide). */
    scopeSpaceIds?: SpaceScopeIds;
    /**
     * Workspaces the caller may ASSIGN work in — sent only for a workspace-scoped
     * answerer. Routing a request is answering it; naming who does the job is
     * assigning work, which is its own permission. An org-wide answerer keeps
     * what `canManagePortals` always allowed (the field is not sent).
     */
    assignScopeSpaceIds?: SpaceScopeIds;
  }) {
    const task = await this.prisma.task.findFirst({
      where: {
        id: data.id,
        organizationId: data.organizationId,
        source: 'CUSTOMER_PORTAL',
        ...this.requestScope(data.scopeSpaceIds),
      },
    });
    if (!task) throw new NotFoundException('Request not found');
    if (task.triaged) throw new BadRequestException('This request has already been routed');

    // Space is REQUIRED — a triaged task always belongs to a space.
    if (!data.spaceId) throw new BadRequestException('Pick a space to route this request to');
    // A workspace-scoped answerer routes into a workspace they answer for —
    // never drops work onto the board next door. Same 404 as a missing space.
    if (!scopeAllows(data.scopeSpaceIds, data.spaceId)) throw new NotFoundException('Space not found');
    if (data.assignedToId && !scopeAllows(data.assignScopeSpaceIds, data.spaceId)) {
      throw new ForbiddenException('You cannot assign work in this workspace');
    }
    const space = await this.prisma.companyLocation.findFirst({
      where: { id: data.spaceId, organizationId: data.organizationId },
      select: { id: true, lat: true, lng: true, address: true, workflowId: true },
    });
    if (!space) throw new NotFoundException('Space not found');

    // Flow: explicit choice wins; otherwise inherit the space's default flow.
    // null is a valid explicit choice (canonical NEW/ASSIGNED, no workflow).
    const effWorkflowId: string | null =
      data.workflowId !== undefined ? data.workflowId : await resolveSpaceDefaultWorkflowId(this.prisma, space.id);
    if (effWorkflowId) {
      const wf = await this.prisma.statusWorkflow.findFirst({
        where: { id: effWorkflowId, organizationId: data.organizationId },
        select: { id: true },
      });
      if (!wf) throw new NotFoundException('Flow not found');
    }

    // Assignee (optional): MUST be a member of the space we're routing to — you
    // can only hand the job to someone actually on that space's roster (active
    // assignment window). Mirrors the triage UI, which only offers space members.
    let assignedToId: string | null = null;
    let workerName = '';
    if (data.assignedToId) {
      const member = await this.prisma.spaceAssignment.findFirst({
        where: {
          spaceId: data.spaceId,
          userId: data.assignedToId,
          ...notEndedWhere(),
        },
        select: { id: true },
      });
      if (!member) {
        throw new BadRequestException('The worker must be a member of the selected space');
      }
      const worker = await workerToAssign(this.prisma, data.assignedToId, data.organizationId);
      if (!worker) throw new NotFoundException('Worker not found or not in your organization');
      if (!canReceiveTasks(worker)) {
        throw new BadRequestException(
          `${worker.firstName} ${worker.lastName} cannot be assigned tasks — their access profile does not include the Tasks feature.`,
        );
      }
      // Qualified for the task type this triage is about to create.
      await this.assignment.assertAssigneesAreQualified([worker.id], [worker], effWorkflowId, data.organizationId);
      assignedToId = worker.id;
      workerName = personName(worker);
    }

    // Initial status: the flow's first status, else ASSIGNED (if assigned) or NEW.
    let initialStatus: string = assignedToId ? TaskStatus.ASSIGNED : TaskStatus.NEW;
    if (effWorkflowId) {
      const firstStatus = await this.prisma.workflowStatus.findFirst({
        where: { workflowId: effWorkflowId, isCanceled: false },
        orderBy: { position: 'asc' },
        select: { key: true },
      });
      if (firstStatus) initialStatus = firstStatus.key;
    }

    // Location = the CLIENT's unit (the apartment the request is about), so the
    // worker is dispatched to the tenant — not the space's office. Fall back to
    // the space address if the unit has none. Coords come from the space (units
    // are address-only today) to give the map a rough pin at the property.
    const unit = task.unitId ? await unitAddress(this.prisma, task.unitId, data.organizationId) : null;
    const routedAddress = unit?.address || task.locationAddress || space.address || null;

    const updated = await this.prisma.task.update({
      where: { id: data.id },
      data: {
        spaceId: data.spaceId,
        workflowId: effWorkflowId,
        status: initialStatus,
        priority: (data.priority as TaskPriority) || task.priority,
        assignedToId,
        triaged: true,
        locationAddress: routedAddress,
        // Keep any coords the task already had; else use the space's as a rough pin.
        ...(task.locationLat == null && task.locationLng == null
          ? { locationLat: space.lat, locationLng: space.lng }
          : {}),
      },
      include: {
        assignedTo: { select: { id: true, firstName: true, lastName: true, email: true, avatarUrl: true } },
        createdBy: { select: { id: true, firstName: true, lastName: true, avatarUrl: true } },
      },
    });

    await this.support.createTaskEvent(data.id, data.userId, TaskEventType.UPDATED, {
      triaged: true,
      spaceId: data.spaceId,
      workflowId: effWorkflowId,
    });
    if (assignedToId) {
      await this.support.createTaskEvent(data.id, data.userId, TaskEventType.ASSIGNED, {
        workerId: assignedToId,
        workerName,
      });
      emitEvent(this.notificationClient, taskAssignedEvent, {
        task: updated,
        workerId: assignedToId,
        actorId: data.userId,
        watcherIds: await this.support.taskWatcherIds(assignedToId, updated.organizationId),
      });
    }
    emitEvent(this.notificationClient, taskUpdatedEvent, { task: updated });
    this.support.invalidateStatusCountsCache(updated.organizationId);

    return success(updated);
  }
}
