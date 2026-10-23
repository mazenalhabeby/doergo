import { Injectable, NotFoundException, ForbiddenException, BadRequestException } from '@nestjs/common';
import {
  PrismaService,
  workspaceInOrg,
  workspaceModulesWithOrg,
  scopeWhereOn,
  type SpaceScopeIds,
  crmCapsIn,
} from '@hbcfield/shared';
import { CustomersService, type CrmCaller } from '../customers/customers.service';
import { assertSpaceRefInScope, unitScope } from './portal-scope';

/**
 * The checks every portal write asks: each reference is this organization's and
 * inside the caller's workspaces, a client's addresses are the caller's to edit,
 * and the Apartments gate.
 *
 * The org checks say an id is OURS; the scope checks say it is in a workspace the
 * CALLER runs (see portal-scope). Every refusal is the same 404 a missing record
 * gets.
 */
@Injectable()
export class PortalReachService {
  constructor(
    private readonly prisma: PrismaService,
    // The CRM's own reach rule (caps + owner/co-manager), reused — never re-derived.
    private readonly customers: CustomersService,
  ) {}

  async assertCustomerInOrg(organizationId: string, customerId?: string | null) {
    if (!customerId) return;
    const c = await this.prisma.customer.findFirst({
      where: { id: customerId, organizationId },
      select: { id: true, portalId: true },
    });
    if (!c) throw new NotFoundException('Customer not found in this organization');
    return c;
  }

  /**
   * Every reference a unit write names must belong to the caller's organization.
   *
   * ⚠️ The ids arrive from a request body. `customerId` was checked; `spaceId` and
   * `portalId` were written as given, so a unit could be filed into ANOTHER
   * organization's workspace or portal — and that organization's screens, which
   * list units by space/portal, would then show it. 404 for all three, so the
   * refusal confirms nothing about ids outside the tenant.
   */
  async assertUnitRefsInOrg(organizationId: string, refs: { spaceId?: string | null; portalId?: string | null }) {
    if (refs.spaceId) {
      const space = await workspaceInOrg(this.prisma, refs.spaceId, organizationId);
      if (!space) throw new NotFoundException('Space not found');
    }
    if (refs.portalId) {
      const portal = await this.prisma.portal.findFirst({
        where: { id: refs.portalId, organizationId },
        select: { id: true },
      });
      if (!portal) throw new NotFoundException('Portal not found');
    }
  }

  /**
   * Every relation a unit write names must be in the caller's reach.
   *
   * ⚠️ `anchor`: on create, a scoped caller must file the unit SOMEWHERE they
   * run (a workspace or a portal in one). A unit with neither is reachable only
   * org-wide — creating one would put a record where its own author can never
   * see it again.
   */
  async assertUnitRefsInScope(
    organizationId: string,
    scope: SpaceScopeIds,
    refs: { spaceId?: string | null; portalId?: string | null; customerId?: string | null },
    opts: { anchor?: boolean } = {},
  ) {
    if (scope === undefined || scope === null) return;
    assertSpaceRefInScope(scope, refs.spaceId);
    if (refs.portalId !== undefined) {
      const portal = refs.portalId
        ? await this.prisma.portal.findFirst({
            where: { id: refs.portalId, organizationId, spaceId: { in: scope } },
            select: { id: true },
          })
        : null;
      if (!portal) throw new NotFoundException('Portal not found');
    }
    if (refs.customerId) await this.assertCustomerInScope(organizationId, scope, refs.customerId);
    if (opts.anchor && !refs.spaceId && !refs.portalId) throw new NotFoundException('Space not found');
  }

  /** A client is in reach when filed in, or a resident of a portal in, a workspace the caller runs. */
  async assertCustomerInScope(organizationId: string, scope: SpaceScopeIds, customerId: string) {
    if (scope === undefined || scope === null) return;
    const c = await this.prisma.customer.findFirst({
      where: {
        id: customerId,
        organizationId,
        OR: [{ spaceId: { in: scope } }, { portal: { spaceId: { in: scope } } }],
      },
      select: { id: true },
    });
    if (!c) throw new NotFoundException('Customer not found');
  }

  /**
   * The gateway's question before it calls ANOTHER module on a portal's behalf
   * (the CRM to create or promote a resident, invitations to send or re-send a
   * code): is this portal, client or unit inside the caller's reach?
   *
   *   portalId    the portal must sit in a workspace in scope
   *   customerId  with a portal: a client of that portal's workspace (the same
   *               set `listAssignableCustomersForPortal` offers) or already its
   *               resident; alone: a resident of a portal in scope
   *   unitId      the unit must be in reach (`unitScope`)
   *
   * Org-wide callers pass no scope and only the organization is checked.
   */
  async assertPortalReach(data: {
    organizationId: string;
    scopeSpaceIds?: SpaceScopeIds;
    portalId?: string;
    customerId?: string;
    unitId?: string;
  }) {
    const scope = data.scopeSpaceIds;
    let portal: { id: string; spaceId: string | null } | null = null;
    if (data.portalId) {
      portal = await this.prisma.portal.findFirst({
        where: { id: data.portalId, organizationId: data.organizationId, ...scopeWhereOn('spaceId', scope) },
        select: { id: true, spaceId: true },
      });
      if (!portal) throw new NotFoundException('Portal not found');
    }
    if (data.customerId) {
      const reach =
        scope === undefined || scope === null
          ? {}
          : portal
            ? { OR: [{ portalId: portal.id }, ...(portal.spaceId ? [{ spaceId: portal.spaceId }] : [])] }
            : { portal: { spaceId: { in: scope } } };
      const c = await this.prisma.customer.findFirst({
        where: { id: data.customerId, organizationId: data.organizationId, ...reach },
        select: { id: true },
      });
      if (!c) throw new NotFoundException('Customer not found');
    }
    if (data.unitId) {
      const u = await this.prisma.customerUnit.findFirst({
        where: { id: data.unitId, organizationId: data.organizationId, ...unitScope(scope) },
        select: { id: true },
      });
      if (!u) throw new NotFoundException('Unit not found');
    }
    return { data: { portalId: portal?.id ?? null, spaceId: portal?.spaceId ?? null } };
  }

  /**
   * A CRM caller may change this client's addresses — the same rule a CRM write
   * of the client's info obeys (`customers.service.update`): reach the record
   * (view-all, or own / co-manage it) AND hold editInfo (or manage). A portal
   * resident is manage-only, as everywhere else in the CRM.
   *
   * ⚠️ Only the CRM address routes pass `crmCaller`. Before this they checked
   * `crmEditInfo` alone in the gateway, so a rep scoped to their OWN clients
   * could edit, re-primary or delete the address of anybody's client by id.
   * 404 when out of reach, like the rest of the CRM — never confirm the id.
   */
  async assertClientAddressesEditable(organizationId: string, customerId: string, caller: CrmCaller) {
    const c = await this.prisma.customer.findFirst({
      where: { id: customerId, organizationId },
      select: { id: true, spaceId: true, ownerId: true, managerIds: true, isPortalResident: true },
    });
    if (!c) throw new NotFoundException('Customer not found');
    // Decided by the workspace the client is filed in (org ∪ that workspace's CRM grant).
    const reach = await this.customers.crmReachFor(caller, organizationId);
    const caps = crmCapsIn(reach, c.spaceId);
    const reachable = caps.canAccess && this.customers.canReach(reach, c, caller);
    if (c.isPortalResident) {
      if (caps.manage) return;
      if (!reachable) throw new NotFoundException('Customer not found');
      throw new ForbiddenException('Not allowed');
    }
    if (!reachable) throw new NotFoundException('Customer not found');
    if (!(caps.editInfo || caps.manage)) throw new ForbiddenException('Not allowed to edit client info');
  }

  /**
   * The Apartment (rental) entity needs somewhere for its apartments to live,
   * and since the migration that is ASSETS: a `CustomerUnit` became an Asset of
   * an "Apartments" kind in the same space, and everything pointing at the unit
   * was re-pointed at the asset.
   *
   * ⚠️ This asked for a module called `apartments`, which no longer exists —
   * it is not in AVAILABLE_MODULES and no space can have it switched on. So the
   * check could not pass for anybody: creating or switching a portal to the
   * Apartment entity failed with "Enable the Apartments module for this space",
   * naming a module the product had already removed. A gate that outlives the
   * thing it gates does not fail open, it fails permanently.
   */
  async assertApartmentsModule(organizationId: string, spaceId: string) {
    const space = await workspaceModulesWithOrg(this.prisma, spaceId, organizationId);
    // A space's own list wins; an absent one means the space has never been
    // configured and inherits the organization's — the same precedence every
    // other module gate here applies.
    const effective =
      (space?.enabledModules as string[] | null) ?? (space?.organization?.enabledModules as string[] | null) ?? [];
    if (!effective.includes('assets')) {
      throw new BadRequestException(
        'Switch on the Assets module for this workspace before using the ' +
          'Apartment entity — that is where apartments live.',
      );
    }
  }
}
