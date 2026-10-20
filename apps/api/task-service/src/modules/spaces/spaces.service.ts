import { Injectable, NotFoundException } from '@nestjs/common';
import { assertWorkflowInOrg } from '../../common/tenant-scope.util';
import {
  success,
  DEFAULT_ORG_MODULES,
  ATTENDANCE_CONSTANTS,
  validateMinCover,
  effectiveSpaceModules,
} from '@hbcfield/shared';
import { tzFromCoords, spaceCurrency } from './space-helpers';
import { SpaceServiceBase } from './space-service.base';
import type { SpaceKind } from '@prisma/client';

@Injectable()
export class SpacesService extends SpaceServiceBase {
  /**
   * Create a new company location
   */
  async create(data: {
    name: string;
    address?: string;
    lat?: number;
    lng?: number;
    geofenceRadius?: number;
    geofencePolygon?: unknown;
    minCover?: number;
    timezone?: string;
    kind?: string;
    contactName?: string;
    contactEmail?: string;
    contactPhone?: string;
    billableRateCents?: number | null;
    costRateCents?: number | null;
    currency?: string | null;
    /** The company that invoices this workspace; null = the organization's main one. */
    legalEntityId?: string | null;
    enabledModules?: string[];
    workflowId?: string;
    organizationId: string;
    userId: string;
  }) {
    this.logger.log(`Creating company location: ${data.name}`);

    // The task type is an id from the body — it must be this organization's (tenant-scope.util).
    await assertWorkflowInOrg(this.prisma, data.workflowId, data.organizationId);

    // The org's first space becomes its default (holds otherwise-unassigned tasks).
    const existingDefault = await this.prisma.companyLocation.count({
      where: { organizationId: data.organizationId, isDefault: true },
    });

    // Space timezone: explicit value wins, else derive from the pin, else inherit
    // the ORG's timezone — only then the schema default. Keeps a pin-less space in
    // the org's zone (e.g. Vienna) instead of the hardcoded Berlin column default.
    let timezone: string | undefined = data.timezone || tzFromCoords(data.lat, data.lng) || undefined;
    if (!timezone) {
      const org = await this.prisma.organization.findUnique({
        where: { id: data.organizationId },
        select: { timezone: true },
      });
      timezone = org?.timezone || undefined;
    }

    const location = await this.prisma.companyLocation.create({
      data: {
        name: data.name,
        address: data.address,
        lat: data.lat ?? null,
        lng: data.lng ?? null,
        // ATTENDANCE_CONSTANTS is the single source. This said 15 while the
        // constant said 50 and the schema default said 15 again, so a space
        // created by any path that omits the field got a 15-metre fence — small
        // enough to refuse somebody standing at the building, and chosen by
        // nobody.
        geofenceRadius: data.geofenceRadius ?? ATTENDANCE_CONSTANTS.DEFAULT_GEOFENCE_RADIUS,
        geofencePolygon: this.cleanPolygon(data.geofencePolygon) ?? undefined,
        // Resolved above: explicit → pin-derived → org tz → schema default.
        timezone,
        // The staffing floor. Omitted means 0 — no floor — which is what every
        // space that existed before this feature has.
        minCover: data.minCover !== undefined ? validateMinCover(data.minCover) : undefined,
        // Each space owns its module set; new spaces start with the standard
        // default (the org-level Modules tab was removed — modules live on spaces).
        enabledModules: data.enabledModules ?? DEFAULT_ORG_MODULES,
        workflowId: data.workflowId ?? undefined,
        // Ownership kind + customer contact fields (only meaningful for CUSTOMER).
        kind: (data.kind as SpaceKind) ?? undefined,
        contactName: data.contactName ?? undefined,
        contactEmail: data.contactEmail ?? undefined,
        contactPhone: data.contactPhone ?? undefined,
        currency: data.currency !== undefined ? spaceCurrency(data.currency) : undefined,
        legalEntityId: await this.spaceCompany(data.organizationId, data.legalEntityId),
        organizationId: data.organizationId,
        isDefault: existingDefault === 0,
      },
    });
    // Rates go through the ONE dated writer, so a new workspace starts with history.
    await this.writeSpaceRates(location.id, data.organizationId, data, data.userId);

    this.logger.log(`Company location created: ${location.id}`);
    this.announce('space_changed', data.organizationId, location.id);
    return success(location, 'Company location created successfully');
  }

  /**
   * Get effective modules for a space.
   * Returns the space's enabledModules if set, otherwise falls back to the org's enabledModules.
   */
  async getEffectiveModules(data: { id: string; organizationId: string }) {
    const location = await this.prisma.companyLocation.findFirst({
      where: {
        id: data.id,
        organizationId: data.organizationId,
      },
      select: {
        id: true,
        name: true,
        enabledModules: true,
        workflowId: true,
        organization: {
          select: {
            enabledModules: true,
          },
        },
      },
    });

    if (!location) {
      throw new NotFoundException('Company location not found');
    }

    // Space modules take priority over org modules
    const effectiveModules = effectiveSpaceModules(location.enabledModules, location.organization.enabledModules);

    return success({
      spaceId: location.id,
      spaceName: location.name,
      modules: effectiveModules,
      // `enabledModules` is what the web hooks read (useSpaceModules); keep
      // `modules` too for any older caller. Both = the effective set.
      enabledModules: effectiveModules,
      // The space's OWN workflow (task type). null → the client falls back to the
      // org default workflow. Drives the space-aware task board columns + gating.
      workflowId: location.workflowId ?? null,
      source: location.enabledModules ? 'space' : 'organization',
    });
  }
}
