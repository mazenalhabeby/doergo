import { Injectable, BadRequestException, NotFoundException, Logger, Optional } from '@nestjs/common';
import { PrismaService } from '@hbcfield/shared';
import { ShiftRematchService } from '../attendance/shifts/shift-rematch.service';
import { scopeAllows, type SpaceScopeIds } from '@hbcfield/shared';
import { HHMM } from './shifts-helpers';

/**
 * What the shift services share: their dependencies, a shift this organization
 * owns, and the checks on times, dates, day bounds and recurrence.
 */
@Injectable()
export abstract class ShiftsBase {
  protected readonly logger = new Logger(this.constructor.name);

  constructor(
    protected readonly prisma: PrismaService,
    /*
      A shift added after somebody already clocked in must reach that entry —
      the clock-in matches once and never looks again. Optional only so a unit
      test can build this service bare; the module always provides it.
    */
    @Optional() protected readonly rematch?: ShiftRematchService,
  ) {}

  // ── Helpers ──────────────────────────────────────────────────────────────

  protected assertTime(value: string, which: string) {
    if (!HHMM.test(value)) throw new BadRequestException(`Invalid ${which} time (expected HH:MM)`);
  }

  /** Parse ISO/date strings, rejecting anything unparseable (→ 400, not a 500 at the DB). */
  protected parseDates(dates?: string[]): Date[] {
    if (!dates) return [];
    if (!Array.isArray(dates)) throw new BadRequestException('dates must be an array');
    return dates.map((d) => {
      const dt = new Date(d);
      if (isNaN(dt.getTime())) throw new BadRequestException(`Invalid date: ${d}`);
      return dt;
    });
  }

  /** Bounds-check any provided day arrays regardless of recurrence (defense-in-depth). */
  protected assertDayBounds(daysOfWeek?: number[], daysOfMonth?: number[]) {
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

  protected assertRecurrence(data: {
    recurrence: string;
    daysOfWeek?: number[];
    daysOfMonth?: number[];
    dates?: string[];
  }) {
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

  protected clampInt(value: number | undefined, fallback: number, min: number, max: number): number {
    const n = value === undefined || value === null ? fallback : Math.round(value);
    return Math.min(max, Math.max(min, n));
  }

  protected async getOwnedShift(organizationId: string, shiftId: string, scope?: SpaceScopeIds) {
    /*
      Every write on a shift loads it through here, so the scope check belongs
      here too — a shift outside the caller's granted spaces reads as 'not
      found'. Shift.spaceId is nullable (an org-wide shift template), and a
      shift belonging to NO space is not one a space-scoped caller may edit:
      `scopeAllows` refuses a null on purpose.
    */
    const shift = await this.prisma.shift.findFirst({ where: { id: shiftId, organizationId } });
    if (!shift || !scopeAllows(scope, shift.spaceId)) throw new NotFoundException('Shift not found');
    return shift;
  }
}
