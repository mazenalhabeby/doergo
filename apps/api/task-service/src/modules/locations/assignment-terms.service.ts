import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  zoneOf,
  success,
  assertFoundInOrg,
  isAutoClockMode,
  parseAutoClockStartWindow,
  suggestStartWindow,
  localPartsIn,
  type AutoClockStartWindow,
} from '@hbcfield/shared';
import { assertValidScheduleDays } from './space-helpers';
import { SpaceServiceBase } from './space-service.base';

/** A member's terms in one workspace: roles, bill terms, the automatic clock. */
@Injectable()
export class AssignmentTermsService extends SpaceServiceBase {
  /**
   * "This workspace uses the automatic clock — switch it on?" to members the
   * office has just chosen here and who have not agreed yet. Their phone shows
   * the switch from now on (`offered` in the plan); the push is how they learn
   * it is there. Only where it would actually run: the workspace on, Time
   * Tracking running, not external, assigned now. Nobody who already agreed —
   * for them it simply starts. Fire-and-forget, like `announce`.
   */
  /**
   * Usual start hours from this member's clock-ins here over the last 60 days,
   * in the workspace's zone (`suggestStartWindow`). One narrow query, capped.
   */
  private async suggestStartWindow(userId: string, spaceId: string): Promise<AutoClockStartWindow | null> {
    const space = await this.prisma.companyLocation.findUnique({ where: { id: spaceId }, select: { timezone: true } });
    const rows = await this.prisma.timeEntry.findMany({
      where: { userId, locationId: spaceId, clockInAt: { gte: new Date(Date.now() - 60 * 86_400_000) } },
      select: { clockInAt: true },
      orderBy: { clockInAt: 'desc' },
      take: 200,
    });
    const tz = zoneOf(space?.timezone);
    return suggestStartWindow(rows.map((r) => localPartsIn(r.clockInAt, tz).minutesOfDay));
  }

  /**
   * Update an existing assignment
   */
  async updateAssignment(data: {
    assignmentId: string;
    organizationId: string;
    isPrimary?: boolean;
    schedule?: string[];
    effectiveFrom?: Date | string;
    effectiveTo?: Date | string;
    /**
     * May this member work away from THIS workspace?
     *
     * `null` clears the override and returns them to their account default,
     * which is what every assignment starts as. `undefined` leaves it untouched
     * — the difference matters, because "no opinion" and "explicitly refused"
     * are different answers and only one of them is reversible by an admin
     * changing the account.
     */
    allowRemote?: boolean | null;
    /** Chosen for the automatic clock here (shared attendance/auto-clock.ts). */
    autoClock?: boolean;
    /** SHIFT | PRESENCE — by their shift, or by arriving and leaving. */
    autoClockMode?: string;
    /** PRESENCE: usual start hours, or null for any time. Omitted when switching to PRESENCE → suggested from their clock-ins here. */
    autoClockStartWindow?: unknown;
    /**
     * Set when the caller manages only THIS workspace (not org-wide): the
     * assignment must be in it, or it reads as not found.
     */
    spaceId?: string;
  }) {
    // Find the assignment and verify organization ownership
    const assignment = await this.prisma.spaceAssignment.findFirst({
      where: { id: data.assignmentId },
      include: { user: { select: { isExternal: true } } },
    });

    assertFoundInOrg(assignment, data.organizationId, 'Assignment');
    if (data.spaceId !== undefined && assignment.spaceId !== data.spaceId) {
      throw new NotFoundException('Assignment not found');
    }
    // An external member holds no clock, automatic or not.
    if (data.autoClock === true && assignment.user?.isExternal) {
      throw new BadRequestException({
        message: 'External members do not use the clock',
        code: 'AUTO_CLOCK_NOT_FOR_EXTERNAL',
      });
    }

    // Validate schedule days if provided
    assertValidScheduleDays(data.schedule);

    // If setting as primary, unset other primary assignments for this user
    if (data.isPrimary) {
      await this.prisma.spaceAssignment.updateMany({
        where: {
          userId: assignment.userId,
          isPrimary: true,
          id: { not: data.assignmentId },
        },
        data: { isPrimary: false },
      });
    }

    const updateData: Prisma.SpaceAssignmentUncheckedUpdateInput = {};
    if (data.isPrimary !== undefined) updateData.isPrimary = data.isPrimary;
    if (data.schedule !== undefined) updateData.schedule = data.schedule;
    if (data.effectiveFrom !== undefined) updateData.effectiveFrom = new Date(data.effectiveFrom);
    if (data.effectiveTo !== undefined) updateData.effectiveTo = data.effectiveTo ? new Date(data.effectiveTo) : null;
    // Tri-state on purpose: true / false / null-meaning-follow-the-account.
    if (data.allowRemote !== undefined) updateData.allowRemote = data.allowRemote;
    if (data.autoClock !== undefined) updateData.autoClock = data.autoClock === true;
    if (data.autoClockMode !== undefined) {
      if (!isAutoClockMode(data.autoClockMode)) {
        throw new BadRequestException({
          message: 'Unknown automatic clock mode',
          code: 'AUTO_CLOCK_SETTING_INVALID',
          params: { field: 'mode' },
        });
      }
      updateData.autoClockMode = data.autoClockMode;
    }
    if (data.autoClockStartWindow !== undefined) {
      const parsed = parseAutoClockStartWindow(data.autoClockStartWindow, { strict: true });
      if (!parsed.ok) {
        throw new BadRequestException({
          message: 'Usual start hours must be two different times, HH:MM',
          code: parsed.code,
          params: { field: parsed.field },
        });
      }
      updateData.autoClockStartWindow = (parsed.value as Prisma.InputJsonValue | null) ?? Prisma.DbNull;
    } else if (data.autoClockMode === 'PRESENCE' && assignment.autoClockMode !== 'PRESENCE') {
      // Switched to arriving and leaving: start from their own habit here, which the office can change.
      const suggested = await this.suggestStartWindow(assignment.userId, assignment.spaceId);
      updateData.autoClockStartWindow = (suggested as Prisma.InputJsonValue | null) ?? Prisma.DbNull;
    }

    const updated = await this.prisma.spaceAssignment.update({
      where: { id: data.assignmentId },
      data: updateData,
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

    this.logger.log(`Assignment updated: ${updated.id}`);
    this.announce('space_roster_changed', data.organizationId, updated.spaceId ?? null);
    // Chosen for the automatic clock just now → tell them the switch is there.
    if (data.autoClock === true && assignment.autoClock !== true && updated.spaceId) {
      void this.offerAutoClock(data.organizationId, updated.spaceId, [assignment.userId]);
    }
    // Alias to the legacy shape (locationId/location) for client compat.
    const { space, spaceId, ...rest } = updated;
    return success({ ...rest, locationId: spaceId, location: space }, 'Assignment updated successfully');
  }
}
