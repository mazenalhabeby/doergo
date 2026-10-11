import { Injectable, BadRequestException, NotFoundException, Logger, Optional } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { assertSpaceInOrg, assertUserInOrg } from '../../common/tenant-scope.util';
import { ShiftRematchService } from '../attendance/shift-rematch.service';
import { success, shiftCrossesMidnight, SHIFT_REMINDER_DEFAULTS, SCHEDULE_FLAG_DEFAULT_TOLERANCE_MIN , scopeWhereOn, scopeAllows, type SpaceScopeIds, rotaFor, planRotaDay, RotaDayRefused, dowOfDay, toISODateString, workspaceSchedulesShifts } from '@hbcfield/shared';

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

  constructor(
    private readonly prisma: PrismaService,
    /*
      A shift added after somebody already clocked in must reach that entry —
      the clock-in matches once and never looks again. Optional only so a unit
      test can build this service bare; the module always provides it.
    */
    @Optional() private readonly rematch?: ShiftRematchService,
  ) {}

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

  // ── The week, as the clock-in reads it ─────────────────────────────────

  /**
   * One workspace's week: every member, every day — the shift the clock-in
   * would hold them to, or their personal weekly schedule where the rota says
   * nothing (only in a space that tracks attendance at all), or approved time
   * off. ONE request for the whole week; the page asked once per person.
   *
   * ⚠️ THE ROTA RULE IS `rotaFor` IN SHARED — the resolver's own. Asked of each
   * calendar day in the space's timezone.
   *
   * `viewScope` decides which spaces may be read; `editScope` only answers
   * `canEdit` — the writes check it again for themselves.
   */
  async weekRota(data: {
    organizationId: string;
    viewScope?: SpaceScopeIds;
    editScope?: SpaceScopeIds;
    spaceId?: string;
    /** Any day of the week wanted, YYYY-MM-DD. Defaults to this week. */
    from?: string;
  }) {
    const spaces = await this.prisma.companyLocation.findMany({
      where: { organizationId: data.organizationId, isActive: true, isRemote: false, ...scopeWhereOn('id', data.viewScope) },
      select: { id: true, name: true, timezone: true, workModel: true, isDefault: true },
      orderBy: [{ isDefault: 'desc' }, { name: 'asc' }],
      take: 200,
    });
    const days = weekOf(data.from);
    if (!spaces.length) return success({ spaces: [], space: null, days, shifts: [], people: [], canEdit: false });
    const space = data.spaceId ? spaces.find((x) => x.id === data.spaceId) : spaces[0];
    // A space outside the caller's reach reads as absent, not forbidden.
    if (!space) throw new NotFoundException('Space not found');

    const [first, last] = [days[0]!, days[6]!];
    const [members, assignments] = await Promise.all([
      this.prisma.spaceAssignment.findMany({
        where: { organizationId: data.organizationId, spaceId: space.id, user: { isActive: true } },
        select: { user: { select: { id: true, firstName: true, lastName: true, avatarUrl: true, position: true } } },
        take: 500,
      }),
      this.prisma.shiftAssignment.findMany({
        where: {
          organizationId: data.organizationId,
          spaceId: space.id,
          isActive: true,
          effectiveFrom: { lte: new Date(`${last}T23:59:59.999Z`) },
          OR: [{ effectiveTo: null }, { effectiveTo: { gte: new Date(`${first}T00:00:00.000Z`) } }],
        },
        include: {
          shift: { select: { id: true, name: true, color: true, startLocal: true, endLocal: true, crossesMidnight: true, isActive: true } },
          user: { select: { id: true, firstName: true, lastName: true, avatarUrl: true, position: true, isActive: true } },
        },
        take: 2000,
      }),
    ]);

    // Everyone in the space, and anyone rostered in it without a membership row.
    const people = new Map<string, { id: string; firstName: string; lastName: string; avatarUrl: string | null; position: string | null }>();
    for (const m of members) people.set(m.user.id, m.user);
    for (const a of assignments) if (a.user?.isActive !== false && a.user) people.set(a.user.id, a.user);
    const ids = [...people.keys()];

    const tracks = workspaceSchedulesShifts(space.workModel);
    const [weekly, leave] = await Promise.all([
      tracks && ids.length
        ? this.prisma.technicianSchedule.findMany({ where: { technicianId: { in: ids }, isActive: true }, select: { technicianId: true, dayOfWeek: true, startTime: true, endTime: true } })
        : Promise.resolve([] as Array<{ technicianId: string; dayOfWeek: number; startTime: string; endTime: string }>),
      ids.length
        ? this.prisma.timeOff.findMany({
            where: { technicianId: { in: ids }, status: 'APPROVED', startDate: { lte: new Date(`${last}T00:00:00.000Z`) }, endDate: { gte: new Date(`${first}T00:00:00.000Z`) } },
            select: { technicianId: true, startDate: true, endDate: true },
          })
        : Promise.resolve([] as Array<{ technicianId: string; startDate: Date; endDate: Date }>),
    ]);

    const byUser = new Map<string, typeof assignments>();
    for (const a of assignments) byUser.set(a.userId, [...(byUser.get(a.userId) ?? []), a]);
    const shifts = new Map<string, { id: string; name: string; color: string | null; startLocal: string; endLocal: string }>();

    const rows = ids.map((id) => {
      const p = people.get(id)!;
      const mine = byUser.get(id) ?? [];
      const cells = days.map((date) => {
        if (leave.some((l) => l.technicianId === id && toISODateString(l.startDate) <= date && toISODateString(l.endDate) >= date)) {
          return { date, kind: 'leave' as const };
        }
        const a = rotaFor(mine as never[], date) as (typeof mine)[number] | null;
        if (a?.shift) {
          shifts.set(a.shift.id, a.shift);
          return { date, kind: 'shift' as const, shiftId: a.shift.id, start: a.shift.startLocal, end: a.shift.endLocal, source: a.recurrence === 'ONE_OFF' ? 'once' as const : 'weekly' as const };
        }
        const w = weekly.find((x) => x.technicianId === id && x.dayOfWeek === dowOfDay(date));
        if (w) return { date, kind: 'schedule' as const, start: w.startTime, end: w.endTime };
        return { date, kind: 'off' as const };
      });
      return { userId: id, firstName: p.firstName, lastName: p.lastName, avatarUrl: p.avatarUrl, position: p.position, days: cells };
    }).sort((a, b) => `${a.firstName} ${a.lastName}`.localeCompare(`${b.firstName} ${b.lastName}`));

    // Every shift this space can roster, for the editor's list — not only those in use this week.
    const usable = await this.prisma.shift.findMany({
      where: { organizationId: data.organizationId, isActive: true, OR: [{ spaceId: space.id }, { spaceId: null }] },
      select: { id: true, name: true, color: true, startLocal: true, endLocal: true },
      orderBy: { startLocal: 'asc' },
      take: 100,
    });
    for (const x of usable) shifts.set(x.id, x);

    return success({
      spaces: spaces.map((x) => ({ id: x.id, name: x.name })),
      space: { id: space.id, name: space.name, timezone: space.timezone, tracksAttendance: tracks },
      days,
      shifts: [...shifts.values()],
      people: rows,
      canEdit: scopeAllows(data.editScope, space.id),
    });
  }

  /**
   * Change ONE person's day — a shift or off, that day only or that weekday
   * from now on. The plan is `planRotaDay` in shared (history is ended and
   * continued, never rewritten); it is applied in one transaction and then
   * CHECKED: if the day still does not read as asked (a daily or monthly rule
   * outranks it), nothing is kept and the caller is told.
   */
  async setRotaDay(data: {
    organizationId: string;
    editScope?: SpaceScopeIds;
    spaceId: string;
    userId: string;
    date: string;
    shiftId: string | null;
    repeat: 'once' | 'weekly';
    createdById?: string;
  }) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(data.date ?? '')) throw new BadRequestException('Invalid date');
    if (data.repeat !== 'once' && data.repeat !== 'weekly') throw new BadRequestException('Invalid repeat');
    await assertSpaceInOrg(this.prisma, data.spaceId, data.organizationId, { scope: data.editScope, activeOnly: true });
    await assertUserInOrg(this.prisma, data.userId, data.organizationId);
    if (data.shiftId) {
      const shift = await this.getOwnedShift(data.organizationId, data.shiftId, data.editScope);
      if (shift.spaceId && shift.spaceId !== data.spaceId) throw new BadRequestException('That shift belongs to a different space');
    }

    const existing = await this.prisma.shiftAssignment.findMany({
      where: { organizationId: data.organizationId, spaceId: data.spaceId, userId: data.userId, isActive: true },
      include: { shift: { select: { isActive: true } } },
    });
    let ops;
    try {
      ops = planRotaDay(existing as never[], { date: data.date, shiftId: data.shiftId, repeat: data.repeat });
    } catch (e) {
      if (e instanceof RotaDayRefused) {
        throw new BadRequestException({ code: e.code, message: 'A single day off from a standing shift is time off — approve leave for it, or set it off every week.' });
      }
      throw e;
    }
    const byId = new Map(existing.map((a) => [a.id, a]));
    const day = (s: string) => new Date(`${s}T00:00:00.000Z`);

    await this.prisma.$transaction(async (tx) => {
      for (const op of ops) {
        if (op.kind === 'update') {
          await tx.shiftAssignment.update({
            where: { id: op.id },
            data: {
              ...(op.data.daysOfWeek ? { daysOfWeek: op.data.daysOfWeek } : {}),
              ...(op.data.dates ? { dates: op.data.dates.map(day) } : {}),
              ...(op.data.effectiveTo ? { effectiveTo: day(op.data.effectiveTo) } : {}),
              ...(op.data.isActive === false ? { isActive: false } : {}),
            },
          });
        } else if (op.kind === 'clone') {
          const from = byId.get(op.fromId)!;
          await tx.shiftAssignment.create({
            data: {
              organizationId: data.organizationId, spaceId: data.spaceId, userId: data.userId, shiftId: from.shiftId,
              recurrence: 'WEEKLY', daysOfWeek: op.data.daysOfWeek, effectiveFrom: day(op.data.effectiveFrom),
              effectiveTo: from.effectiveTo, priority: from.priority, createdById: data.createdById,
            },
          });
        } else {
          await tx.shiftAssignment.create({
            data: {
              organizationId: data.organizationId, spaceId: data.spaceId, userId: data.userId, shiftId: op.data.shiftId,
              recurrence: op.data.recurrence, daysOfWeek: op.data.daysOfWeek, dates: op.data.dates.map(day),
              effectiveFrom: day(op.data.effectiveFrom), priority: op.data.priority, createdById: data.createdById,
            },
          });
        }
      }
      // The day must now read as asked, or nothing is kept.
      const after = await tx.shiftAssignment.findMany({
        where: { organizationId: data.organizationId, spaceId: data.spaceId, userId: data.userId, isActive: true },
        include: { shift: { select: { isActive: true } } },
      });
      const decided = rotaFor(after as never[], data.date) as { shiftId: string } | null;
      if ((decided?.shiftId ?? null) !== data.shiftId) {
        throw new BadRequestException({ code: 'OUTRANKED_BY_RULE', message: 'Another rule decides this day (daily or monthly). Change it in the workspace rota on the web.' });
      }
    });
    if (data.shiftId) {
      this.rematch?.schedule({
        organizationId: data.organizationId,
        userId: data.userId,
        spaceId: data.spaceId,
        from: day(data.date),
        actorId: data.createdById ?? null,
      });
    }
    return success({ ok: true });
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

  private async getOwnedShift(organizationId: string, shiftId: string, scope?: SpaceScopeIds) {
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

/** The Monday-to-Sunday week holding `from` (default: today, UTC day), as YYYY-MM-DD. */
export function weekOf(from?: string): string[] {
  const base = from && /^\d{4}-\d{2}-\d{2}$/.test(from) ? new Date(`${from}T00:00:00.000Z`) : new Date(toISODateString(new Date()) + 'T00:00:00.000Z');
  const monday = new Date(base.getTime() - ((base.getUTCDay() + 6) % 7) * 86_400_000);
  return Array.from({ length: 7 }, (_, i) => toISODateString(new Date(monday.getTime() + i * 86_400_000)));
}

/** The earliest of some dates — where a rota change can start to matter. */
function earliestOf(...dates: Array<Date | null | undefined>): Date | null {
  const t = dates.filter((d): d is Date => d instanceof Date && !isNaN(d.getTime())).map((d) => d.getTime());
  return t.length ? new Date(Math.min(...t)) : null;
}
