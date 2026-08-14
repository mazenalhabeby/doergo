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

  async listPortals(data: { organizationId: string; spaceId?: string }) {
    const portals = await this.prisma.portal.findMany({
      where: {
        organizationId: data.organizationId,
        isActive: true,
        ...(data.spaceId ? { spaceId: data.spaceId } : {}),
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

  /** Create a portal bound to a space (a space can run several). Mirrors
   *  createPortal but stamps spaceId on the portal + its seeded categories. */
  async createSpacePortal(data: { organizationId: string; spaceId: string; templateKey?: string; name?: string }) {
    const space = await this.prisma.companyLocation.findFirst({
      where: { id: data.spaceId, organizationId: data.organizationId },
      select: { id: true },
    });
    if (!space) throw new NotFoundException('Space not found');
    const template = PORTAL_TEMPLATES[data.templateKey || 'rental'] || PORTAL_TEMPLATES.rental;
    const portal = await this.prisma.portal.create({
      data: {
        organizationId: data.organizationId,
        spaceId: data.spaceId,
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
        spaceId: data.spaceId,
      })),
    });
    await this.prisma.organization.update({
      where: { id: data.organizationId },
      data: { customerPortalEnabled: true },
    });
    return this.getPortal({ id: portal.id, organizationId: data.organizationId });
  }

  /**
   * The B2C portal for a specific Space (CRM "Invite to app" target). Finds the
   * space's portal or lazily creates one linked to it. Idempotent.
   */
  async ensurePortalForSpace(data: { organizationId: string; spaceId: string; name?: string }) {
    const existing = await this.prisma.portal.findFirst({
      where: { organizationId: data.organizationId, spaceId: data.spaceId },
      select: { id: true },
    });
    if (existing) return { data: { id: existing.id } };
    const template = PORTAL_TEMPLATES.rental;
    const portal = await this.prisma.portal.create({
      data: {
        organizationId: data.organizationId,
        name: data.name?.trim() || template.vertical,
        templateKey: template.key,
        entityLabel: template.entityLabel,
        contactLabel: template.contactLabel,
        accent: template.accent,
        features: template.features as unknown as object,
        spaceId: data.spaceId,
      },
    });
    await this.prisma.intakeCategory.createMany({
      data: templateToIntakeCategories(template).map((r) => ({
        ...r,
        organizationId: data.organizationId,
        portalId: portal.id,
        spaceId: data.spaceId,
      })),
    });
    await this.prisma.organization.update({
      where: { id: data.organizationId },
      data: { customerPortalEnabled: true },
    });
    return { data: { id: portal.id } };
  }

  // ── Per-space portal config + unit catalog (CRM "Portal" tab) ──────────────

  // Entity-type → label for the space's portal (what a "unit" is called there).
  private static readonly ENTITY_LABELS: Record<string, string> = {
    rental: 'Apartment', logistics: 'Order', workplace: 'Workspace', custom: 'Unit',
  };

  /** The space's portal config (ensures one exists). */
  async getSpacePortal(data: { organizationId: string; spaceId: string }) {
    const ensured = await this.ensurePortalForSpace({ organizationId: data.organizationId, spaceId: data.spaceId });
    const portal = await this.prisma.portal.findFirst({
      where: { id: ensured.data.id, organizationId: data.organizationId },
      select: { id: true, templateKey: true, entityLabel: true, name: true },
    });
    return { data: portal };
  }

  /** Set the space portal's entity type (templateKey → entityLabel). */
  async updateSpacePortal(data: { organizationId: string; spaceId: string; templateKey?: string }) {
    const ensured = await this.ensurePortalForSpace({ organizationId: data.organizationId, spaceId: data.spaceId });
    if (data.templateKey) {
      await this.prisma.portal.update({
        where: { id: ensured.data.id },
        data: { templateKey: data.templateKey, entityLabel: PortalService.ENTITY_LABELS[data.templateKey] ?? 'Unit' },
      });
    }
    return this.getSpacePortal(data);
  }

  /** The space's unit/apartment catalog (with the assigned customer, if any). */
  async listSpaceUnits(data: { organizationId: string; spaceId: string }) {
    const rows = await this.prisma.customerUnit.findMany({
      where: { organizationId: data.organizationId, spaceId: data.spaceId, isActive: true },
      orderBy: { name: 'asc' },
      include: { customer: { select: { id: true, name: true } } },
      take: 500,
    });
    return { data: await this.withResidentUsers(rows) };
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

  /** A single unit (apartment) with its resident — for the apartment detail page. */
  async getUnit(data: { id: string; organizationId: string }) {
    const unit = await this.prisma.customerUnit.findFirst({
      where: { id: data.id, organizationId: data.organizationId },
      include: { customer: { select: { id: true, name: true, email: true, phone: true } } },
    });
    if (!unit) throw new NotFoundException('Unit not found');
    const [enriched] = await this.withResidentUsers([unit]);
    return { data: enriched };
  }

  /** Resolve residentUserId → member (staff resident) in one batched query. The
   *  id has no FK (removing a member never blocks), so we join it here. DRY: used
   *  by both getUnit and listSpaceUnits. */
  private async withResidentUsers<T extends { residentUserId?: string | null }>(units: T[]) {
    const ids = Array.from(new Set(units.map((u) => u.residentUserId).filter(Boolean) as string[]));
    if (!ids.length) return units.map((u) => ({ ...u, residentUser: null }));
    const users = await this.prisma.user.findMany({ where: { id: { in: ids } }, select: { id: true, firstName: true, lastName: true, avatarUrl: true } });
    const byId = new Map(users.map((u) => [u.id, u]));
    return units.map((u) => ({ ...u, residentUser: u.residentUserId ? byId.get(u.residentUserId) ?? null : null }));
  }

  /** Units a specific customer is bound to (customer-scoped). */
  async listCustomerUnits(data: { organizationId: string; customerId: string }) {
    return this.prisma.customerUnit.findMany({
      where: { organizationId: data.organizationId, customerId: data.customerId, isActive: true },
      orderBy: [{ isPrimary: 'desc' }, { createdAt: 'asc' }],
      take: 200,
    });
  }

  /** Make a unit the customer's primary address (unsets the siblings). */
  async setPrimaryUnit(data: { id: string; organizationId: string; customerId?: string }) {
    const unit = await this.prisma.customerUnit.findFirst({
      where: { id: data.id, organizationId: data.organizationId, ...(data.customerId ? { customerId: data.customerId } : {}) },
      select: { id: true, customerId: true },
    });
    if (!unit) throw new NotFoundException('Unit not found');
    await this.prisma.$transaction([
      ...(unit.customerId
        ? [this.prisma.customerUnit.updateMany({ where: { customerId: unit.customerId, id: { not: unit.id } }, data: { isPrimary: false } })]
        : []),
      this.prisma.customerUnit.update({ where: { id: unit.id }, data: { isPrimary: true } }),
    ]);
    return { success: true };
  }

  async listUnits(data: { organizationId: string; customerId?: string }) {
    return this.prisma.customerUnit.findMany({
      where: {
        organizationId: data.organizationId,
        isActive: true,
        ...(data.customerId ? { customerId: data.customerId } : {}),
      },
      orderBy: { createdAt: 'asc' },
      take: 500,
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

  /** Keep only ids that are real users in this org (drops cross-tenant/stale ids
   *  so unit worker assignment never points out-of-org). Deduped, capped. */
  private async keepOrgUserIds(ids: string[], organizationId: string): Promise<string[]> {
    const clean = Array.from(new Set((ids || []).filter((x) => typeof x === 'string' && x.trim()))).slice(0, 20);
    if (!clean.length) return [];
    const rows = await this.prisma.user.findMany({ where: { id: { in: clean }, organizationId }, select: { id: true } });
    const ok = new Set(rows.map((r) => r.id));
    return clean.filter((id) => ok.has(id));
  }

  async createUnit(data: {
    organizationId: string;
    customerId?: string;
    portalId?: string;
    name: string;
    label?: string;
    address?: string;
    lat?: number | null;
    lng?: number | null;
    isPrimary?: boolean;
    spaceId?: string;
    contactName?: string | null;
    contactPhone?: string | null;
    residentUserId?: string | null;
  }) {
    // Resident is a MEMBER or a CLIENT, never both. A valid member wins.
    const residentUserId = data.residentUserId ? ((await this.keepOrgUserIds([data.residentUserId], data.organizationId))[0] ?? null) : null;
    const clientId = residentUserId ? null : (data.customerId || null);
    const c = await this.assertCustomerInOrg(data.organizationId, clientId || undefined);
    data.customerId = clientId || undefined;
    // First address for a customer becomes primary automatically.
    const existing = data.customerId
      ? await this.prisma.customerUnit.count({ where: { customerId: data.customerId } })
      : 0;
    const isPrimary = data.isPrimary ?? existing === 0;
    if (isPrimary && data.customerId) {
      await this.prisma.customerUnit.updateMany({ where: { customerId: data.customerId }, data: { isPrimary: false } });
    }
    return this.prisma.customerUnit.create({
      data: {
        organizationId: data.organizationId,
        customerId: data.customerId || null,
        portalId: data.portalId || c?.portalId || null,
        name: data.name,
        label: data.label || null,
        address: data.address || null,
        lat: data.lat ?? null,
        lng: data.lng ?? null,
        isPrimary,
        spaceId: data.spaceId || null,
        contactName: data.contactName || null,
        contactPhone: data.contactPhone || null,
        residentUserId,
      },
    });
  }

  async updateUnit(data: {
    id: string;
    organizationId: string;
    name?: string;
    label?: string | null;
    address?: string | null;
    lat?: number | null;
    lng?: number | null;
    isPrimary?: boolean;
    spaceId?: string | null;
    customerId?: string | null;
    contactName?: string | null;
    contactPhone?: string | null;
    residentUserId?: string | null;
    scopeCustomerId?: string; // when set, the unit must belong to this customer
  }) {
    const existing = await this.prisma.customerUnit.findFirst({
      where: { id: data.id, organizationId: data.organizationId, ...(data.scopeCustomerId ? { customerId: data.scopeCustomerId } : {}) },
      select: { id: true, customerId: true },
    });
    if (!existing) throw new NotFoundException('Unit not found');
    await this.assertCustomerInOrg(data.organizationId, data.customerId);
    // Resident is a MEMBER or a CLIENT, never both — setting one clears the other.
    const residentUserId = data.residentUserId !== undefined
      ? (data.residentUserId ? ((await this.keepOrgUserIds([data.residentUserId], data.organizationId))[0] ?? null) : null)
      : undefined;
    if (data.isPrimary && existing.customerId) {
      await this.prisma.customerUnit.updateMany({ where: { customerId: existing.customerId, id: { not: existing.id } }, data: { isPrimary: false } });
    }
    return this.prisma.customerUnit.update({
      where: { id: data.id },
      data: {
        ...(data.name !== undefined ? { name: data.name } : {}),
        ...(data.label !== undefined ? { label: data.label } : {}),
        ...(data.address !== undefined ? { address: data.address } : {}),
        ...(data.lat !== undefined ? { lat: data.lat } : {}),
        ...(data.lng !== undefined ? { lng: data.lng } : {}),
        ...(data.isPrimary !== undefined ? { isPrimary: data.isPrimary } : {}),
        ...(data.spaceId !== undefined ? { spaceId: data.spaceId } : {}),
        ...(data.contactName !== undefined ? { contactName: data.contactName } : {}),
        ...(data.contactPhone !== undefined ? { contactPhone: data.contactPhone } : {}),
        // Member resident → clear client; client resident → clear member.
        ...(residentUserId !== undefined ? { residentUserId, ...(residentUserId ? { customerId: null } : {}) } : {}),
        ...(data.customerId !== undefined ? { customerId: data.customerId, ...(data.customerId ? { residentUserId: null } : {}) } : {}),
      },
    });
  }

  async deleteUnit(data: { id: string; organizationId: string; customerId?: string }) {
    const existing = await this.prisma.customerUnit.findFirst({
      where: { id: data.id, organizationId: data.organizationId, ...(data.customerId ? { customerId: data.customerId } : {}) },
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
