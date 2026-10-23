import { Injectable, NotFoundException } from '@nestjs/common';
import { PORTAL_TEMPLATES, templateToIntakeCategories, workspaceInOrg, PrismaService } from '@hbcfield/shared';
import { PortalReachService } from './portal-reach.service';
import { PortalService } from './portal.service';
import { UnitResidentsService } from './unit-residents.service';

/** A workspace's own portal: creating it, finding it, its template, its addresses. */
@Injectable()
export class SpacePortalService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly reach: PortalReachService,
    private readonly portals: PortalService,
    private readonly residents: UnitResidentsService,
  ) {}

  // Entity-type → label for the space's portal (what a "unit" is called there).
  private static readonly ENTITY_LABELS: Record<string, string> = {
    rental: 'Apartment',
    logistics: 'Order',
    workplace: 'Workspace',
    custom: 'Unit',
  };

  async createPortal(data: { organizationId: string; templateKey?: string; name?: string }) {
    const template = PORTAL_TEMPLATES[data.templateKey || 'rental'] || PORTAL_TEMPLATES.rental;
    const portal = await this.seedPortal(data.organizationId, template, data.name);
    return this.portals.getPortal({ id: portal.id, organizationId: data.organizationId });
  }

  async createSpacePortal(data: { organizationId: string; spaceId: string; templateKey?: string; name?: string }) {
    const space = await workspaceInOrg(this.prisma, data.spaceId, data.organizationId);
    if (!space) throw new NotFoundException('Space not found');
    const template = PORTAL_TEMPLATES[data.templateKey || 'rental'] || PORTAL_TEMPLATES.rental;
    // Apartment entity ⇒ the Assets module must be on (fail before creating).
    if (template.key === 'rental') await this.reach.assertApartmentsModule(data.organizationId, data.spaceId);
    const portal = await this.seedPortal(data.organizationId, template, data.name, data.spaceId);
    return this.portals.getPortal({ id: portal.id, organizationId: data.organizationId });
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
    const portal = await this.seedPortal(data.organizationId, template, data.name, data.spaceId);
    return { data: { id: portal.id } };
  }

  /** The space's portal config (ensures one exists). */
  async getSpacePortal(data: { organizationId: string; spaceId: string; mayCreate?: boolean }) {
    /*
      Opening the workspace's portal page creates the portal when there is none —
      a portal is a billed line. Only somebody who may MANAGE portals here may
      cause that; a reader of requests (`mayCreate: false`) is told there is none.
      Undefined keeps the old behaviour for the internal callers below.
    */
    if (data.mayCreate === false) {
      const found = await this.prisma.portal.findFirst({
        where: { organizationId: data.organizationId, spaceId: data.spaceId },
        select: { id: true, templateKey: true, entityLabel: true, name: true },
      });
      return { data: found ?? null };
    }
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
      if (data.templateKey === 'rental') await this.reach.assertApartmentsModule(data.organizationId, data.spaceId);
      await this.prisma.portal.update({
        where: { id: ensured.data.id },
        data: {
          templateKey: data.templateKey,
          entityLabel: SpacePortalService.ENTITY_LABELS[data.templateKey] ?? 'Unit',
        },
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
    return { data: await this.residents.withResidentUsers(rows) };
  }

  /**
   * A portal from a template: the portal row, its intake categories, and the
   * organization flag "has at least one portal" (kept for guards/back-compat).
   * `spaceId` ties the portal and its categories to a workspace.
   */
  private async seedPortal(
    organizationId: string,
    template: (typeof PORTAL_TEMPLATES)[string],
    name: string | undefined,
    spaceId?: string,
  ) {
    const portal = await this.prisma.portal.create({
      data: {
        organizationId,
        ...(spaceId !== undefined ? { spaceId } : {}),
        name: name?.trim() || template.vertical,
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
        organizationId,
        portalId: portal.id,
        ...(spaceId !== undefined ? { spaceId } : {}),
      })),
    });
    await this.prisma.organization.update({
      where: { id: organizationId },
      data: { customerPortalEnabled: true },
    });
    return portal;
  }
}
