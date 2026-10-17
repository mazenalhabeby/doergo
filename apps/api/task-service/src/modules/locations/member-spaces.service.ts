import { Injectable, NotFoundException } from '@nestjs/common';
import { notEndedWhere, success } from '@hbcfield/shared';
import { SpaceServiceBase } from './space-service.base';

/** One member's side: the workspaces they are in, the colleagues they share them with. */
@Injectable()
export class MemberSpacesService extends SpaceServiceBase {
  /**
   * Get all members assigned to a location
   */
  /**
   * Colleagues for the "Team" screen — the people who share the requester's
   * visible spaces, scoped by their Access Profile spaceScope. Deduplicated,
   * excludes the requester. 2-3 queries (no N+1).
   */
  async getColleagues(data: { userId: string; organizationId: string; spaceScope?: 'own' | 'tasks' | 'all' }) {
    // Determine which space ids the requester may see.
    let locationIds: string[];
    if (data.spaceScope === 'all') {
      const locs = await this.prisma.companyLocation.findMany({
        // Every active space counts, whatever its ownership label: a crew posted
        // to a customer's site are colleagues like any other. (Customer spaces
        // used to be excluded here on the assumption they hold no members.)
        where: { organizationId: data.organizationId, isActive: true },
        select: { id: true },
      });
      locationIds = locs.map((l) => l.id);
    } else {
      const mine = await this.prisma.spaceAssignment.findMany({
        // Same effective window the spaces list uses. Without it a lapsed
        // assignment still made you a colleague of that space — so someone
        // rotated off a site kept seeing its crew after the space itself had
        // disappeared from their list.
        where: {
          userId: data.userId,
          organizationId: data.organizationId,
          ...notEndedWhere(),
        },
        select: { spaceId: true },
      });
      locationIds = mine.map((a) => a.spaceId);
    }

    if (locationIds.length === 0) return success([]);

    const rosters = await this.prisma.spaceAssignment.findMany({
      where: {
        spaceId: { in: locationIds },
        // Drop ghosts of users removed from the org (org nulled / deactivated).
        user: { is: { organizationId: data.organizationId, isActive: true } },
        ...notEndedWhere(),
      },
      include: {
        user: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            avatarUrl: true,
            position: true,
            role: true,
            presence: true,
            contactable: true,
          },
        },
        space: { select: { id: true, name: true } },
      },
    });

    // Dedupe by user, keep first space name, drop the requester.
    const byUser = new Map<string, any>();
    for (const r of rosters) {
      if (!r.user || r.user.id === data.userId) continue;
      if (!byUser.has(r.user.id)) {
        byUser.set(r.user.id, { ...r.user, spaceName: r.space?.name || null });
      }
    }
    return success([...byUser.values()]);
  }

  /**
   * Get all location assignments for an employee
   */
  async getTechnicianAssignments(data: { userId: string; organizationId: string }) {
    // Verify user exists and belongs to organization
    const user = await this.prisma.user.findFirst({
      where: {
        id: data.userId,
        organizationId: data.organizationId,
      },
    });

    if (!user) {
      throw new NotFoundException('User not found in organization');
    }

    const assignments = await this.prisma.spaceAssignment.findMany({
      where: {
        userId: data.userId,
        // Only show active assignments (not expired)
        ...notEndedWhere(),
      },
      include: {
        space: true,
      },
      orderBy: [{ isPrimary: 'desc' }, { createdAt: 'asc' }],
    });

    // Alias to the legacy shape (locationId/location) for client compat.
    const shaped = assignments.map(({ space, spaceId, ...a }) => ({
      ...a,
      locationId: spaceId,
      location: space,
    }));

    return success(shaped);
  }
}
