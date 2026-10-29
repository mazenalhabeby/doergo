import { Injectable, NotFoundException, ForbiddenException, Logger } from '@nestjs/common';
import {
  success,
  accessAllowsInSpace,
  assertFoundInOrg,
  permissionsExceed,
  permissionsFromOrgRole,
  type PermissionSet,
  personPasses,
} from '@hbcfield/shared';
import { assertValidScheduleDays } from './space-helpers';
import { remoteBucketRefusal } from '../../common/tenant-scope.util';
import { PrismaService } from '@hbcfield/shared';
import { SpaceAnnouncer } from './space-announcer.service';
import type { ResolvedAccess } from '@hbcfield/shared';

/** Putting a person into a workspace, and taking them out. */
@Injectable()
export class SpaceMembershipService {
  private readonly logger = new Logger(SpaceMembershipService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly announcer: SpaceAnnouncer,
  ) {}

  // ==================== MEMBER ASSIGNMENT METHODS ====================

  /**
   * Assign a member to a company location
   */
  async assignTechnician(data: {
    userId: string;
    locationId: string;
    isPrimary?: boolean;
    schedule?: string[];
    effectiveFrom?: Date | string;
    effectiveTo?: Date | string;
    requestingUserId: string;
    organizationId: string;
    access?: ResolvedAccess | null; // caller's resolved access (for cross-org shared spaces)
  }) {
    this.logger.log(`Assigning member ${data.userId} to location ${data.locationId}`);

    // Verify the worker belongs to the CALLER's org — a guest may only add THEIR
    // OWN people to a shared space, never inject someone else's user.
    const technician = await personPasses(this.prisma, data.userId, {
      organizationId: data.organizationId,
      active: true,
    });

    if (!technician) {
      throw new NotFoundException('Employee not found in organization');
    }

    // Verify location: own-org space, OR a space cross-org-shared with the caller
    // at CONTROL level (space-scoped canManageUsers). For the shared case the
    // assignment row is tagged with the CALLER's (guest's) org below, so the
    // guest worker never leaks into the owner's routing/attendance/member queries.
    let location = await this.prisma.companyLocation.findFirst({
      where: { id: data.locationId, organizationId: data.organizationId, isActive: true },
    });
    // Adding people asks its own key now (`canAddSpaceMembers`, which a CONTROL share carries);
    // `canManageUsers` here is kept so a share resolved before the split still works.
    if (
      !location &&
      (accessAllowsInSpace(data.access, 'canAddSpaceMembers', data.locationId) ||
        accessAllowsInSpace(data.access, 'canManageUsers', data.locationId))
    ) {
      location = await this.prisma.companyLocation.findFirst({
        where: { id: data.locationId, isActive: true },
      });
    }

    if (!location) {
      throw new NotFoundException('Company location not found');
    }
    // Never the Remote bucket: it is for somebody with NO workspace (tenant-scope.util `assignable`).
    if (location.isRemote) throw remoteBucketRefusal();

    // Validate schedule days if provided
    assertValidScheduleDays(data.schedule);

    // If setting as primary, unset other primary assignments for this user
    if (data.isPrimary) {
      await this.prisma.spaceAssignment.updateMany({
        where: {
          userId: data.userId,
          isPrimary: true,
        },
        data: { isPrimary: false },
      });
    }

    // Create the assignment (upsert to handle existing assignment). Storage is the
    // unified space_assignments table (Phase 5b); `roleId`/routing overrides set
    // via the space-roles path are left untouched by this upsert.
    const assignment = await this.prisma.spaceAssignment.upsert({
      where: {
        userId_spaceId: {
          userId: data.userId,
          spaceId: data.locationId,
        },
      },
      update: {
        isPrimary: data.isPrimary ?? false,
        schedule: data.schedule ?? [],
        effectiveFrom: data.effectiveFrom ? new Date(data.effectiveFrom) : new Date(),
        effectiveTo: data.effectiveTo ? new Date(data.effectiveTo) : null,
      },
      create: {
        organizationId: data.organizationId,
        userId: data.userId,
        spaceId: data.locationId,
        isPrimary: data.isPrimary ?? false,
        schedule: data.schedule ?? [],
        effectiveFrom: data.effectiveFrom ? new Date(data.effectiveFrom) : new Date(),
        effectiveTo: data.effectiveTo ? new Date(data.effectiveTo) : null,
      },
      include: {
        space: true,
        user: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
            avatarUrl: true,
          },
        },
      },
    });

    this.logger.log(`Member assignment created/updated: ${assignment.id}`);
    this.announcer.announce('space_roster_changed', data.organizationId, data.locationId);
    // Alias to the legacy shape (locationId/location) for client compat.
    const { space, spaceId, ...rest } = assignment;
    return success({ ...rest, locationId: spaceId, location: space }, 'Member assigned to location successfully');
  }

  /**
   * Remove a member assignment
   */
  async removeAssignment(data: {
    assignmentId: string;
    organizationId: string;
    /** The workspace in the route, for a caller who may act only there; another workspace's row reads as not found. */
    spaceId?: string;
    /** Set for a caller acting through a grant in this workspace only: nobody who holds more here is theirs to remove. */
    outrankPerms?: PermissionSet | null;
  }) {
    // Find the assignment and verify organization ownership
    const assignment = await this.prisma.spaceAssignment.findFirst({
      where: { id: data.assignmentId },
      include: { role: { select: { permissions: true } } },
    });

    assertFoundInOrg(assignment, data.organizationId, 'Assignment');
    if (data.spaceId && assignment.spaceId !== data.spaceId) throw new NotFoundException('Assignment not found');
    if (
      data.outrankPerms &&
      assignment.role &&
      permissionsExceed(data.outrankPerms, permissionsFromOrgRole(assignment.role.permissions))
    ) {
      throw new ForbiddenException({
        message: 'This person holds more in this workspace than you do',
        code: 'MEMBER_ABOVE_YOU',
      });
    }

    await this.prisma.spaceAssignment.delete({
      where: { id: data.assignmentId },
    });

    this.logger.log(`Assignment removed: ${data.assignmentId}`);
    this.announcer.announce('space_roster_changed', data.organizationId, assignment.spaceId);
    return success(null, 'Assignment removed successfully');
  }
}
