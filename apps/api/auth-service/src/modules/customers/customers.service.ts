import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import {
  crmCapsIn,
  crmCapsAnywhere,
  crmCreateScope,
  crmSpacesWhere,
  PrismaService,
  type CrmReach,
} from '@hbcfield/shared';
import { notFound, CrmCaller, customerSelect } from './customers-helpers';
import { CrmReachService } from './crm-reach.service';

export { type CrmCaller, type CustomerDetail, type CustomerInput, withContactKeys } from './customers-helpers';

@Injectable()
export class CustomersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly reach: CrmReachService,
  ) {}

  /** List an org's customers (search + active filter + pagination). */
  async list(data: {
    organizationId: string;
    search?: string;
    status?: 'active' | 'inactive' | 'all';
    portalResident?: boolean; // true = B2C residents only; false = B2B customers only
    portalId?: string; // residents in a specific portal
    spaceId?: string; // a space's Customers list (CRM)
    includeUnfiled?: boolean; // ...plus clients belonging to no workspace
    /*
      Contact people are clients of nobody.

      They exist because they work somewhere you deal with, so by DEFAULT they
      are not in the client list — a firm with six contacts would otherwise turn
      one client into seven rows and bury the pipeline. 'only' is the Contacts
      segment; 'all' is search, which should find a person wherever they live.
    */
    contacts?: 'exclude' | 'only' | 'all';
    /** PERSON | COMPANY — the two kinds of client the CRM holds. */
    type?: string;
    page?: number;
    limit?: number;
    caller?: CrmCaller;
  }) {
    const page = Math.max(data.page || 1, 1);
    const limit = Math.min(Math.max(data.limit || 20, 1), 100);
    const isPortalPath = data.portalResident === true || !!data.portalId;
    const reach = await this.reach.crmReachFor(data.caller, data.organizationId);
    const and: Record<string, unknown>[] = [];
    /*
      Portal-resident management is a manager surface (not CRM rep scope):
      org-wide manage sees every resident, a workspace's manage only that
      workspace's. Everything else is the CRM reach — org-wide, or the
      workspaces where the member holds a CRM grant, and nothing past them.
    */
    if (isPortalPath) {
      if (!reach.org.manage) {
        const manageSpaces = crmSpacesWhere(reach, (c) => c.manage);
        if (!manageSpaces.length) throw new ForbiddenException('Not allowed to manage portal residents');
        and.push({ spaceId: { in: manageSpaces } });
      }
    } else {
      if (!crmCapsAnywhere(reach).canAccess) throw new ForbiddenException('No CRM access');
      and.push(this.reach.reachableWhere(reach, data.caller));
    }
    const where: Record<string, unknown> = { organizationId: data.organizationId };
    if (data.status === 'active' || !data.status) where.isActive = true;
    else if (data.status === 'inactive') where.isActive = false;
    if (typeof data.portalResident === 'boolean') where.isPortalResident = data.portalResident;
    if (data.portalId) where.portalId = data.portalId;
    /*
      A workspace's clients, optionally including the ones filed nowhere.

      `spaceId` alone is an exact match, which is right for the workspace's own
      Customers tab. It is wrong for anything OFFERING clients to work on: a
      client may legitimately belong to no workspace — the CRM has an "All" tab
      for exactly those — and in a real book most of them do. Scoping strictly
      there means the clients nobody filed can never be picked, and nothing on
      the screen explains why.

      One OR rather than a second round trip, and both sides are indexed.
    */
    if (data.spaceId && data.includeUnfiled) {
      and.push({ OR: [{ spaceId: data.spaceId }, { spaceId: null }] });
    } else if (data.spaceId) {
      where.spaceId = data.spaceId;
    }
    /*
      People and companies, told apart.

      Filtered in the QUERY and not after it: a page of 100 filtered down to the
      twelve companies in it is a page that looks nearly empty and a total that
      lies about how many there are.
    */
    if (data.type === 'PERSON' || data.type === 'COMPANY') where.type = data.type;
    // Indexed boolean on the same table — a filter, not a second query.
    if (!isPortalPath) {
      if (data.contacts === 'only') where.isContact = true;
      else if (data.contacts !== 'all') where.isContact = false;
    }
    if (data.search) {
      and.push({
        OR: [
          { name: { contains: data.search, mode: 'insensitive' } },
          { contactName: { contains: data.search, mode: 'insensitive' } },
          { email: { contains: data.search, mode: 'insensitive' } },
        ],
      });
    }
    if (and.length) where.AND = and;
    const [items, total] = await Promise.all([
      this.prisma.customer.findMany({
        where,
        select: customerSelect,
        orderBy: [{ name: 'asc' }],
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.customer.count({ where }),
    ]);
    /*
      "3 contact people" on a company row, "at AGRU America" on a person row.

      ONE query for the whole page, both directions at once, keyed on the ids
      that came back — never one query per row. The subtitle those two facts feed
      is already being rendered; this only gives it something true to say.
    */
    const withContacts = await this.decorateContacts(items as Array<Record<string, unknown>>, data.organizationId);

    // Surface the caller's resolved CRM abilities so the UI can hide/disable
    // actions it isn't allowed to take (the server still enforces regardless):
    // the workspace's when the list is one workspace's, else the widest held
    // anywhere — and where adding a client is allowed, so a form can ask for a
    // workspace when only some are open to the member.
    const crmCaps = data.spaceId ? crmCapsIn(reach, data.spaceId) : crmCapsAnywhere(reach);
    return {
      data: withContacts,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit), crmCaps, crmCreate: crmCreateScope(reach) },
    };
  }

  async get(id: string, organizationId: string, caller?: CrmCaller) {
    const customer = await this.prisma.customer.findFirst({
      where: { id, organizationId },
      select: customerSelect,
    });
    if (!customer) throw new NotFoundException('Customer not found');

    // CRM access enforcement (server-authoritative). Portal residents are a
    // manager surface; CRM clients are reachable by owner/co-manager or view-all.
    // Decided by the workspace the client is filed in (org ∪ that workspace).
    // 404 (not 403) when out of reach, so a member can't probe which ids exist.
    const reach = await this.reach.crmReachFor(caller, organizationId);
    const caps = customer.isPortalResident
      ? this.reach.assertManage(reach, customer, caller)
      : this.reach.capsOn(reach, customer, caller);

    // App-access status. `isPortalResident` only means "invited"; a CUSTOMER
    // User bound to this customer is proof they ACCEPTED and can log in. Also
    // resolve the entity (portal label) they belong to.
    const [login, portal] = await Promise.all([
      this.prisma.user.findFirst({
        where: { customerId: id, organizationId, role: 'CUSTOMER' as const },
        select: { id: true, isActive: true },
      }),
      customer.portalId
        ? this.prisma.portal.findFirst({
            where: { id: customer.portalId, organizationId },
            select: { name: true, entityLabel: true },
          })
        : Promise.resolve(null),
    ]);

    return {
      data: {
        ...customer,
        app: {
          invited: customer.isPortalResident, // access granted (invite sent)
          accepted: !!login, // signed up → has a login
          active: !!login?.isActive, // login not revoked
          portalName: portal?.name ?? null,
          entityLabel: portal?.entityLabel ?? null, // Apartment / Order / Workspace…
        },
        // Caller's CRM abilities on THIS record — lets the detail UI hide actions
        // it can't take (the server still enforces every one of them).
        crmCaps: caps,
      },
    };
  }

  /** Soft-delete (deactivate) — preserves history on tasks/reports. */
  async remove(id: string, organizationId: string, caller?: CrmCaller) {
    // Deleting/archiving a client is a manage-level action.
    // Manage where the client is filed; out of reach is a 404 like every other door.
    const existing = await this.prisma.customer.findFirst({
      where: { id, organizationId },
      select: { id: true, spaceId: true, ownerId: true, managerIds: true },
    });
    if (!existing) throw notFound();
    const reach = await this.reach.crmReachFor(caller, organizationId);
    this.reach.assertManage(reach, existing, caller, 'Not allowed to delete clients');
    // Grab the portal login ids first so the gateway can bust their cached tokens
    // (instant revocation, not just at the 60s cache TTL).
    const portalUsers = await this.prisma.user.findMany({ where: { customerId: id }, select: { id: true } });
    await this.prisma.$transaction([
      this.prisma.customer.update({ where: { id }, data: { isActive: false } }),
      // Revoke portal access: deactivate the customer's login accounts so the
      // existing User.isActive gate (login + validateToken) locks them out.
      this.prisma.user.updateMany({ where: { customerId: id }, data: { isActive: false } }),
    ]);
    return { success: true, deactivatedUserIds: portalUsers.map((u) => u.id) };
  }

  /** Where the caller may work the client book (see CrmReachService). Public: the contacts import and the portal ask it. */
  crmReachFor(caller: CrmCaller | undefined, organizationId: string): Promise<CrmReach> {
    return this.reach.crmReachFor(caller, organizationId);
  }

  /** `crmReachesClientIn` for a caller — all-scope where it is filed, or owns / co-manages it there. */
  canReach(
    reach: CrmReach,
    client: { spaceId?: string | null; ownerId?: string | null; managerIds?: string[] },
    caller: CrmCaller | undefined,
  ): boolean {
    return this.reach.canReach(reach, client, caller);
  }

  /** `canReach` as a `where` — one rule, so a list and a single-record check cannot disagree. */
  reachableWhere(reach: CrmReach, caller: CrmCaller | undefined): Record<string, unknown> {
    return this.reach.reachableWhere(reach, caller);
  }

  /**
   * Add each row's contact relationships, in one query for the whole page.
   *
   * A company gets a count ("3 contact people"); a person gets the company they
   * contact, primary first. Both come out of the same read — the ids are already
   * in hand, and asking twice, or once per row, would be work for a subtitle.
   */
  private async decorateContacts(items: Array<Record<string, unknown>>, organizationId: string) {
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
        companyId: true,
        personId: true,
        isPrimary: true,
        role: true,
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
      primaryContact: c.type === 'COMPANY' ? (primary.get(c.id as string) ?? null) : null,
      contactOf: c.type === 'COMPANY' ? null : (worksAt.get(c.id as string) ?? null),
    }));
  }
}
