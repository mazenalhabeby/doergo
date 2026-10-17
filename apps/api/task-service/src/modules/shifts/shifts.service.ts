import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { assertSpaceInOrg } from '../../common/tenant-scope.util';
import {
  success,
  shiftCrossesMidnight,
  SHIFT_REMINDER_DEFAULTS,
  SCHEDULE_FLAG_DEFAULT_TOLERANCE_MIN,
  type SpaceScopeIds,
} from '@hbcfield/shared';
import { ShiftsBase } from './shifts.base';

export { weekOf } from './shifts-helpers';

/**
 * CRUD for shift definitions and the rota (ShiftAssignment). These are what the
 * shift resolver reads at clock-in. Org-scoped throughout: organizationId comes
 * from the caller's token, and any spaceId/userId/shiftId is verified to belong
 * to that org before use.
 */
@Injectable()
export class ShiftsService extends ShiftsBase {
  // ── Shifts ─────────────────────────────────────────────────────────────

  /** List shifts for an org; optionally only those usable in a given space (space-scoped + org-wide). */
  async listShifts(data: { organizationId: string; spaceId?: string; scopeSpaceIds?: SpaceScopeIds }) {
    const where: any = { organizationId: data.organizationId };
    if (data.spaceId) where.OR = [{ spaceId: data.spaceId }, { spaceId: null }];
    /*
      Narrowed to the caller's granted spaces, and org-wide templates
      (`spaceId: null`) come with them — a shift pattern that belongs to no
      space applies in theirs too, and hiding it would make their rota look
      emptier than it is. Applied as an AND beside the filter above, so asking
      for one space still cannot reach a space they were never granted.
    */
    if (data.scopeSpaceIds !== null && data.scopeSpaceIds !== undefined) {
      // Explicit about the three states rather than relying on `[]` being
      // truthy — granted NOWHERE must still narrow, to nothing.
      where.AND = [
        ...(where.AND ?? []),
        { OR: [{ spaceId: { in: data.scopeSpaceIds } }, { spaceId: null }] },
      ];
    }
    const shifts = await this.prisma.shift.findMany({
      where,
      orderBy: [{ isActive: 'desc' }, { startLocal: 'asc' }],
      include: { _count: { select: { assignments: true } } },
    });
    return success(shifts);
  }

  async createShift(data: {
    /** Spaces the caller may act in; null = org-wide, [] = none. */
    scopeSpaceIds?: SpaceScopeIds;
    organizationId: string;
    spaceId?: string | null;
    name: string;
    description?: string;
    color?: string;
    startLocal: string;
    endLocal: string;
    breakMinutes?: number;
    graceMin?: number;
    reminderIntervalMin?: number;
    maxReminders?: number;
    flagToleranceMin?: number;
  }) {
    const name = (data.name || '').trim();
    if (!name) throw new BadRequestException('Shift name is required');
    this.assertTime(data.startLocal, 'start');
    this.assertTime(data.endLocal, 'end');
    if (data.spaceId) {
      await assertSpaceInOrg(this.prisma, data.spaceId, data.organizationId, { scope: data.scopeSpaceIds, activeOnly: true });
    } else if (data.scopeSpaceIds !== null && data.scopeSpaceIds !== undefined) {
      /*
        ⚠️ The scope used to be checked ONLY when a space was named, so a rota
        manager for one workspace created an ORGANIZATION-WIDE shift simply by
        leaving the space out — a template every workspace's rota then offers.
        An org-wide shift is for somebody who manages every workspace; the rest
        read it as absent, the same answer `getOwnedShift` gives them for one.
      */
      throw new NotFoundException('Space not found in this organization');
    }

    const shift = await this.prisma.shift.create({
      data: {
        organizationId: data.organizationId,
        spaceId: data.spaceId ?? null,
        name,
        description: data.description?.trim() || null,
        color: data.color || '#3b82f6',
        startLocal: data.startLocal,
        endLocal: data.endLocal,
        crossesMidnight: shiftCrossesMidnight(data.startLocal, data.endLocal),
        breakMinutes: this.clampInt(data.breakMinutes, 0, 0, 1440),
        graceMin: this.clampInt(data.graceMin, SHIFT_REMINDER_DEFAULTS.GRACE_MINUTES, 0, 120),
        reminderIntervalMin: this.clampInt(data.reminderIntervalMin, SHIFT_REMINDER_DEFAULTS.REMINDER_INTERVAL_MINUTES, 1, 120),
        maxReminders: this.clampInt(data.maxReminders, SHIFT_REMINDER_DEFAULTS.MAX_REMINDERS, 1, 10),
        flagToleranceMin: this.clampInt(data.flagToleranceMin, SCHEDULE_FLAG_DEFAULT_TOLERANCE_MIN, 0, 240),
      },
    });
    return success(shift, 'Shift created');
  }

  async updateShift(data: {
    /** Spaces the caller may act in; null = org-wide, [] = none. */
    scopeSpaceIds?: SpaceScopeIds;
    organizationId: string;
    shiftId: string;
    name?: string;
    description?: string;
    color?: string;
    startLocal?: string;
    endLocal?: string;
    breakMinutes?: number;
    graceMin?: number;
    reminderIntervalMin?: number;
    maxReminders?: number;
    flagToleranceMin?: number;
    isActive?: boolean;
  }) {
    const shift = await this.getOwnedShift(data.organizationId, data.shiftId, data.scopeSpaceIds);

    const patch: Record<string, unknown> = {};
    if (data.name !== undefined) {
      const name = data.name.trim();
      if (!name) throw new BadRequestException('Shift name cannot be empty');
      patch.name = name;
    }
    if (data.description !== undefined) patch.description = data.description?.trim() || null;
    if (data.color !== undefined) patch.color = data.color;
    if (data.startLocal !== undefined) {
      this.assertTime(data.startLocal, 'start');
      patch.startLocal = data.startLocal;
    }
    if (data.endLocal !== undefined) {
      this.assertTime(data.endLocal, 'end');
      patch.endLocal = data.endLocal;
    }
    if (data.breakMinutes !== undefined) patch.breakMinutes = this.clampInt(data.breakMinutes, 0, 0, 1440);
    if (data.graceMin !== undefined) patch.graceMin = this.clampInt(data.graceMin, SHIFT_REMINDER_DEFAULTS.GRACE_MINUTES, 0, 120);
    if (data.reminderIntervalMin !== undefined) patch.reminderIntervalMin = this.clampInt(data.reminderIntervalMin, SHIFT_REMINDER_DEFAULTS.REMINDER_INTERVAL_MINUTES, 1, 120);
    if (data.maxReminders !== undefined) patch.maxReminders = this.clampInt(data.maxReminders, SHIFT_REMINDER_DEFAULTS.MAX_REMINDERS, 1, 10);
    if (data.flagToleranceMin !== undefined) patch.flagToleranceMin = this.clampInt(data.flagToleranceMin, SCHEDULE_FLAG_DEFAULT_TOLERANCE_MIN, 0, 240);
    if (data.isActive !== undefined) patch.isActive = data.isActive;

    // Recompute crossesMidnight if either time changed.
    const start = (patch.startLocal as string) ?? shift.startLocal;
    const end = (patch.endLocal as string) ?? shift.endLocal;
    patch.crossesMidnight = shiftCrossesMidnight(start, end);

    const updated = await this.prisma.shift.update({ where: { id: shift.id }, data: patch });
    if (this.rematch) {
      const rostered = await this.prisma.shiftAssignment.findMany({
        where: { shiftId: shift.id, organizationId: data.organizationId, isActive: true },
        select: { userId: true, spaceId: true },
        distinct: ['userId', 'spaceId'],
        take: 500,
      });
      for (const r of rostered) this.rematch.schedule({ organizationId: data.organizationId, userId: r.userId, spaceId: r.spaceId });
    }
    return success(updated, 'Shift updated');
  }

  async deleteShift(data: { organizationId: string; shiftId: string; scopeSpaceIds?: SpaceScopeIds }) {
    const shift = await this.getOwnedShift(data.organizationId, data.shiftId, data.scopeSpaceIds);
    // Cascades to its rota assignments (schema onDelete: Cascade).
    await this.prisma.shift.delete({ where: { id: shift.id } });
    return success({ id: shift.id }, 'Shift deleted');
  }
}
