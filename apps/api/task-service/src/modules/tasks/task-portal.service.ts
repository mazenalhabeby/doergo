import { Injectable, NotFoundException } from '@nestjs/common';
import { success, scopeAllows, type SpaceScopeIds } from '@hbcfield/shared';
import { TaskPortalBase } from './task-portal.base';

/**
 * The customer portal's side of tasks: a customer's own requests (always
 * filtered by BOTH the organization and the caller's own customerId), the
 * office's view of a whole portal, and triage — a pending request routed into
 * a space as live work.
 */
@Injectable()
export class TaskPortalService extends TaskPortalBase {

  /**
   * One client's requests (newest first) — the customer's own list, and the
   * office's view of one resident (`scopeSpaceIds` set by the office route
   * only; the customer route passes their own customerId from the token).
   */
  async listPortalRequests(data: { organizationId: string; customerId: string; scopeSpaceIds?: SpaceScopeIds }) {
    const tasks = await this.prisma.task.findMany({
      where: {
        organizationId: data.organizationId,
        customerId: data.customerId,
        source: 'CUSTOMER_PORTAL',
        ...this.requestScope(data.scopeSpaceIds),
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
  async listPortalRequestsByPortal(data: { organizationId: string; portalId: string; scopeSpaceIds?: SpaceScopeIds }) {
    // Explicit portal-ownership check (defense-in-depth): the task filter below
    // already scopes by org + the customer→portal join, but assert the portal
    // belongs to the caller's org so ownership never rests on an implicit join.
    const ownsPortal = await this.prisma.portal.findFirst({
      where: { id: data.portalId, organizationId: data.organizationId },
      select: { id: true, spaceId: true },
    });
    if (!ownsPortal) return success([]);
    // …and to a workspace the caller reads portal requests in. 404, like a
    // portal of another organization: "it exists, but not for you" is an answer.
    if (!scopeAllows(data.scopeSpaceIds, ownsPortal.spaceId)) throw new NotFoundException('Portal not found');

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
}
