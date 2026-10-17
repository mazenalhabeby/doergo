import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { assertSpaceInOrg, assertUserInOrg } from '../../common/tenant-scope.util';
import { success, scopeAllows, type SpaceScopeIds } from '@hbcfield/shared';
import { earliestOf } from './shifts-helpers';
import { ShiftsBase } from './shifts.base';

/** Who works which shift, and when: listing, adding, changing, removing an assignment. */
@Injectable()
export class ShiftAssignmentsService extends ShiftsBase {
  // ── Rota (assignments) ───────────────────────────────────────────────────

  /** Active rota for a space (optionally including ended assignments). */
  async listAssignments(data: { organizationId: string; spaceId: string; includeEnded?: boolean; scopeSpaceIds?: SpaceScopeIds }) {
    await assertSpaceInOrg(this.prisma, data.spaceId, data.organizationId, { scope: data.scopeSpaceIds });
    const where: any = { organizationId: data.organizationId, spaceId: data.spaceId };
    if (!data.includeEnded) where.isActive = true;
    const assignments = await this.prisma.shiftAssignment.findMany({
      where,
      include: {
        shift: { select: { id: true, name: true, startLocal: true, endLocal: true, crossesMidnight: true, color: true } },
        user: { select: { id: true, firstName: true, lastName: true, email: true, avatarUrl: true } },
      },
      orderBy: [{ priority: 'desc' }, { createdAt: 'asc' }],
      // Cap the result — a busy space with includeEnded=true could otherwise
      // return every historical assignment ever made.
      take: 500,
    });
    return success(assignments);
  }

  async createAssignment(data: {
    /** Spaces the caller may act in; null = org-wide, [] = none. */
    scopeSpaceIds?: SpaceScopeIds;
    organizationId: string;
    spaceId: string;
    userId: string;
    shiftId: string;
    recurrence: string;
    daysOfWeek?: number[];
    daysOfMonth?: number[];
    dates?: string[];
    effectiveFrom?: string;
    effectiveTo?: string | null;
    priority?: number;
    createdById?: string;
  }) {
    await assertSpaceInOrg(this.prisma, data.spaceId, data.organizationId, { scope: data.scopeSpaceIds, activeOnly: true });
    await assertUserInOrg(this.prisma, data.userId, data.organizationId);
    const shift = await this.getOwnedShift(data.organizationId, data.shiftId, data.scopeSpaceIds);
    // A space-scoped shift can only be rostered in its own space.
    if (shift.spaceId && shift.spaceId !== data.spaceId) {
      throw new BadRequestException('That shift belongs to a different space');
    }
    this.assertRecurrence(data);
    this.assertDayBounds(data.daysOfWeek, data.daysOfMonth);
    const dates = this.parseDates(data.dates);

    const assignment = await this.prisma.shiftAssignment.create({
      data: {
        organizationId: data.organizationId,
        spaceId: data.spaceId,
        userId: data.userId,
        shiftId: data.shiftId,
        recurrence: data.recurrence as any,
        daysOfWeek: data.daysOfWeek ?? [],
        daysOfMonth: data.daysOfMonth ?? [],
        dates,
        effectiveFrom: data.effectiveFrom ? new Date(data.effectiveFrom) : new Date(),
        effectiveTo: data.effectiveTo ? new Date(data.effectiveTo) : null,
        priority: this.clampInt(data.priority, 0, 0, 1000),
        createdById: data.createdById,
      },
      include: {
        shift: { select: { id: true, name: true, startLocal: true, endLocal: true, crossesMidnight: true, color: true } },
        user: { select: { id: true, firstName: true, lastName: true, email: true, avatarUrl: true } },
      },
    });
    this.rematch?.schedule({
      organizationId: data.organizationId,
      userId: data.userId,
      spaceId: data.spaceId,
      from: earliestOf(assignment.effectiveFrom, ...assignment.dates),
      actorId: data.createdById ?? null,
    });
    return success(assignment, 'Assigned to shift');
  }

  async updateAssignment(data: {
    /** Spaces the caller may act in; null = org-wide, [] = none. */
    scopeSpaceIds?: SpaceScopeIds;
    organizationId: string;
    assignmentId: string;
    shiftId?: string;
    recurrence?: string;
    daysOfWeek?: number[];
    daysOfMonth?: number[];
    dates?: string[];
    effectiveFrom?: string;
    effectiveTo?: string | null;
    priority?: number;
    isActive?: boolean;
    /** Who made the change — recorded on any entry it re-matches. */
    actorId?: string;
  }) {
    const existing = await this.prisma.shiftAssignment.findFirst({
      where: { id: data.assignmentId, organizationId: data.organizationId },
    });
    /*
      ⚠️ Same hole deleteAssignment had: loaded by id + organization only, so a
      rota manager for one workspace could rewrite (or switch off) anybody's
      rota line in any workspace. Outside their spaces it reads as not found.
    */
    if (!existing || !scopeAllows(data.scopeSpaceIds, existing.spaceId)) throw new NotFoundException('Assignment not found');

    // Validate against the EFFECTIVE (merged) state, not the patch alone, so you
    // can't end up with e.g. a WEEKLY assignment that has no weekdays.
    const effRecurrence = data.recurrence ?? existing.recurrence;
    const effDaysOfWeek = data.daysOfWeek ?? existing.daysOfWeek;
    const effDaysOfMonth = data.daysOfMonth ?? existing.daysOfMonth;
    const effDates = data.dates !== undefined ? this.parseDates(data.dates) : existing.dates;
    this.assertRecurrence({
      recurrence: effRecurrence,
      daysOfWeek: effDaysOfWeek,
      daysOfMonth: effDaysOfMonth,
      dates: effDates.map((d) => d.toISOString()),
    });
    this.assertDayBounds(data.daysOfWeek, data.daysOfMonth);

    const patch: Record<string, unknown> = {};
    if (data.shiftId !== undefined) {
      const shift = await this.getOwnedShift(data.organizationId, data.shiftId, data.scopeSpaceIds);
      // The create rule, kept on an edit: a space's shift is rostered in its own space only.
      if (shift.spaceId && shift.spaceId !== existing.spaceId) {
        throw new BadRequestException('That shift belongs to a different space');
      }
      patch.shiftId = data.shiftId;
    }
    if (data.recurrence !== undefined) patch.recurrence = data.recurrence;
    if (data.daysOfWeek !== undefined) patch.daysOfWeek = data.daysOfWeek;
    if (data.daysOfMonth !== undefined) patch.daysOfMonth = data.daysOfMonth;
    if (data.dates !== undefined) patch.dates = effDates;
    if (data.effectiveFrom !== undefined) patch.effectiveFrom = new Date(data.effectiveFrom);
    if (data.effectiveTo !== undefined) patch.effectiveTo = data.effectiveTo ? new Date(data.effectiveTo) : null;
    if (data.priority !== undefined) patch.priority = this.clampInt(data.priority, 0, 0, 1000);
    if (data.isActive !== undefined) patch.isActive = data.isActive;

    // When the recurrence type changes, clear the arrays that no longer apply so
    // stale day/date data can't linger and resurface on a later recurrence flip.
    if (data.recurrence !== undefined && data.recurrence !== existing.recurrence) {
      if (data.recurrence !== 'WEEKLY') patch.daysOfWeek = [];
      if (data.recurrence !== 'MONTHLY') patch.daysOfMonth = [];
      if (data.recurrence !== 'ONE_OFF') patch.dates = [];
    }

    const updated = await this.prisma.shiftAssignment.update({ where: { id: existing.id }, data: patch });
    this.rematch?.schedule({
      organizationId: existing.organizationId,
      userId: existing.userId,
      spaceId: existing.spaceId,
      from: earliestOf(existing.effectiveFrom, updated.effectiveFrom, ...updated.dates),
      actorId: data.actorId ?? null,
    });
    return success(updated, 'Assignment updated');
  }

  /** Remove a rota assignment. Hard delete — past attendance is unaffected (it stamped its own expected end at clock-in). */
  async deleteAssignment(data: { organizationId: string; assignmentId: string; scopeSpaceIds?: SpaceScopeIds }) {
    const existing = await this.prisma.shiftAssignment.findFirst({
      where: { id: data.assignmentId, organizationId: data.organizationId },
    });
    /*
      ⚠️ THE SCOPE WAS IGNORED HERE. A rota manager for one workspace could
      delete any assignment in the organization by its id. Outside the caller's
      spaces it reads as not found, like every other rota write.
    */
    if (!existing || !scopeAllows(data.scopeSpaceIds, existing.spaceId)) throw new NotFoundException('Assignment not found');
    await this.prisma.shiftAssignment.delete({ where: { id: existing.id } });
    return success({ id: existing.id }, 'Assignment removed');
  }
}
