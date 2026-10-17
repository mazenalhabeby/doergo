import { Injectable, Inject } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { MediaSigner } from '../../common/storage/media-signer.service';
import { PrismaService } from '../../common/prisma/prisma.service';
import { portalRequestReference, type SpaceScopeIds } from '@hbcfield/shared';
import { TaskSupportService } from './task-support.service';
import { TaskAssignmentService } from './task-assignment.service';

/**
 * What reading and triaging client requests share: a request as the office sees
 * it, and the workspaces the caller may read them in.
 */
@Injectable()
export abstract class TaskPortalBase {

  constructor(
    protected readonly prisma: PrismaService,
    @Inject('NOTIFICATION_SERVICE') protected readonly notificationClient: ClientProxy,
    protected readonly media: MediaSigner,
    protected readonly support: TaskSupportService,
    protected readonly assignment: TaskAssignmentService,
  ) {}


  // ============ Customer Portal (customer-scoped reads) ============
  // Every query is filtered by BOTH organizationId AND the caller's own
  // customerId (passed from the verified token, never the client body) so a
  // customer can only ever see their own requests.

  protected portalRequestShape(task: any) {
    const statuses: any[] = task.workflow?.statuses ?? [];
    const curIdx = statuses.findIndex((s) => s.key === task.status);
    const timeline = statuses.map((s, i) => ({
      label: s.name,
      state: curIdx < 0 ? 'pending' : i < curIdx ? 'done' : i === curIdx ? 'active' : 'pending',
    }));
    return {
      id: task.id,
      reference: portalRequestReference(task.id),
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

  /**
   * A request's workspace is its PORTAL's (`Customer.portal.spaceId`) — not
   * `Task.spaceId`, which stays empty until triage and then names wherever the
   * work was routed. The office reads a portal's inbox, so reach follows the
   * portal: a request from a portal in a workspace the caller answers for is
   * theirs to read, wherever it was later routed. An organization-level portal
   * (no workspace) is in no list of ids — org-wide key only.
   *
   * undefined/null = org-wide (adds nothing) · [] = nowhere (matches nothing).
   */
  protected requestScope(scope: SpaceScopeIds): Record<string, unknown> {
    if (scope === undefined || scope === null) return {};
    return { customer: { portal: { spaceId: { in: scope } } } };
  }
}
