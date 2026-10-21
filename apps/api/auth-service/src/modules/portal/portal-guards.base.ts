import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '@hbcfield/shared';
import { keepOrgUserIds } from '../../common/records/org-user-ids';
import { CustomersService, type CrmCaller } from '../customers/customers.service';
import { scopeWhereOn, scopeAllows, type SpaceScopeIds, crmCapsIn } from '@hbcfield/shared';

/**
 * The checks every portal write asks: each reference is this organization's and
 * inside the caller's workspaces, and a client's addresses are the caller's to
 * edit.
 */
@Injectable()
export abstract class PortalGuards {
  constructor(
    protected readonly prisma: PrismaService,
    // The CRM's own reach rule (caps + owner/co-manager), reused — never re-derived.
    protected readonly customers: CustomersService,
  ) {}

  // ── Units ──

  /** A single unit (apartment) with its resident — for the apartment detail page. */
  /**
   * Narrow a unit lookup to the spaces the caller holds.
   *
   * A unit has no space column of its own — it reaches one through its client
   * (`Customer.spaceId`) or through its portal (`Portal.spaceId`). Either link
   * is enough, so the filter is an OR across both.
   *
   * undefined = org-wide (adds nothing). `[]` = granted nowhere and matches
   * nothing — written out rather than left to a truthiness check, because
   * collapsing it into "org-wide" is the failure this whole scoping exists to
   * prevent. A unit attached to neither a client nor a portal is unreachable
   * for a scoped caller, which is the safe answer: nothing ties it to a site
   * they run.
   */
  protected unitScope(scopeSpaceIds?: SpaceScopeIds): Record<string, unknown> {
    if (scopeSpaceIds === undefined || scopeSpaceIds === null) return {};
    return {
      OR: [
        // The unit's own workspace — the catalog a workspace's Units tab lists
        // (`listSpaceUnits` reads exactly this column). Without it a unit filed
        // in the workspace but not yet given a client or a portal was out of
        // reach of the very people who run that workspace.
        { spaceId: { in: scopeSpaceIds } },
        { customer: { spaceId: { in: scopeSpaceIds } } },
        { portal: { spaceId: { in: scopeSpaceIds } } },
      ],
    };
  }

  protected async assertCustomerInOrg(organizationId: string, customerId?: string | null) {
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
  protected async assertUnitRefsInOrg(
    organizationId: string,
    refs: { spaceId?: string | null; portalId?: string | null },
  ) {
    if (refs.spaceId) {
      const space = await this.prisma.companyLocation.findFirst({ where: { id: refs.spaceId, organizationId }, select: { id: true } });
      if (!space) throw new NotFoundException('Space not found');
    }
    if (refs.portalId) {
      const portal = await this.prisma.portal.findFirst({ where: { id: refs.portalId, organizationId }, select: { id: true } });
      if (!portal) throw new NotFoundException('Portal not found');
    }
  }

  // ── Workspace reach for portal writes ──────────────────────────────────────
  //
  // `scopeSpaceIds` is the list of workspaces in which the caller holds the
  // portal key the route asks for (undefined/null = org-wide, [] = nowhere).
  // The org check above says an id is OURS; these say it is in a workspace the
  // CALLER runs. Every refusal is the same 404 a missing record gets, so a
  // workspace-scoped manager learns nothing about the workspaces beside theirs.

  /** A workspace a write names (a target, not the record's own) must be in reach. */
  protected assertSpaceRefInScope(scope: SpaceScopeIds, spaceId: string | null | undefined) {
    if (spaceId === undefined) return;
    // null = "organization level": reachable with the org-wide key only.
    if (!scopeAllows(scope, spaceId)) throw new NotFoundException('Space not found');
  }

  /**
   * Every relation a unit write names must be in the caller's reach.
   *
   * ⚠️ `anchor`: on create, a scoped caller must file the unit SOMEWHERE they
   * run (a workspace or a portal in one). A unit with neither is reachable only
   * org-wide — creating one would put a record where its own author can never
   * see it again.
   */
  protected async assertUnitRefsInScope(
    organizationId: string,
    scope: SpaceScopeIds,
    refs: { spaceId?: string | null; portalId?: string | null; customerId?: string | null },
    opts: { anchor?: boolean } = {},
  ) {
    if (scope === undefined || scope === null) return;
    this.assertSpaceRefInScope(scope, refs.spaceId);
    if (refs.portalId !== undefined) {
      const portal = refs.portalId
        ? await this.prisma.portal.findFirst({ where: { id: refs.portalId, organizationId, spaceId: { in: scope } }, select: { id: true } })
        : null;
      if (!portal) throw new NotFoundException('Portal not found');
    }
    if (refs.customerId) await this.assertCustomerInScope(organizationId, scope, refs.customerId);
    if (opts.anchor && !refs.spaceId && !refs.portalId) throw new NotFoundException('Space not found');
  }

  /** A client is in reach when filed in, or a resident of a portal in, a workspace the caller runs. */
  protected async assertCustomerInScope(organizationId: string, scope: SpaceScopeIds, customerId: string) {
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
        where: { id: data.unitId, organizationId: data.organizationId, ...this.unitScope(scope) },
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

  /** One home per member per space: when a member is set as an apartment's
   *  resident, clear them from every OTHER unit in the same space so a member
   *  never appears to live in two apartments at once. Single source of truth,
   *  called from createUnit / updateUnit / setMemberApartment. */
  protected async clearMemberElsewhere(
    userId: string,
    spaceId: string | null | undefined,
    organizationId: string,
    exceptUnitId?: string,
  ) {
    if (!userId || !spaceId) return;
    await this.prisma.customerUnit.updateMany({
      where: { organizationId, spaceId, residentUserId: userId, ...(exceptUnitId ? { id: { not: exceptUnitId } } : {}) },
      data: { residentUserId: null },
    });
  }

  /** Keep only ids that are real users in this org — the shared helper, capped at 20. */
  protected keepOrgUserIds(ids: string[], organizationId: string): Promise<string[]> {
    return keepOrgUserIds(this.prisma, ids, organizationId, { cap: 20 });
  }

  /** A category is in reach through its PORTAL's workspace (not its routing space). */
  protected categoryScope(scope: SpaceScopeIds): Record<string, unknown> {
    if (scope === undefined || scope === null) return {};
    return { portal: { spaceId: { in: scope } } };
  }
}
