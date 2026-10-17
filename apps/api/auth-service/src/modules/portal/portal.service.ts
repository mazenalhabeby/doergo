import { Injectable, NotFoundException } from '@nestjs/common';
import {
  PORTAL_TEMPLATES,
  templateToIntakeCategories,
  DEFAULT_PORTAL_FEATURES,
  scopeWhereOn,
  type SpaceScopeIds,
} from '@hbcfield/shared';
import { configCache, cacheConfig } from './portal-helpers';
import { PortalServiceBase } from './portal-service.base';

/**
 * Customer-portal service. A Portal is a first-class entity (an org can run
 * several — Rental, Logistics, …); each owns its own type, categories and
 * residents. Office methods are org-scoped; the customer-facing config resolves
 * by the caller's own portal (via their Customer).
 */
@Injectable()
export class PortalService extends PortalServiceBase {
  // ── Portals (office) ──

  async listPortals(data: { organizationId: string; spaceId?: string; scopeSpaceIds?: SpaceScopeIds }) {
    const portals = await this.prisma.portal.findMany({
      where: {
        organizationId: data.organizationId,
        isActive: true,
        // Both can apply at once (a workspace tab asking for its own portals),
        // so the scope rides in an AND instead of fighting over `spaceId`.
        AND: [data.spaceId ? { spaceId: data.spaceId } : {}, scopeWhereOn('spaceId', data.scopeSpaceIds)],
      },
      orderBy: { createdAt: 'asc' },
    });
    if (portals.length === 0) return [];

    // Two grouped counts instead of 2 per portal (fixed 3 queries total).
    const ids = portals.map((p) => p.id);
    const [residentGroups, categoryGroups] = await Promise.all([
      this.prisma.customer.groupBy({
        by: ['portalId'],
        where: { portalId: { in: ids }, isPortalResident: true, isActive: true },
        _count: { _all: true },
      }),
      this.prisma.intakeCategory.groupBy({
        by: ['portalId'],
        where: { portalId: { in: ids }, isActive: true },
        _count: { _all: true },
      }),
    ]);
    const residentBy = new Map(residentGroups.map((g) => [g.portalId, g._count._all]));
    const categoryBy = new Map(categoryGroups.map((g) => [g.portalId, g._count._all]));
    return portals.map((p) => ({
      ...p,
      residentCount: residentBy.get(p.id) ?? 0,
      categoryCount: categoryBy.get(p.id) ?? 0,
    }));
  }

  // ── Per-space portal config + unit catalog (CRM "Portal" tab) ──────────────

  async updatePortal(data: {
    id: string;
    organizationId: string;
    name?: string;
    templateKey?: string;
    reseed?: boolean;
    coverImageUrl?: string | null;
    spaceId?: string | null;
    scopeSpaceIds?: SpaceScopeIds;
  }) {
    const portal = await this.prisma.portal.findFirst({
      where: { id: data.id, organizationId: data.organizationId, ...scopeWhereOn('spaceId', data.scopeSpaceIds) },
      select: { id: true, spaceId: true },
    });
    if (!portal) throw new NotFoundException('Portal not found');
    // A workspace-scoped manager may not carry the portal OUT of their reach —
    // into another workspace, or up to organization level (spaceId null), where
    // only the org-wide key reaches it. Same 404 as a portal they cannot see.
    if (data.spaceId !== undefined) this.assertSpaceRefInScope(data.scopeSpaceIds, data.spaceId);
    // Switching to the Apartment entity requires the space's Assets module.
    if (data.templateKey === 'rental' && portal.spaceId) {
      await this.assertApartmentsModule(data.organizationId, portal.spaceId);
    }

    // Validate the routing space belongs to this org (fk-less link, defence in depth).
    if (data.spaceId) {
      const space = await this.prisma.companyLocation.findFirst({
        where: { id: data.spaceId, organizationId: data.organizationId },
        select: { id: true },
      });
      if (!space) throw new NotFoundException('Space not found');
    }

    if (data.reseed && data.templateKey) {
      // Switch type: replace config + categories (office confirmed the reset).
      const template = PORTAL_TEMPLATES[data.templateKey] || PORTAL_TEMPLATES.rental;
      await this.prisma.$transaction([
        this.prisma.intakeCategory.deleteMany({ where: { portalId: portal.id } }),
        this.prisma.portal.update({
          where: { id: portal.id },
          data: {
            templateKey: template.key,
            entityLabel: template.entityLabel,
            contactLabel: template.contactLabel,
            accent: template.accent,
            features: template.features as unknown as object,
            ...(data.name !== undefined ? { name: data.name } : {}),
          },
        }),
        this.prisma.intakeCategory.createMany({
          data: templateToIntakeCategories(template).map((r) => ({
            ...r,
            organizationId: data.organizationId,
            portalId: portal.id,
          })),
        }),
      ]);
    } else {
      await this.prisma.portal.update({
        where: { id: portal.id },
        data: {
          ...(data.name !== undefined ? { name: data.name } : {}),
          ...(data.coverImageUrl !== undefined ? { coverImageUrl: data.coverImageUrl } : {}),
          ...(data.spaceId !== undefined ? { spaceId: data.spaceId } : {}),
        },
      });
    }
    configCache.delete(portal.id);
    return this.getPortal({ id: portal.id, organizationId: data.organizationId });
  }

  async deletePortal(data: { id: string; organizationId: string; scopeSpaceIds?: SpaceScopeIds }) {
    const portal = await this.prisma.portal.findFirst({
      where: { id: data.id, organizationId: data.organizationId, ...scopeWhereOn('spaceId', data.scopeSpaceIds) },
      select: { id: true },
    });
    if (!portal) throw new NotFoundException('Portal not found');
    // Cascades categories; residents/units get portalId SET NULL (history kept).
    await this.prisma.portal.delete({ where: { id: data.id } });
    configCache.delete(data.id);
    return { success: true };
  }

  // ── Config for the mobile customer (resolve THEIR portal) ──

  async getConfigForCustomer(data: { customerId: string }) {
    const disabled = {
      name: null,
      enabled: false,
      entityLabel: 'Unit',
      contactLabel: 'Support',
      accent: 'emerald',
      coverImageUrl: null,
      spaceId: null,
      features: DEFAULT_PORTAL_FEATURES,
      categories: [] as unknown[],
    };
    const customer = await this.prisma.customer.findUnique({
      where: { id: data.customerId },
      select: { portalId: true },
    });
    if (!customer?.portalId) return disabled;

    const cached = configCache.get(customer.portalId);
    if (cached && cached.exp > Date.now()) return cached.data;

    const portal = await this.prisma.portal.findUnique({ where: { id: customer.portalId } });
    if (!portal || !portal.isActive) return disabled;
    const categories = await this.prisma.intakeCategory.findMany({
      where: { portalId: portal.id, isActive: true },
      orderBy: { position: 'asc' },
    });
    const result = this.shapeConfig(portal, categories);
    cacheConfig(customer.portalId, result);
    return result;
  }
}
