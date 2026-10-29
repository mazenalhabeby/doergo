import { Injectable, BadRequestException, ForbiddenException } from '@nestjs/common';
import {
  PrismaService,
  resolveCrmCaps,
  type CrmCaps,
  crmReachSelect,
  crmReachOfRow,
  crmReachOrgOnly,
  crmCapsIn,
  crmCreateScope,
  crmReachesClientIn,
  crmReachWhere,
  NO_CRM_CAPS,
  type CrmReach,
} from '@hbcfield/shared';
import { notFound, CrmCaller } from './customers-helpers';

/**
 * CRM reach: who may see and work which client — the caller's reach, the caps on
 * one client (404 when out of reach), and where they may add one. Every client
 * service asks this one rule, so a list and a single-record check cannot disagree.
 */
@Injectable()
export class CrmReachService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Where the caller may work the client book — org-wide, and per workspace
   * (`CrmReach`, shared crm/crm-reach.ts). Server-authoritative.
   *
   * ⚠️ Resolved from the DATABASE, never from the RPC payload. The gateway does
   * hold a resolved access on `req.user`, but it is cached up to a minute and
   * assembled per call site; one row read here (the same one read before) is
   * always current, applies the module each workspace really runs, and cannot
   * be handed a reach some future route built from a request body. The payload
   * carries the caller's identity only.
   *
   * Public: the contacts import and the portal's address routes ask the same rule.
   */
  async crmReachFor(caller: CrmCaller | undefined, organizationId: string): Promise<CrmReach> {
    if (!caller?.userId) return crmReachOrgOnly(NO_CRM_CAPS);
    // An admin holds every CRM ability by being one (as the resolver says) — no read needed.
    if (caller.role === 'ADMIN') return crmReachOrgOnly(resolveCrmCaps('ADMIN', {}));
    const u = await this.prisma.user.findFirst({
      where: { id: caller.userId, organizationId },
      select: crmReachSelect(),
    });
    return crmReachOfRow(u as never);
  }

  /** `crmReachesClientIn` for a caller — all-scope where it is filed, or owns / co-manages it there. */
  canReach(
    reach: CrmReach,
    client: { spaceId?: string | null; ownerId?: string | null; managerIds?: string[] },
    caller: CrmCaller | undefined,
  ): boolean {
    return crmReachesClientIn(reach, client, caller?.userId);
  }

  /** `canReach` as a `where` — one rule, so a list and a single-record check cannot disagree. */
  reachableWhere(reach: CrmReach, caller: CrmCaller | undefined): Record<string, unknown> {
    return crmReachWhere(reach, caller?.userId);
  }

  /**
   * The caps that apply to ONE client — org ∪ the workspace it is filed in —
   * or a 404 when the caller cannot reach it. The client's spaceId is the one
   * read from the database, never one the request names.
   */
  capsOn(
    reach: CrmReach,
    client: { spaceId?: string | null; ownerId?: string | null; managerIds?: string[] },
    caller: CrmCaller | undefined,
  ): CrmCaps {
    const caps = crmCapsIn(reach, client.spaceId);
    if (!caps.canAccess || !this.canReach(reach, client, caller)) throw notFound();
    return caps;
  }

  /**
   * A manage-level action (portal residents, reassigning, deleting) on one
   * client: manage where it is filed. Out of reach is a 404 like everywhere
   * else; within reach but without manage, a 403.
   *
   * ⚠️ Reach FIRST: manage is an action on the clients the caller can see, not
   * a key to the whole book. A rep with own-book view + manage could take or
   * delete anybody's client when manage was checked before reach.
   */
  assertManage(
    reach: CrmReach,
    client: { spaceId?: string | null; ownerId?: string | null; managerIds?: string[] },
    caller: CrmCaller | undefined,
    message = 'Not allowed',
  ): CrmCaps {
    const caps = crmCapsIn(reach, client.spaceId);
    if (!caps.canAccess || !this.canReach(reach, client, caller)) throw notFound();
    if (caps.manage) return caps;
    throw new ForbiddenException(message);
  }

  /**
   * Load one client the caller is actually allowed to reach, or refuse.
   *
   * 404 rather than 403 when it exists but is out of scope — the rest of this
   * service is careful not to confirm which client ids exist, and a link
   * endpoint would otherwise be the one place that does.
   */
  async reachable(id: string, organizationId: string, reach: CrmReach, caller: CrmCaller | undefined) {
    const c = await this.prisma.customer.findFirst({
      where: { id, organizationId },
      select: {
        id: true,
        name: true,
        type: true,
        spaceId: true,
        isContact: true,
        contactName: true,
        ownerId: true,
        managerIds: true,
        isPortalResident: true,
      },
    });
    if (!c) throw notFound();
    // The caps that apply to THIS record — org ∪ the workspace it is filed in.
    return { ...c, caps: this.capsOn(reach, c, caller) };
  }

  /**
   * May the caller add a client filed in `spaceId` (null = filed nowhere)?
   *
   * Org-wide create may file it anywhere, including nowhere. A create held only
   * in some workspaces files it in one of THOSE — never nowhere, because an
   * unfiled client answers to org-wide grants alone and its creator could not
   * open it again.
   */
  assertMayCreateIn(reach: CrmReach, spaceId: string | null) {
    if (crmCapsIn(reach, spaceId).create) return;
    const scope = crmCreateScope(reach);
    if (!scope.anywhere && !scope.spaceIds.length) throw new ForbiddenException('Not allowed to create clients');
    if (!spaceId)
      throw new BadRequestException({ message: 'Choose a workspace for this client.', code: 'CRM_WORKSPACE_REQUIRED' });
    throw new ForbiddenException({
      message: 'Not allowed to add clients in this workspace.',
      code: 'CRM_WORKSPACE_NOT_ALLOWED',
    });
  }

  /** Assert the caller may reach this client (owner/co-manager or view-all), and
   *  optionally that they may WORK it (change stage / add notes). Server-side. */
  async assertCrmReach(
    customerId: string,
    organizationId: string,
    caller: CrmCaller | undefined,
    opts?: { needWork?: boolean },
  ) {
    const c = await this.prisma.customer.findFirst({
      where: { id: customerId, organizationId },
      select: { id: true, spaceId: true, ownerId: true, managerIds: true, isPortalResident: true },
    });
    if (!c) throw notFound();
    const reach = await this.crmReachFor(caller, organizationId);
    if (c.isPortalResident) {
      this.assertManage(reach, c, caller);
      return c;
    }
    const caps = this.capsOn(reach, c, caller);
    if (opts?.needWork && !(caps.work || caps.manage)) throw new ForbiddenException('Not allowed');
    return c;
  }
}
