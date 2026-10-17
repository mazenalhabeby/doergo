import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { personName, DEFAULT_PORTAL_FEATURES, scopeWhereOn, type SpaceScopeIds } from '@hbcfield/shared';
import { PortalGuards } from './portal-guards.base';

/**
 * What every portal service shares beyond the checks: the shapes it returns, its
 * portal and resident reads, and the Apartments gate.
 */
@Injectable()
export abstract class PortalServiceBase extends PortalGuards {
  protected shapeConfig(portal: any, categories: any[]) {
    return {
      id: portal.id,
      name: portal.name,
      enabled: portal.isActive,
      templateKey: portal.templateKey,
      entityLabel: portal.entityLabel ?? 'Unit',
      contactLabel: portal.contactLabel ?? 'Support',
      accent: portal.accent ?? 'emerald',
      coverImageUrl: portal.coverImageUrl ?? null,
      spaceId: portal.spaceId ?? null,
      features: { ...DEFAULT_PORTAL_FEATURES, ...((portal.features as Record<string, boolean>) || {}) },
      categories,
    };
  }

  /** Create a portal bound to a space (a space can run several). Mirrors
   *  createPortal but stamps spaceId on the portal + its seeded categories. */
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
  protected async assertApartmentsModule(organizationId: string, spaceId: string) {
    const space = await this.prisma.companyLocation.findFirst({
      where: { id: spaceId, organizationId },
      select: { enabledModules: true, organization: { select: { enabledModules: true } } },
    });
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

  async getPortal(data: { id: string; organizationId: string; scopeSpaceIds?: SpaceScopeIds }) {
    const portal = await this.prisma.portal.findFirst({
      where: { id: data.id, organizationId: data.organizationId, ...scopeWhereOn('spaceId', data.scopeSpaceIds) },
    });
    if (!portal) throw new NotFoundException('Portal not found');
    const categories = await this.prisma.intakeCategory.findMany({
      where: { portalId: portal.id, isActive: true },
      orderBy: { position: 'asc' },
    });
    return this.shapeConfig(portal, categories);
  }

  /** Resolve residentUserId → member (staff resident) in one batched query. The
   *  id has no FK (removing a member never blocks), so we join it here. DRY: used
   *  by both getUnit and listSpaceUnits. */
  protected async withResidentUsers<T extends { residentUserId?: string | null }>(units: T[]) {
    const ids = Array.from(new Set(units.map((u) => u.residentUserId).filter(Boolean) as string[]));
    if (!ids.length) return units.map((u) => ({ ...u, residentUser: null }));
    const users = await this.prisma.user.findMany({
      where: { id: { in: ids } },
      select: { id: true, firstName: true, lastName: true, avatarUrl: true },
    });
    const byId = new Map(users.map((u) => [u.id, u]));
    return units.map((u) => ({ ...u, residentUser: u.residentUserId ? (byId.get(u.residentUserId) ?? null) : null }));
  }

  // ── Apartment activity timeline (notes + auto system events) ──

  protected logUnitActivity(data: {
    unitId: string;
    organizationId: string;
    type: string;
    body?: string;
    authorId?: string | null;
    metadata?: any;
  }) {
    return this.prisma.unitActivity
      .create({
        data: {
          organizationId: data.organizationId,
          unitId: data.unitId,
          type: data.type,
          body: data.body ?? null,
          authorId: data.authorId ?? null,
          metadata: data.metadata ?? undefined,
        },
      })
      .catch(() => undefined); // activity logging is best-effort, never blocks the write
  }

  /** Resolve a resident's display name (member or client) for a system log. */
  protected async residentDisplayName(
    residentUserId: string | null,
    customerId: string | null,
    organizationId: string,
  ): Promise<string | null> {
    if (residentUserId) {
      const u = await this.prisma.user.findFirst({
        where: { id: residentUserId, organizationId },
        select: { firstName: true, lastName: true },
      });
      return u ? personName(u) : null;
    }
    if (customerId) {
      const c = await this.prisma.customer.findFirst({
        where: { id: customerId, organizationId },
        select: { name: true },
      });
      return c?.name ?? null;
    }
    return null;
  }
}
