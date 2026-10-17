import { Injectable, NotFoundException, BadRequestException, ForbiddenException } from '@nestjs/common';
import { keepOrgUserIds } from '../../common/records/org-user-ids';
import { PrismaService } from '../../common/prisma/prisma.service';
import { resolveCrmCaps, type CrmCaps } from '@hbcfield/shared';
import {
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
import { usableLegalEntityId, COMPANY_UNKNOWN_MESSAGE } from '@hbcfield/shared';
import { notFound, CrmCaller, CustomerInput } from './customers-helpers';

/**
 * What every client service shares: CRM reach (who may see which client), the
 * checks before a write, and the client's company.
 */
@Injectable()
export abstract class CustomersServiceBase {
  constructor(protected readonly prisma: PrismaService) {}

  /** A client's company: one of this organization's active companies, or null. Anything else is refused. */
  protected async clientCompany(organizationId: string, value: unknown): Promise<string | null | undefined> {
    const r = await usableLegalEntityId(this.prisma as any, organizationId, value);
    if (!r.ok) throw new BadRequestException({ message: COMPANY_UNKNOWN_MESSAGE, code: 'COMPANY_UNKNOWN' });
    return r.id;
  }

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
  canReach(reach: CrmReach, client: { spaceId?: string | null; ownerId?: string | null; managerIds?: string[] }, caller: CrmCaller | undefined): boolean {
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
  protected capsOn(
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
   */
  protected assertManage(
    reach: CrmReach,
    client: { spaceId?: string | null; ownerId?: string | null; managerIds?: string[] },
    caller: CrmCaller | undefined,
    message = 'Not allowed',
  ): CrmCaps {
    const caps = crmCapsIn(reach, client.spaceId);
    if (caps.manage) return caps;
    if (!caps.canAccess || !this.canReach(reach, client, caller)) throw notFound();
    throw new ForbiddenException(message);
  }

  /**
   * Add each row's contact relationships, in one query for the whole page.
   *
   * A company gets a count ("3 contact people"); a person gets the company they
   * contact, primary first. Both come out of the same read — the ids are already
   * in hand, and asking twice, or once per row, would be work for a subtitle.
   */
  protected async decorateContacts(items: Array<Record<string, unknown>>, organizationId: string) {
    const companyIds = items.filter((c) => c.type === 'COMPANY').map((c) => c.id as string);
    const personIds = items.filter((c) => c.type !== 'COMPANY').map((c) => c.id as string);
    if (!companyIds.length && !personIds.length) return items;

    const links = await this.prisma.customerContact.findMany({
      where: {
        organizationId,
        OR: [
          ...(companyIds.length ? [{ companyId: { in: companyIds } }] : []),
          ...(personIds.length ? [{ personId: { in: personIds } }] : []),
        ],
      },
      select: {
        companyId: true, personId: true, isPrimary: true, role: true,
        company: { select: { id: true, name: true } },
        person: { select: { id: true, name: true } },
      },
      orderBy: [{ isPrimary: 'desc' }, { createdAt: 'asc' }],
    });

    const counts = new Map<string, number>();
    const primary = new Map<string, { id: string; name: string; role: string | null }>();
    const worksAt = new Map<string, { id: string; name: string; role: string | null }>();
    for (const l of links) {
      counts.set(l.companyId, (counts.get(l.companyId) ?? 0) + 1);
      // Primary-first ordering above means the first one seen is the one to name.
      if (!primary.has(l.companyId)) {
        primary.set(l.companyId, { id: l.person.id, name: l.person.name, role: l.role });
      }
      // Ordered primary-first above, so the first one seen is the one to show.
      if (!worksAt.has(l.personId)) {
        worksAt.set(l.personId, { id: l.company.id, name: l.company.name, role: l.role });
      }
    }

    return items.map((c) => ({
      ...c,
      contactCount: c.type === 'COMPANY' ? (counts.get(c.id as string) ?? 0) : 0,
      // Who to ring at this company — the name the row prints.
      primaryContact: c.type === 'COMPANY' ? primary.get(c.id as string) ?? null : null,
      contactOf: c.type === 'COMPANY' ? null : worksAt.get(c.id as string) ?? null,
    }));
  }

  /**
   * Load one client the caller is actually allowed to reach, or refuse.
   *
   * 404 rather than 403 when it exists but is out of scope — the rest of this
   * service is careful not to confirm which client ids exist, and a link
   * endpoint would otherwise be the one place that does.
   */
  protected async reachable(id: string, organizationId: string, reach: CrmReach, caller: CrmCaller | undefined) {
    const c = await this.prisma.customer.findFirst({
      where: { id, organizationId },
      select: {
        id: true, name: true, type: true, spaceId: true, isContact: true, contactName: true,
        ownerId: true, managerIds: true, isPortalResident: true,
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
  protected assertMayCreateIn(reach: CrmReach, spaceId: string | null) {
    if (crmCapsIn(reach, spaceId).create) return;
    const scope = crmCreateScope(reach);
    if (!scope.anywhere && !scope.spaceIds.length) throw new ForbiddenException('Not allowed to create clients');
    if (!spaceId) throw new BadRequestException({ message: 'Choose a workspace for this client.', code: 'CRM_WORKSPACE_REQUIRED' });
    throw new ForbiddenException({ message: 'Not allowed to add clients in this workspace.', code: 'CRM_WORKSPACE_NOT_ALLOWED' });
  }

  // ── CRM activity timeline ──────────────────────────────────────────────────

  protected async assertCustomer(customerId: string, organizationId: string) {
    const c = await this.prisma.customer.findFirst({ where: { id: customerId, organizationId }, select: { id: true } });
    if (!c) throw new NotFoundException('Customer not found');
  }

  /** Assert the caller may reach this client (owner/co-manager or view-all), and
   *  optionally that they may WORK it (change stage / add notes). Server-side. */
  protected async assertCrmReach(
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

  /** Keep only ids that are real users in THIS org — the shared helper, uncapped. */
  protected keepOrgUserIds(ids: string[], organizationId: string): Promise<string[]> {
    return keepOrgUserIds(this.prisma, ids, organizationId);
  }

  /** A customer's spaceId/portalId MUST belong to the same org — otherwise a
   *  staff user could point their customer at another org's space or portal
   *  (portal-config leak to their own app users). Validated on every write.
   *
   *  ⚠️ The space must also be LIVE. An archived one passed, which put the client
   *  in a list nobody opens — invisible everywhere, and reachable only by
   *  restoring a workspace whose connection to the missing client nothing
   *  states. */
  protected async assertRefsInOrg(dto: CustomerInput, organizationId: string) {
    if (dto.spaceId) {
      const s = await this.prisma.companyLocation.findFirst({ where: { id: dto.spaceId, organizationId, isActive: true }, select: { id: true } });
      if (!s) throw new BadRequestException('Invalid space for this organization');
    }
    if (dto.portalId) {
      const p = await this.prisma.portal.findFirst({ where: { id: dto.portalId, organizationId }, select: { id: true } });
      if (!p) throw new BadRequestException('Invalid portal for this organization');
    }
  }
}
