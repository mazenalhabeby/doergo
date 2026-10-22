import { BadRequestException, ForbiddenException, Injectable } from '@nestjs/common';
import {
  personName,
  notEndedWhere,
  zoneOf,
  isAbsence,
  CALENDAR_MAX_RANGE_DAYS,
  PrismaService,
  addDaysStr,
  dayKind,
  eachDay,
  localPartsIn,
  parseHm,
  shiftRuleMatches,
  success,
  zonedWallTimeToUtc,
  type CalendarItem,
  toISODateString,
  expiringDocumentsOf,
  dueClientReminders,
} from '@hbcfield/shared';
import { shiftRuleOf } from '../technicians/cover.service';
import { CalendarRulesService } from './calendar-rules.service';
import { type Caller } from './events.service';
import { EventReadService } from './event-read.service';
import { DATE, CANCELED_TASK_KEYS, ItemsQuery } from './calendar-helpers';

/** Where calendar items come from — moved here unchanged from calendar.service.ts. */
@Injectable()
export abstract class CalendarSourcesBase {
  constructor(
    protected readonly prisma: PrismaService,
    protected readonly rules: CalendarRulesService,
    protected readonly eventRead: EventReadService,
  ) {}

  protected static within(scope: string[] | undefined, spaceId: string) {
    return scope === undefined || scope.includes(spaceId);
  }

  /** Work with a due date in the window: mine, and — where I see all the work — the workspace's. */
  protected async jobs(
    q: ItemsQuery,
    fromAt: Date,
    toAt: Date,
    tz: string,
    spaceId: string | null,
  ): Promise<CalendarItem[]> {
    const seeSpace = spaceId && CalendarSourcesBase.within(q.viewTaskSpaces, spaceId);
    const rows = await this.prisma.task.findMany({
      where: {
        organizationId: q.organizationId,
        dueDate: { gte: new Date(fromAt.getTime() - 86400000), lt: toAt },
        status: { notIn: CANCELED_TASK_KEYS },
        OR: [
          { assignedToId: q.userId },
          { assignees: { some: { userId: q.userId } } },
          ...(seeSpace ? [{ spaceId }] : []),
        ],
        ...(spaceId ? { spaceId } : {}),
      },
      select: {
        id: true,
        title: true,
        status: true,
        dueDate: true,
        spaceId: true,
        locationAddress: true,
        estimatedHours: true,
        priority: true,
      },
      orderBy: { dueDate: 'asc' },
      take: 500,
    });
    return rows.map((t) => {
      const due = t.dueDate!;
      const local = localPartsIn(due, tz);
      // Midnight = a day, not a time (appointment-times rule).
      const timed = local.minutesOfDay !== 0;
      const mins = Math.min(Math.max(Math.round((t.estimatedHours ?? 1) * 60), 30), 12 * 60);
      return {
        id: `job:${t.id}`,
        kind: 'job' as const,
        layer: 'jobs' as const,
        title: t.title,
        start: timed ? due.toISOString() : local.dateStr,
        end: timed ? new Date(due.getTime() + mins * 60000).toISOString() : local.dateStr,
        allDay: !timed,
        spaceId: t.spaceId,
        status: t.status,
        ref: { type: 'task' as const, id: t.id },
        location: t.locationAddress,
        note: t.priority ?? null,
      };
    });
  }

  /** My leave, and — in a workspace I lead — the team's. */
  protected async leave(q: ItemsQuery, spaceId: string | null): Promise<CalendarItem[]> {
    const team = spaceId && CalendarSourcesBase.within(q.teamSpaces, spaceId);
    const rows = await this.prisma.timeOff.findMany({
      where: {
        status: { in: ['PENDING', 'APPROVED'] },
        // Leave, and remote days drawn as their OWN kind (a day worked, not a day off). Changed
        // hours / overtime / other requests are not calendar items.
        kind: { in: ['LEAVE', 'REMOTE'] },
        startDate: { lte: new Date(`${q.to}T00:00:00Z`) },
        endDate: { gte: new Date(`${q.from}T00:00:00Z`) },
        technician: { organizationId: q.organizationId },
        OR: [
          { technicianId: q.userId },
          ...(team ? [{ technician: { spaceAssignments: { some: { spaceId: spaceId!, ...notEndedWhere() } } } }] : []),
        ],
      },
      select: {
        id: true,
        technicianId: true,
        startDate: true,
        endDate: true,
        status: true,
        type: true,
        kind: true,
        spaceId: true,
        workingDays: true,
        technician: { select: { firstName: true, lastName: true } },
      },
      take: 500,
    });
    return rows.map((r) => ({
      ...(isAbsence(r.kind)
        ? { id: `leave:${r.id}`, kind: 'leave' as const, note: r.type as string | null }
        : { id: `remote:${r.id}`, kind: 'remote' as const, note: null, spaceId: r.spaceId }),
      layer: 'leave' as const,
      title: personName(r.technician),
      start: toISODateString(r.startDate),
      end: toISODateString(r.endDate),
      allDay: true,
      personId: r.technicianId,
      personName: personName(r.technician),
      status: r.status,
      ref: { type: 'timeOff' as const, id: r.id },
    }));
  }

  /** My shifts from the rota, in each workspace's own zone. */
  protected async shifts(q: ItemsQuery): Promise<CalendarItem[]> {
    const rows = await this.prisma.shiftAssignment.findMany({
      where: { organizationId: q.organizationId, userId: q.userId, isActive: true },
      select: {
        recurrence: true,
        daysOfWeek: true,
        daysOfMonth: true,
        dates: true,
        effectiveFrom: true,
        effectiveTo: true,
        spaceId: true,
        shift: { select: { id: true, name: true, startLocal: true, endLocal: true, crossesMidnight: true } },
        space: { select: { name: true, timezone: true } },
      },
      take: 50,
    });
    const out: CalendarItem[] = [];
    for (const r of rows) {
      const rule = shiftRuleOf(r);
      const tz = zoneOf(r.space?.timezone);
      const [sh, sm] = parseHm(r.shift.startLocal);
      const [eh, em] = parseHm(r.shift.endLocal);
      for (const day of eachDay(q.from, q.to)) {
        if (!shiftRuleMatches(rule, day)) continue;
        const s = zonedWallTimeToUtc(day, sh, sm, tz);
        const e = zonedWallTimeToUtc(r.shift.crossesMidnight ? addDaysStr(day, 1) : day, eh, em, tz);
        out.push({
          id: `shift:${r.shift.id}:${r.spaceId}:${day}`,
          kind: 'shift',
          layer: 'shifts',
          title: r.shift.name,
          start: s.toISOString(),
          end: e.toISOString(),
          allDay: false,
          spaceId: r.spaceId,
          note: r.space?.name ?? null,
        });
        if (out.length >= 400) return out;
      }
    }
    return out;
  }

  /** Client follow-ups that are mine (assigned to me, or written by me and assigned to nobody). */
  protected async crm(q: ItemsQuery, fromAt: Date, toAt: Date): Promise<CalendarItem[]> {
    const rows = await dueClientReminders(this.prisma, {
      organizationId: q.organizationId,
      userId: q.userId,
      from: fromAt,
      to: toAt,
    });
    return rows.map((r) => ({
      id: `crm:${r.id}`,
      kind: 'crm' as const,
      layer: 'crm' as const,
      title: r.customer.name,
      note: r.body?.slice(0, 140) ?? r.reminderKind ?? null,
      start: r.dueAt!.toISOString(),
      end: new Date(r.dueAt!.getTime() + 15 * 60000).toISOString(),
      allDay: false,
      ref: { type: 'customer' as const, id: r.customer.id },
    }));
  }

  /** My own documents running out in the window. */
  protected async documents(q: ItemsQuery): Promise<CalendarItem[]> {
    const rows = await expiringDocumentsOf(this.prisma, {
      organizationId: q.organizationId,
      userId: q.userId,
      from: new Date(`${q.from}T00:00:00Z`),
      to: new Date(`${q.to}T00:00:00Z`),
    });
    return rows.map((d) => ({
      id: `document:${d.id}`,
      kind: 'document' as const,
      layer: 'documents' as const,
      title: d.title,
      start: toISODateString(d.expiresOn!),
      end: toISODateString(d.expiresOn!),
      allDay: true,
      ref: { type: 'document' as const, id: d.id },
    }));
  }

  /** What a workspace's day looks like for the whole team — the calendar's Team view. */
  async team(q: Caller & { spaceId: string; from: string; to: string; teamSpaces?: string[] }) {
    if (!q.spaceId || !CalendarSourcesBase.within(q.teamSpaces, q.spaceId))
      throw new ForbiddenException('You do not lead that workspace');
    if (!DATE.test(q.from ?? '') || !DATE.test(q.to ?? '') || q.to < q.from)
      throw new BadRequestException('from and to are days, from first');
    if (eachDay(q.from, q.to, CALENDAR_MAX_RANGE_DAYS + 2).length > CALENDAR_MAX_RANGE_DAYS)
      throw new BadRequestException(`At most ${CALENDAR_MAX_RANGE_DAYS} days at a time`);
    const place = await this.rules.place(q.organizationId, q.spaceId, q.from, q.to);
    if (!place) throw new BadRequestException('Workspace not found');
    return success({
      place: place.place,
      holidays: place.holidays,
      days: eachDay(q.from, q.to).map((day) => ({ day, kind: dayKind(day, place.rules) })),
    });
  }
}
