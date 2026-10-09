import { Injectable, NotFoundException, BadRequestException, Inject } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { MediaSigner } from '../../common/storage/media-signer.service';
import { PrismaService } from '../../common/prisma/prisma.service';
import { resolveSpaceDefaultWorkflowId } from '../../common/space-workflow.util';
import { TaskStatus, TaskEventType, success, canReceiveTasks } from '@hbcfield/shared';
import { TaskSupportService } from './task-support.service';
import { TaskAssignmentService } from './task-assignment.service';

/**
 * The customer portal's side of tasks: a customer's own requests (always
 * filtered by BOTH the organization and the caller's own customerId), the
 * office's view of a whole portal, and triage — a pending request routed into
 * a space as live work.
 */
@Injectable()
export class TaskPortalService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject('NOTIFICATION_SERVICE') private readonly notificationClient: ClientProxy,
    private readonly media: MediaSigner,
    private readonly support: TaskSupportService,
    private readonly assignment: TaskAssignmentService,
  ) {}

  // ============ Customer Portal (customer-scoped reads) ============
  // Every query is filtered by BOTH organizationId AND the caller's own
  // customerId (passed from the verified token, never the client body) so a
  // customer can only ever see their own requests.

  private portalRequestShape(task: any) {
    const statuses: any[] = task.workflow?.statuses ?? [];
    const curIdx = statuses.findIndex((s) => s.key === task.status);
    const timeline = statuses.map((s, i) => ({
      label: s.name,
      state: curIdx < 0 ? 'pending' : i < curIdx ? 'done' : i === curIdx ? 'active' : 'pending',
    }));
    return {
      id: task.id,
      reference: `#${String(task.id).slice(-6).toUpperCase()}`,
      title: task.title,
      status: task.status,
      priority: task.priority,
      unitName: task.unit?.name ?? null,
      unitId: task.unitId ?? null,
      // Triage state (admin inbox): false = pending triage (no space/flow yet).
      triaged: task.triaged ?? true,
      spaceId: task.spaceId ?? null,
      spaceName: task.space?.name ?? null,
      assignedToId: task.assignedToId ?? null,
      createdAt: task.createdAt,
      updatedAt: task.updatedAt,
      // The client renders live tracking only when the current status enables it.
      tracked: statuses[curIdx]?.capabilities?.includes('gps') ?? false,
      timeline,
    };
  }

  /** A customer's own requests (newest first). */
  async listPortalRequests(data: { organizationId: string; customerId: string }) {
    const tasks = await this.prisma.task.findMany({
      where: {
        organizationId: data.organizationId,
        customerId: data.customerId,
        source: 'CUSTOMER_PORTAL',
      },
      orderBy: { createdAt: 'desc' },
      include: {
        unit: { select: { id: true, name: true } },
        workflow: { select: { statuses: { orderBy: { position: 'asc' } } } },
      },
    });
    return success(tasks.map((t) => this.portalRequestShape(t)));
  }

  /**
   * Every request across a whole portal (office view, newest first). Scoped by
   * the portal's customers via the Customer.portalId relation, so it never leaks
   * across orgs or portals. Includes the submitting client's name.
   */
  async listPortalRequestsByPortal(data: { organizationId: string; portalId: string }) {
    // Explicit portal-ownership check (defense-in-depth): the task filter below
    // already scopes by org + the customer→portal join, but assert the portal
    // belongs to the caller's org so ownership never rests on an implicit join.
    const ownsPortal = await this.prisma.portal.findFirst({
      where: { id: data.portalId, organizationId: data.organizationId },
      select: { id: true, spaceId: true },
    });
    if (!ownsPortal) return success([]);

    // The portal's routing space (if linked) — pre-fills triage so the admin
    // doesn't re-pick the space for every request from this property.
    const suggestedSpace = ownsPortal.spaceId
      ? await this.prisma.companyLocation.findFirst({
          where: { id: ownsPortal.spaceId, organizationId: data.organizationId },
          select: { id: true, name: true },
        })
      : null;

    const tasks = await this.prisma.task.findMany({
      where: {
        organizationId: data.organizationId,
        source: 'CUSTOMER_PORTAL',
        customer: { portalId: data.portalId },
      },
      orderBy: [{ triaged: 'asc' }, { createdAt: 'desc' }], // pending-triage first
      include: {
        unit: { select: { id: true, name: true, address: true } },
        customer: { select: { id: true, name: true } },
        space: { select: { id: true, name: true } },
        workflow: { select: { statuses: { orderBy: { position: 'asc' } } } },
      },
    });
    return success(
      tasks.map((t) => ({
        ...this.portalRequestShape(t),
        description: t.description ?? null,
        customerId: t.customerId ?? null,
        customerName: (t as any).customer?.name ?? null,
        unitAddress: (t as any).unit?.address ?? null,
        suggestedSpaceId: suggestedSpace?.id ?? null,
        suggestedSpaceName: suggestedSpace?.name ?? null,
      })),
    );
  }

  /** One of the customer's own requests — 404 if it isn't theirs. */
  async getPortalRequest(data: { id: string; organizationId: string; customerId: string }) {
    const task = await this.prisma.task.findFirst({
      where: {
        id: data.id,
        organizationId: data.organizationId,
        customerId: data.customerId,
        source: 'CUSTOMER_PORTAL',
      },
      include: {
        unit: { select: { id: true, name: true } },
        workflow: { select: { statuses: { orderBy: { position: 'asc' } } } },
        attachments: { select: { id: true, fileUrl: true, fileKey: true, mimeType: true, fileType: true, fileName: true } },
      },
    });
    if (!task) {
      throw new NotFoundException('Request not found');
    }
    const attachments = (await this.media.signAll(task.attachments)).map(({ fileKey: _k, ...a }) => a);
    return success({ ...this.portalRequestShape(task), description: task.description, attachments });
  }

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
  }) {
    const task = await this.prisma.task.findFirst({
      where: { id: data.id, organizationId: data.organizationId, source: 'CUSTOMER_PORTAL' },
    });
    if (!task) throw new NotFoundException('Request not found');
    if (task.triaged) throw new BadRequestException('This request has already been routed');

    // Space is REQUIRED — a triaged task always belongs to a space.
    if (!data.spaceId) throw new BadRequestException('Pick a space to route this request to');
    const space = await this.prisma.companyLocation.findFirst({
      where: { id: data.spaceId, organizationId: data.organizationId },
      select: { id: true, lat: true, lng: true, address: true, workflowId: true },
    });
    if (!space) throw new NotFoundException('Space not found');

    // Flow: explicit choice wins; otherwise inherit the space's default flow.
    // null is a valid explicit choice (canonical NEW/ASSIGNED, no workflow).
    const effWorkflowId: string | null =
      data.workflowId !== undefined
        ? data.workflowId
        : await resolveSpaceDefaultWorkflowId(this.prisma, space.id);
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
          OR: [{ effectiveTo: null }, { effectiveTo: { gte: new Date() } }],
        },
        select: { id: true },
      });
      if (!member) {
        throw new BadRequestException('The worker must be a member of the selected space');
      }
      const worker = await this.prisma.user.findFirst({
        where: { id: data.assignedToId, organizationId: data.organizationId, isActive: true },
        select: { id: true, firstName: true, lastName: true, role: true, enabledModules: true },
      });
      if (!worker) throw new NotFoundException('Worker not found or not in your organization');
      if (!canReceiveTasks(worker)) {
        throw new BadRequestException(
          `${worker.firstName} ${worker.lastName} cannot be assigned tasks — their access profile does not include the Tasks feature.`,
        );
      }
      // Qualified for the task type this triage is about to create.
      await this.assignment.assertAssigneesAreQualified(
        [worker.id],
        [worker],
        effWorkflowId,
        data.organizationId,
      );
      assignedToId = worker.id;
      workerName = `${worker.firstName} ${worker.lastName}`;
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
    const unit = task.unitId
      ? await this.prisma.customerUnit.findFirst({
          where: { id: task.unitId, organizationId: data.organizationId },
          select: { address: true, name: true },
        })
      : null;
    const routedAddress = unit?.address || task.locationAddress || space.address || null;

    const updated = await this.prisma.task.update({
      where: { id: data.id },
      data: {
        spaceId: data.spaceId,
        workflowId: effWorkflowId,
        status: initialStatus,
        priority: (data.priority as any) || task.priority,
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
      this.notificationClient.emit('task_assigned', {
        task: updated,
        workerId: assignedToId,
        actorId: data.userId,
        watcherIds: await this.support.taskWatcherIds(assignedToId, updated.organizationId),
      });
    }
    this.notificationClient.emit('task_updated', { task: updated });
    this.support.invalidateStatusCountsCache(updated.organizationId);

    return success(updated);
  }
}
