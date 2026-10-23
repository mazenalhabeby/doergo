import { Injectable, BadRequestException, NotFoundException, Optional } from '@nestjs/common';
import { PrismaService } from '@hbcfield/shared';
import { ShiftRematchService } from '../attendance/shifts/shift-rematch.service';
import { assertSpaceInOrg, assertUserInOrg } from '../../common/tenant-scope.util';
import {
  personName,
  notEndedWhere,
  ABSENCE_WHERE,
  success,
  scopeWhereOn,
  scopeAllows,
  type SpaceScopeIds,
  rotaFor,
  planRotaDay,
  RotaDayRefused,
  dowOfDay,
  toISODateString,
  workspaceSchedulesShifts,
} from '@hbcfield/shared';
import { weekOf } from './shifts-helpers';
import { getOwnedShift } from './shift-rules';

/** The week's rota as the office sees it, and setting one person's day on it. */
@Injectable()
export class RotaService {
  constructor(
    private readonly prisma: PrismaService,
    /*
      A shift added after somebody already clocked in must reach that entry —
      the clock-in matches once and never looks again. Optional only so a unit
      test can build this service bare; the module always provides it.
    */
    @Optional() private readonly rematch?: ShiftRematchService,
  ) {}

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
          ...notEndedWhere(new Date(`${first}T00:00:00.000Z`)),
        },
        include: {
          shift: { select: { id: true, name: true, color: true, startLocal: true, endLocal: true, crossesMidnight: true, isActive: true } },
          user: { select: { id: true, firstName: true, lastName: true, avatarUrl: true, position: true, isActive: true } },
        },
        take: 2000,
      }),
    ]);

    // Everyone in the space, and anyone rostered in it without a membership row.
    const people = new Map<
      string,
      { id: string; firstName: string; lastName: string; avatarUrl: string | null; position: string | null }
    >();
    for (const m of members) people.set(m.user.id, m.user);
    for (const a of assignments) if (a.user?.isActive !== false && a.user) people.set(a.user.id, a.user);
    const ids = [...people.keys()];

    const tracks = workspaceSchedulesShifts(space.workModel);
    const [weekly, leave] = await Promise.all([
      tracks && ids.length
        ? this.prisma.technicianSchedule.findMany({
            where: { technicianId: { in: ids }, isActive: true },
            select: { technicianId: true, dayOfWeek: true, startTime: true, endTime: true },
          })
        : Promise.resolve([] as Array<{ technicianId: string; dayOfWeek: number; startTime: string; endTime: string }>),
      ids.length
        ? this.prisma.timeOff.findMany({
            where: {
              technicianId: { in: ids },
              status: 'APPROVED',
              ...ABSENCE_WHERE,
              startDate: { lte: new Date(`${last}T00:00:00.000Z`) },
              endDate: { gte: new Date(`${first}T00:00:00.000Z`) },
            },
            select: { technicianId: true, startDate: true, endDate: true },
          })
        : Promise.resolve([] as Array<{ technicianId: string; startDate: Date; endDate: Date }>),
    ]);

    const byUser = new Map<string, typeof assignments>();
    for (const a of assignments) byUser.set(a.userId, [...(byUser.get(a.userId) ?? []), a]);
    const shifts = new Map<string, { id: string; name: string; color: string | null; startLocal: string; endLocal: string }>();

    const rows = ids
      .map((id) => {
        const p = people.get(id)!;
        const mine = byUser.get(id) ?? [];
        const cells = days.map((date) => {
          if (
            leave.some(
              (l) =>
                l.technicianId === id && toISODateString(l.startDate) <= date && toISODateString(l.endDate) >= date,
            )
          ) {
            return { date, kind: 'leave' as const };
          }
          const a = rotaFor(mine as never[], date) as (typeof mine)[number] | null;
          if (a?.shift) {
            shifts.set(a.shift.id, a.shift);
            return {
              date,
              kind: 'shift' as const,
              shiftId: a.shift.id,
              start: a.shift.startLocal,
              end: a.shift.endLocal,
              source: a.recurrence === 'ONE_OFF' ? ('once' as const) : ('weekly' as const),
            };
          }
          const w = weekly.find((x) => x.technicianId === id && x.dayOfWeek === dowOfDay(date));
          if (w) return { date, kind: 'schedule' as const, start: w.startTime, end: w.endTime };
          return { date, kind: 'off' as const };
        });
        return {
          userId: id,
          firstName: p.firstName,
          lastName: p.lastName,
          avatarUrl: p.avatarUrl,
          position: p.position,
          days: cells,
        };
      })
      .sort((a, b) => personName(a).localeCompare(personName(b)));

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
      const shift = await getOwnedShift(this.prisma, data.organizationId, data.shiftId, data.editScope);
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
        throw new BadRequestException({
          code: e.code,
          message:
            'A single day off from a standing shift is time off — approve leave for ' + 'it, or set it off every week.',
        });
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
        throw new BadRequestException({
          code: 'OUTRANKED_BY_RULE',
          message: 'Another rule decides this day (daily or monthly). Change it in the ' + 'workspace rota on the web.',
        });
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
}
