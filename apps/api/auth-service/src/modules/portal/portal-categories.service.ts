import { Injectable, NotFoundException } from '@nestjs/common';
import { scopeWhereOn, type SpaceScopeIds } from '@hbcfield/shared';
import { configCache } from './portal-helpers';
import { PortalServiceBase } from './portal-service.base';

/** A portal's request categories: create, edit, delete, reorder. */
@Injectable()
export class PortalCategoriesService extends PortalServiceBase {
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
    scopeSpaceIds?: SpaceScopeIds;
  }) {
    const portal = await this.prisma.portal.findFirst({
      where: { id: data.portalId, organizationId: data.organizationId, ...scopeWhereOn('spaceId', data.scopeSpaceIds) },
      select: { id: true },
    });
    if (!portal) throw new NotFoundException('Portal not found');
    // The routing space is a body id too — same tenant check updateCategory makes.
    await this.assertUnitRefsInOrg(data.organizationId, { spaceId: data.spaceId });
    // …and a workspace-scoped manager may only route their portal's requests
    // into a workspace they run — never into the one next door.
    this.assertSpaceRefInScope(data.scopeSpaceIds, data.spaceId);
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
    scopeSpaceIds?: SpaceScopeIds;
  }) {
    const existing = await this.prisma.intakeCategory.findFirst({
      where: { id: data.id, organizationId: data.organizationId, ...this.categoryScope(data.scopeSpaceIds) },
      select: { id: true, portalId: true },
    });
    if (!existing) throw new NotFoundException('Category not found');
    // Routing target in reach (null = "no routing space" is a value only the
    // org-wide key may choose, like every other organization-level setting).
    this.assertSpaceRefInScope(data.scopeSpaceIds, data.spaceId);
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

  async deleteCategory(data: { id: string; organizationId: string; scopeSpaceIds?: SpaceScopeIds }) {
    const existing = await this.prisma.intakeCategory.findFirst({
      where: { id: data.id, organizationId: data.organizationId, ...this.categoryScope(data.scopeSpaceIds) },
      select: { id: true, portalId: true },
    });
    if (!existing) throw new NotFoundException('Category not found');
    await this.prisma.intakeCategory.delete({ where: { id: data.id } });
    if (existing.portalId) configCache.delete(existing.portalId);
    return { success: true };
  }

  async reorderCategories(data: { organizationId: string; portalId: string; orderedIds: string[]; scopeSpaceIds?: SpaceScopeIds }) {
    if (data.scopeSpaceIds !== undefined && data.scopeSpaceIds !== null) {
      const portal = await this.prisma.portal.findFirst({
        where: { id: data.portalId, organizationId: data.organizationId, spaceId: { in: data.scopeSpaceIds } },
        select: { id: true },
      });
      if (!portal) throw new NotFoundException('Portal not found');
    }
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
