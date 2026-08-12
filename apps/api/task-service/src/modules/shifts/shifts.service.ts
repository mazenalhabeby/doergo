import { Injectable, BadRequestException, NotFoundException, Logger } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { success, shiftCrossesMidnight, SHIFT_REMINDER_DEFAULTS, SCHEDULE_FLAG_DEFAULT_TOLERANCE_MIN } from '@hbcfield/shared';

const HHMM = /^([01]\d|2[0-3]):([0-5]\d)$/;

/**
 * CRUD for shift definitions and the rota (ShiftAssignment). These are what the
 * shift resolver reads at clock-in. Org-scoped throughout: organizationId comes
 * from the caller's token, and any spaceId/userId/shiftId is verified to belong
 * to that org before use.
 */
@Injectable()
export class ShiftsService {
  private readonly logger = new Logger(ShiftsService.name);

  constructor(private readonly prisma: PrismaService) {}

  // ── Shifts ─────────────────────────────────────────────────────────────

  /** List shifts for an org; optionally only those usable in a given space (space-scoped + org-wide). */
  async listShifts(data: { organizationId: string; spaceId?: string }) {
    const where: any = { organizationId: data.organizationId };
    if (data.spaceId) where.OR = [{ spaceId: data.spaceId }, { spaceId: null }];
    const shifts = await this.prisma.shift.findMany({
      where,
      orderBy: [{ isActive: 'desc' }, { startLocal: 'asc' }],
      include: { _count: { select: { assignments: true } } },
    });
    return success(shifts);
  }

  async createShift(data: {
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
    if (data.spaceId) await this.assertSpaceInOrg(data.organizationId, data.spaceId);

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
    const shift = await this.getOwnedShift(data.organizationId, data.shiftId);

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
    return success(updated, 'Shift updated');
  }

  async deleteShift(data: { organizationId: string; shiftId: string }) {
    const shift = await this.getOwnedShift(data.organizationId, data.shiftId);
    // Cascades to its rota assignments (schema onDelete: Cascade).
    await this.prisma.shift.delete({ where: { id: shift.id } });
    return success({ id: shift.id }, 'Shift deleted');
  }

  // ── Rota (assignments) ───────────────────────────────────────────────────

  /** Active rota for a space (optionally including ended assignments). */
  async listAssignments(data: { organizationId: string; spaceId: string; includeEnded?: boolean }) {
    await this.assertSpaceInOrg(data.organizationId, data.spaceId);
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
    await this.assertSpaceInOrg(data.organizationId, data.spaceId);
    await this.assertUserInOrg(data.organizationId, data.userId);
    const shift = await this.getOwnedShift(data.organizationId, data.shiftId);
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
    return success(assignment, 'Assigned to shift');
  }

  async updateAssignment(data: {
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
  }) {
    const existing = await this.prisma.shiftAssignment.findFirst({
      where: { id: data.assignmentId, organizationId: data.organizationId },
    });
    if (!existing) throw new NotFoundException('Assignment not found');

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
      await this.getOwnedShift(data.organizationId, data.shiftId);
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
    return success(updated, 'Assignment updated');
  }

  /** Remove a rota assignment. Hard delete — past attendance is unaffected (it stamped its own expected end at clock-in). */
  async deleteAssignment(data: { organizationId: string; assignmentId: string }) {
    const existing = await this.prisma.shiftAssignment.findFirst({
      where: { id: data.assignmentId, organizationId: data.organizationId },
    });
    if (!existing) throw new NotFoundException('Assignment not found');
    await this.prisma.shiftAssignment.delete({ where: { id: existing.id } });
    return success({ id: existing.id }, 'Assignment removed');
  }

  // ── Helpers ──────────────────────────────────────────────────────────────

  private assertTime(value: string, which: string) {
    if (!HHMM.test(value)) throw new BadRequestException(`Invalid ${which} time (expected HH:MM)`);
  }

  /** Parse ISO/date strings, rejecting anything unparseable (→ 400, not a 500 at the DB). */
  private parseDates(dates?: string[]): Date[] {
    if (!dates) return [];
    if (!Array.isArray(dates)) throw new BadRequestException('dates must be an array');
    return dates.map((d) => {
      const dt = new Date(d);
      if (isNaN(dt.getTime())) throw new BadRequestException(`Invalid date: ${d}`);
      return dt;
    });
  }

  /** Bounds-check any provided day arrays regardless of recurrence (defense-in-depth). */
  private assertDayBounds(daysOfWeek?: number[], daysOfMonth?: number[]) {
    if (daysOfWeek !== undefined) {
      if (!Array.isArray(daysOfWeek)) throw new BadRequestException('daysOfWeek must be an array');
      if (daysOfWeek.some((d) => !Number.isInteger(d) || d < 0 || d > 6)) {
        throw new BadRequestException('Weekday must be an integer 0-6');
      }
    }
    if (daysOfMonth !== undefined) {
      if (!Array.isArray(daysOfMonth)) throw new BadRequestException('daysOfMonth must be an array');
      if (daysOfMonth.some((d) => !Number.isInteger(d) || d < 1 || d > 31)) {
        throw new BadRequestException('Day of month must be an integer 1-31');
      }
    }
  }

  private assertRecurrence(data: { recurrence: string; daysOfWeek?: number[]; daysOfMonth?: number[]; dates?: string[] }) {
    switch (data.recurrence) {
      case 'DAILY':
        return;
      case 'WEEKLY':
        if (!data.daysOfWeek?.length) throw new BadRequestException('Weekly recurrence needs at least one weekday');
        if (data.daysOfWeek.some((d) => d < 0 || d > 6)) throw new BadRequestException('Weekday must be 0-6');
        return;
      case 'MONTHLY':
        if (!data.daysOfMonth?.length) throw new BadRequestException('Monthly recurrence needs at least one day of month');
        if (data.daysOfMonth.some((d) => d < 1 || d > 31)) throw new BadRequestException('Day of month must be 1-31');
        return;
      case 'ONE_OFF':
        if (!data.dates?.length) throw new BadRequestException('One-off recurrence needs at least one date');
        return;
      default:
        throw new BadRequestException('Invalid recurrence');
    }
  }

  private clampInt(value: number | undefined, fallback: number, min: number, max: number): number {
    const n = value === undefined || value === null ? fallback : Math.round(value);
    return Math.min(max, Math.max(min, n));
  }

  private async getOwnedShift(organizationId: string, shiftId: string) {
    const shift = await this.prisma.shift.findFirst({ where: { id: shiftId, organizationId } });
    if (!shift) throw new NotFoundException('Shift not found');
    return shift;
  }

  private async assertSpaceInOrg(organizationId: string, spaceId: string) {
    const space = await this.prisma.companyLocation.findFirst({ where: { id: spaceId, organizationId }, select: { id: true } });
    if (!space) throw new NotFoundException('Space not found');
  }

  private async assertUserInOrg(organizationId: string, userId: string) {
    const user = await this.prisma.user.findFirst({ where: { id: userId, organizationId }, select: { id: true } });
    if (!user) throw new NotFoundException('User not found in this organization');
  }
}
