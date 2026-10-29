import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService, success, scopeAllows, type SpaceScopeIds, activePortals, portalInOrg } from '@hbcfield/shared';
import { MediaSigner } from '../../../common/storage/media-signer.service';
import { portalRequestShape, portalRequestScope } from './portal-request';

/**
 * The customer portal's side of tasks: a customer's own requests (always
 * filtered by BOTH the organization and the caller's own customerId), the
 * office's view of a whole portal, and triage — a pending request routed into
 * a space as live work.
 */
/** The approvals inbox reads at most this many portals (oldest first). */
const WAITING_REQUESTS_MAX_PORTALS = 20;
/** The phone's Client requests: every portal the caller reads, and at most this many requests, newest first. */
const ALL_REQUESTS_MAX_PORTALS = 100;
const ALL_REQUESTS_MAX_ROWS = 500;

@Injectable()
export class TaskPortalService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly media: MediaSigner,
  ) {}

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
        ...portalRequestScope(data.scopeSpaceIds),
      },
      orderBy: { createdAt: 'desc' },
      include: {
        unit: { select: { id: true, name: true } },
        workflow: { select: { statuses: { orderBy: { position: 'asc' } } } },
      },
    });
    return success(tasks.map((t) => portalRequestShape(t)));
  }

  /**
   * Every request across a whole portal (office view, newest first). Scoped by
   * the portal each request was RAISED in (`Task.portalId`), so it never leaks
   * across orgs or portals, and a client leaving the portal does not take its
   * requests out of the inbox. Includes the submitting client's name.
   */
  async listPortalRequestsByPortal(data: { organizationId: string; portalId: string; scopeSpaceIds?: SpaceScopeIds }) {
    // Explicit portal-ownership check (defense-in-depth): the task filter below
    // already scopes by org + the customer→portal join, but assert the portal
    // belongs to the caller's org so ownership never rests on an implicit join.
    const ownsPortal = await portalInOrg(this.prisma, data.portalId, data.organizationId);
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
        // The portal the request was RAISED in — a client who left the portal keeps its requests here.
        portalId: data.portalId,
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
        ...portalRequestShape(t),
        description: t.description ?? null,
        customerId: t.customerId ?? null,
        customerName: t.customer?.name ?? null,
        unitAddress: t.unit?.address ?? null,
        suggestedSpaceId: suggestedSpace?.id ?? null,
        suggestedSpaceName: suggestedSpace?.name ?? null,
      })),
    );
  }

  /**
   * The approvals inbox's read: every request still waiting for triage, across the portals the
   * caller reads requests in. One read instead of one per portal. The portals are exactly the ones
   * `portal_list` gives the caller (active, in their workspaces, oldest first, the inbox's cap of
   * 20), and each row is what `portal_list_requests_by_portal` answers for it, plus `portalId`.
   */
  async listWaitingPortalRequests(data: { organizationId: string; scopeSpaceIds?: SpaceScopeIds }) {
    return this.requestsAcrossPortals(data, false);
  }

  /** The same read with every request, triaged or not (the phone's Client requests: one read, not one per portal). */
  async listAllPortalRequests(data: { organizationId: string; scopeSpaceIds?: SpaceScopeIds }) {
    return this.requestsAcrossPortals(data, true);
  }

  private async requestsAcrossPortals(data: { organizationId: string; scopeSpaceIds?: SpaceScopeIds }, all: boolean) {
    const portals = await activePortals(
      this.prisma,
      data.organizationId,
      data.scopeSpaceIds,
      all ? ALL_REQUESTS_MAX_PORTALS : WAITING_REQUESTS_MAX_PORTALS,
    );
    if (portals.length === 0) return success([]);
    const spaceIds = [...new Set(portals.map((p) => p.spaceId).filter((id): id is string => !!id))];
    const [spaces, tasks] = await Promise.all([
      spaceIds.length
        ? this.prisma.companyLocation.findMany({
            where: { id: { in: spaceIds }, organizationId: data.organizationId },
            select: { id: true, name: true },
          })
        : Promise.resolve([]),
      this.prisma.task.findMany({
        where: {
          organizationId: data.organizationId,
          source: 'CUSTOMER_PORTAL',
          ...(all ? {} : { triaged: false }),
          portalId: { in: portals.map((p) => p.id) },
        },
        orderBy: { createdAt: 'desc' },
        ...(all ? { take: ALL_REQUESTS_MAX_ROWS } : {}),
        include: {
          unit: { select: { id: true, name: true, address: true } },
          customer: { select: { id: true, name: true } },
          space: { select: { id: true, name: true } },
          workflow: { select: { statuses: { orderBy: { position: 'asc' } } } },
        },
      }),
    ]);
    const spaceById = new Map(spaces.map((s) => [s.id, s]));
    // Portal by portal in the list's order, each portal's requests newest first — the order the
    // inbox got from one read per portal.
    return success(
      portals.flatMap((p) => {
        const suggested = p.spaceId ? spaceById.get(p.spaceId) : undefined;
        return tasks
          .filter((t) => t.portalId === p.id)
          .map((t) => ({
            ...portalRequestShape(t),
            description: t.description ?? null,
            customerId: t.customerId ?? null,
            customerName: t.customer?.name ?? null,
            unitAddress: t.unit?.address ?? null,
            suggestedSpaceId: suggested?.id ?? null,
            suggestedSpaceName: suggested?.name ?? null,
            portalId: p.id,
            portalSpaceId: p.spaceId ?? null,
          }));
      }),
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
        attachments: {
          select: { id: true, fileUrl: true, fileKey: true, mimeType: true, fileType: true, fileName: true },
        },
      },
    });
    if (!task) {
      throw new NotFoundException('Request not found');
    }
    const attachments = (await this.media.signAll(task.attachments)).map(({ fileKey: _k, ...a }) => a);
    return success({ ...portalRequestShape(task), description: task.description, attachments });
  }
}
