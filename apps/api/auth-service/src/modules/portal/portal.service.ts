import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import {
  PORTAL_TEMPLATES,
  templateToIntakeCategories,
  DEFAULT_PORTAL_FEATURES,
} from '@hbcfield/shared';

// Per-portal TTL cache for the intake config (read on every customer submit +
// GET config, which the mobile fans out across screens). Keyed by portalId.
const CONFIG_TTL_MS = 30_000;
const CONFIG_CACHE_MAX = 1000; // bound memory: sweep expired, then hard-cap
const configCache = new Map<string, { data: unknown; exp: number }>();

function cacheConfig(portalId: string, data: unknown) {
  // Memory hygiene: when the map grows past the cap, drop expired entries first,
  // then evict oldest insertions until under cap (Map preserves insertion order).
  if (configCache.size >= CONFIG_CACHE_MAX) {
    const now = Date.now();
    for (const [k, v] of configCache) if (v.exp <= now) configCache.delete(k);
    while (configCache.size >= CONFIG_CACHE_MAX) {
      const oldest = configCache.keys().next().value;
      if (oldest === undefined) break;
      configCache.delete(oldest);
    }
  }
  configCache.set(portalId, { data, exp: Date.now() + CONFIG_TTL_MS });
}

/**
 * Customer-portal service. A Portal is a first-class entity (an org can run
 * several — Rental, Logistics, …); each owns its own type, categories and
 * residents. Office methods are org-scoped; the customer-facing config resolves
 * by the caller's own portal (via their Customer).
 */
@Injectable()
export class PortalService {
  constructor(private readonly prisma: PrismaService) {}

  private shapeConfig(portal: any, categories: any[]) {
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

  // ── Portals (office) ──

  async listPortals(data: { organizationId: string }) {
    const portals = await this.prisma.portal.findMany({
      where: { organizationId: data.organizationId, isActive: true },
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

  async createPortal(data: { organizationId: string; templateKey?: string; name?: string }) {
    const template = PORTAL_TEMPLATES[data.templateKey || 'rental'] || PORTAL_TEMPLATES.rental;
    const portal = await this.prisma.portal.create({
      data: {
        organizationId: data.organizationId,
        name: data.name?.trim() || template.vertical,
        templateKey: template.key,
        entityLabel: template.entityLabel,
        contactLabel: template.contactLabel,
        accent: template.accent,
        features: template.features as unknown as object,
      },
    });
    await this.prisma.intakeCategory.createMany({
      data: templateToIntakeCategories(template).map((r) => ({
        ...r,
        organizationId: data.organizationId,
        portalId: portal.id,
      })),
    });
    // Org flag = "has at least one portal" (kept for guards/back-compat).
    await this.prisma.organization.update({
      where: { id: data.organizationId },
      data: { customerPortalEnabled: true },
    });
    return this.getPortal({ id: portal.id, organizationId: data.organizationId });
  }

  async getPortal(data: { id: string; organizationId: string }) {
    const portal = await this.prisma.portal.findFirst({
      where: { id: data.id, organizationId: data.organizationId },
    });
    if (!portal) throw new NotFoundException('Portal not found');
    const categories = await this.prisma.intakeCategory.findMany({
      where: { portalId: portal.id, isActive: true },
      orderBy: { position: 'asc' },
    });
    return this.shapeConfig(portal, categories);
  }

  async updatePortal(data: {
    id: string;
    organizationId: string;
    name?: string;
    templateKey?: string;
    reseed?: boolean;
    coverImageUrl?: string | null;
    spaceId?: string | null;
  }) {
    const portal = await this.prisma.portal.findFirst({
      where: { id: data.id, organizationId: data.organizationId },
      select: { id: true },
    });
    if (!portal) throw new NotFoundException('Portal not found');

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

  async deletePortal(data: { id: string; organizationId: string }) {
    const portal = await this.prisma.portal.findFirst({
      where: { id: data.id, organizationId: data.organizationId },
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

  // ── Units ──

  /** Units a specific customer is bound to (customer-scoped). */
  async listCustomerUnits(data: { organizationId: string; customerId: string }) {
    return this.prisma.customerUnit.findMany({
      where: { organizationId: data.organizationId, customerId: data.customerId, isActive: true },
      orderBy: { createdAt: 'asc' },
    });
  }

  async listUnits(data: { organizationId: string; customerId?: string }) {
    return this.prisma.customerUnit.findMany({
      where: {
        organizationId: data.organizationId,
        isActive: true,
        ...(data.customerId ? { customerId: data.customerId } : {}),
      },
      orderBy: { createdAt: 'asc' },
    });
  }

  private async assertCustomerInOrg(organizationId: string, customerId?: string | null) {
    if (!customerId) return;
    const c = await this.prisma.customer.findFirst({
      where: { id: customerId, organizationId },
      select: { id: true, portalId: true },
    });
    if (!c) throw new NotFoundException('Customer not found in this organization');
    return c;
  }

  async createUnit(data: {
    organizationId: string;
    customerId?: string;
    portalId?: string;
    name: string;
    label?: string;
    address?: string;
    spaceId?: string;
  }) {
    const c = await this.assertCustomerInOrg(data.organizationId, data.customerId);
    return this.prisma.customerUnit.create({
      data: {
        organizationId: data.organizationId,
        customerId: data.customerId || null,
        // Inherit the portal from the customer if not passed explicitly.
        portalId: data.portalId || c?.portalId || null,
        name: data.name,
        label: data.label || null,
        address: data.address || null,
        spaceId: data.spaceId || null,
      },
    });
  }

  async updateUnit(data: {
    id: string;
    organizationId: string;
    name?: string;
    label?: string | null;
    address?: string | null;
    spaceId?: string | null;
    customerId?: string | null;
  }) {
    const existing = await this.prisma.customerUnit.findFirst({
      where: { id: data.id, organizationId: data.organizationId },
      select: { id: true },
    });
    if (!existing) throw new NotFoundException('Unit not found');
    await this.assertCustomerInOrg(data.organizationId, data.customerId);
    return this.prisma.customerUnit.update({
      where: { id: data.id },
      data: {
        ...(data.name !== undefined ? { name: data.name } : {}),
        ...(data.label !== undefined ? { label: data.label } : {}),
        ...(data.address !== undefined ? { address: data.address } : {}),
        ...(data.spaceId !== undefined ? { spaceId: data.spaceId } : {}),
        ...(data.customerId !== undefined ? { customerId: data.customerId } : {}),
      },
    });
  }

  async deleteUnit(data: { id: string; organizationId: string }) {
    const existing = await this.prisma.customerUnit.findFirst({
      where: { id: data.id, organizationId: data.organizationId },
      select: { id: true },
    });
    if (!existing) throw new NotFoundException('Unit not found');
    await this.prisma.customerUnit.update({ where: { id: data.id }, data: { isActive: false } });
    return { success: true };
  }

  // ── Intake category editor (per portal) ──

  async createCategory(data: {
    organizationId: string;
    portalId: string;
    key: string;
    label: string;
    icon?: string;
    color?: string;
    urgent?: boolean;
    team?: string;
    defaultPriority?: string;
    issues?: string[];
    position?: number;
    spaceId?: string;
  }) {
    const portal = await this.prisma.portal.findFirst({
      where: { id: data.portalId, organizationId: data.organizationId },
      select: { id: true },
    });
    if (!portal) throw new NotFoundException('Portal not found');
    const cat = await this.prisma.intakeCategory.create({
      data: {
        organizationId: data.organizationId,
        portalId: data.portalId,
        key: data.key,
        label: data.label,
        icon: data.icon ?? null,
        color: data.color ?? null,
        urgent: data.urgent ?? false,
        team: data.team ?? null,
        defaultPriority: data.defaultPriority ?? null,
        issues: data.issues ?? [],
        position: data.position ?? 0,
        spaceId: data.spaceId ?? null,
      },
    });
    configCache.delete(data.portalId);
    return cat;
  }

  async updateCategory(data: {
    id: string;
    organizationId: string;
    label?: string;
    icon?: string | null;
    color?: string | null;
    urgent?: boolean;
    team?: string | null;
    defaultPriority?: string | null;
    issues?: string[];
    isActive?: boolean;
    spaceId?: string | null;
  }) {
    const existing = await this.prisma.intakeCategory.findFirst({
      where: { id: data.id, organizationId: data.organizationId },
      select: { id: true, portalId: true },
    });
    if (!existing) throw new NotFoundException('Category not found');
    // Validate the target space belongs to this org (defence in depth — the
    // onDelete:SetNull relation already guards deletions).
    if (data.spaceId) {
      const space = await this.prisma.companyLocation.findFirst({
        where: { id: data.spaceId, organizationId: data.organizationId },
        select: { id: true },
      });
      if (!space) throw new NotFoundException('Space not found');
    }
    const cat = await this.prisma.intakeCategory.update({
      where: { id: data.id },
      data: {
        ...(data.label !== undefined ? { label: data.label } : {}),
        ...(data.icon !== undefined ? { icon: data.icon } : {}),
        ...(data.color !== undefined ? { color: data.color } : {}),
        ...(data.urgent !== undefined ? { urgent: data.urgent } : {}),
        ...(data.team !== undefined ? { team: data.team } : {}),
        ...(data.defaultPriority !== undefined ? { defaultPriority: data.defaultPriority } : {}),
        ...(data.issues !== undefined ? { issues: data.issues } : {}),
        ...(data.isActive !== undefined ? { isActive: data.isActive } : {}),
        ...(data.spaceId !== undefined ? { spaceId: data.spaceId } : {}),
      },
    });
    if (existing.portalId) configCache.delete(existing.portalId);
    return cat;
  }

  async deleteCategory(data: { id: string; organizationId: string }) {
    const existing = await this.prisma.intakeCategory.findFirst({
      where: { id: data.id, organizationId: data.organizationId },
      select: { id: true, portalId: true },
    });
    if (!existing) throw new NotFoundException('Category not found');
    await this.prisma.intakeCategory.delete({ where: { id: data.id } });
    if (existing.portalId) configCache.delete(existing.portalId);
    return { success: true };
  }

  async reorderCategories(data: { organizationId: string; portalId: string; orderedIds: string[] }) {
    await this.prisma.$transaction(
      data.orderedIds.map((id, i) =>
        this.prisma.intakeCategory.updateMany({
          where: { id, organizationId: data.organizationId, portalId: data.portalId },
          data: { position: i },
        }),
      ),
    );
    configCache.delete(data.portalId);
    return { success: true };
  }
}
