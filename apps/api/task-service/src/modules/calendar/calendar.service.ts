import { BadRequestException, ForbiddenException, Injectable } from '@nestjs/common';
import {
  personName,
  notEndedWhere,
  zoneOf,
  isAbsence,
  CALENDAR_LAYERS,
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
  type CalendarLayer,
  type CalendarPlace,
  type DayKind,
  TaskStatus,
  toISODateString,
} from '@hbcfield/shared';
import { shiftRuleOf } from '../technicians/cover.service';
import { CalendarRulesService, type PlaceCalendar } from './calendar-rules.service';
import { EventsService, type Caller } from './events.service';
import { EventReadService } from './event-read.service';

const DATE = /^\d{4}-\d{2}-\d{2}$/;
/*
  Jobs the calendar leaves OUT: canceled only — NOT the shared TERMINAL_STATUSES.
  A finished job stays on the day it was done; a canceled one never happened.
  'CANCELLED' is the spelling some custom workflows use for their step key.
*/
const CANCELED_TASK_KEYS: string[] = [TaskStatus.CANCELED, 'CANCELLED'];

export interface ItemsQuery extends Caller {
  from: string;
  to: string;
  spaceId?: string | null;
  layers?: string[];
  lang?: string;
  /** Workspaces where the caller sees ALL the work. undefined = everywhere, [] = only their own. */
  viewTaskSpaces?: string[];
  /** Workspaces where the caller sees the team's leave. undefined = everywhere, [] = nowhere. */
  teamSpaces?: string[];
}

/**
 * The calendar read: one call, every layer the caller may see, for one window.
 *
 * Each layer is a bounded indexed query run in parallel; nothing is fetched for a layer that is
 * switched off. Other people's leave only where the caller leads (the same gate as the cover
 * chart), other people's work only where they see all the work — the calendar never widens what
 * a member could already read elsewhere.
 */
@Injectable()
export class CalendarService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly rules: CalendarRulesService,
    private readonly eventRead: EventReadService,
  ) {}

  private static within(scope: string[] | undefined, spaceId: string) {
    return scope === undefined || scope.includes(spaceId);
  }

  async items(q: ItemsQuery) {
    if (!DATE.test(q.from ?? '') || !DATE.test(q.to ?? '') || q.to < q.from) throw new BadRequestException('from and to are days, from first');
    if (eachDay(q.from, q.to, CALENDAR_MAX_RANGE_DAYS + 2).length > CALENDAR_MAX_RANGE_DAYS) {
      throw new BadRequestException(`At most ${CALENDAR_MAX_RANGE_DAYS} days at a time`);
    }
    const layers = new Set<CalendarLayer>(
      (q.layers?.length ? q.layers : CALENDAR_LAYERS).filter((l): l is CalendarLayer => (CALENDAR_LAYERS as readonly string[]).includes(l)),
    );
    const org = await this.prisma.organization.findUnique({ where: { id: q.organizationId }, select: { timezone: true } });
    const tz = org?.timezone || 'Europe/Vienna';
    const fromAt = zonedWallTimeToUtc(q.from, 0, 0, tz);
    const toAt = zonedWallTimeToUtc(addDaysStr(q.to, 1), 0, 0, tz);
    const spaceId = q.spaceId || null;
    if (spaceId) {
      const s = await this.prisma.companyLocation.findFirst({ where: { id: spaceId, organizationId: q.organizationId }, select: { id: true } });
      if (!s) throw new BadRequestException('Workspace not found');
    }

    // Days: shaded for the workspace being looked at, or for the caller themselves.
    const daysP = (async (): Promise<{ places: PlaceCalendar[]; days: { day: string; kind: DayKind }[] }> => {
      if (spaceId) {
        const p = await this.rules.place(q.organizationId, spaceId, q.from, q.to, q.lang);
        return { places: p ? [p] : [], days: eachDay(q.from, q.to).map((day) => ({ day, kind: p ? dayKind(day, p.rules) : 'work' })) };
      }
      const [{ rules, roster, spaceIds }] = await Promise.all([this.rules.personRules(q.organizationId, q.userId, q.from, q.to)]);
      const map = await this.rules.places(q.organizationId, spaceIds, q.from, q.to, q.lang);
      const places = spaceIds.length ? spaceIds.map((id) => map.get(id)).filter(Boolean) as PlaceCalendar[] : [map.get(null)!].filter(Boolean);
      return { places, days: eachDay(q.from, q.to).map((day) => ({ day, kind: dayKind(day, rules, roster) })) };
    })();

    const [shade, ...lists] = await Promise.all([
      daysP,
      layers.has('events') ? this.eventRead.itemsFor(q, fromAt, toAt) : [],
      layers.has('jobs') ? this.jobs(q, fromAt, toAt, tz, spaceId) : [],
      layers.has('leave') ? this.leave(q, spaceId) : [],
      layers.has('shifts') ? this.shifts(q) : [],
      layers.has('crm') ? this.crm(q, fromAt, toAt) : [],
      layers.has('documents') ? this.documents(q) : [],
    ]);
    const holidays: CalendarItem[] = [];
    if (layers.has('holidays')) {
      const seen = new Set<string>();
      for (const p of shade.places) {
        for (const h of p.holidays) {
          const key = `${h.date}|${h.name}`;
          if (seen.has(key)) continue;
          seen.add(key);
          holidays.push({
            id: `holiday:${p.place.spaceId ?? 'org'}:${h.key}`, kind: 'holiday', layer: 'holidays', title: h.name,
            start: h.date, end: h.endDate, allDay: true, spaceId: p.place.spaceId, status: h.status, halfDay: h.halfDay,
            note: shade.places.length > 1 ? p.place.name : h.kind === 'COMPANY' ? 'COMPANY' : null,
          });
        }
      }
    }
    const items = [...holidays, ...lists.flat()].sort((a, b) => (a.start < b.start ? -1 : a.start > b.start ? 1 : 0));
    const places: CalendarPlace[] = shade.places.map((p) => p.place);
    return success({ from: q.from, to: q.to, timezone: tz, places, days: shade.days, items });
  }

  /** Work with a due date in the window: mine, and — where I see all the work — the workspace's. */
  private async jobs(q: ItemsQuery, fromAt: Date, toAt: Date, tz: string, spaceId: string | null): Promise<CalendarItem[]> {
    const seeSpace = spaceId && CalendarService.within(q.viewTaskSpaces, spaceId);
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
      select: { id: true, title: true, status: true, dueDate: true, spaceId: true, locationAddress: true, estimatedHours: true, priority: true },
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
        id: `job:${t.id}`, kind: 'job' as const, layer: 'jobs' as const, title: t.title,
        start: timed ? due.toISOString() : local.dateStr,
        end: timed ? new Date(due.getTime() + mins * 60000).toISOString() : local.dateStr,
        allDay: !timed, spaceId: t.spaceId, status: t.status, ref: { type: 'task' as const, id: t.id },
        location: t.locationAddress, note: t.priority ?? null,
      };
    });
  }

  /** My leave, and — in a workspace I lead — the team's. */
  private async leave(q: ItemsQuery, spaceId: string | null): Promise<CalendarItem[]> {
    const team = spaceId && CalendarService.within(q.teamSpaces, spaceId);
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
      select: { id: true, technicianId: true, startDate: true, endDate: true, status: true, type: true, kind: true, spaceId: true, workingDays: true, technician: { select: { firstName: true, lastName: true } } },
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
  private async shifts(q: ItemsQuery): Promise<CalendarItem[]> {
    const rows = await this.prisma.shiftAssignment.findMany({
      where: { organizationId: q.organizationId, userId: q.userId, isActive: true },
      select: {
        recurrence: true, daysOfWeek: true, daysOfMonth: true, dates: true, effectiveFrom: true, effectiveTo: true, spaceId: true,
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
          id: `shift:${r.shift.id}:${r.spaceId}:${day}`, kind: 'shift', layer: 'shifts', title: r.shift.name,
          start: s.toISOString(), end: e.toISOString(), allDay: false, spaceId: r.spaceId, note: r.space?.name ?? null,
        });
        if (out.length >= 400) return out;
      }
    }
    return out;
  }

  /** Client follow-ups that are mine (assigned to me, or written by me and assigned to nobody). */
  private async crm(q: ItemsQuery, fromAt: Date, toAt: Date): Promise<CalendarItem[]> {
    const rows = await this.prisma.customerActivity.findMany({
      where: {
        organizationId: q.organizationId, type: 'REMINDER' as any, doneAt: null,
        dueAt: { gte: fromAt, lt: toAt },
        OR: [{ reminderAssigneeId: q.userId }, { reminderAssigneeId: null, authorId: q.userId }],
      },
      select: { id: true, body: true, dueAt: true, reminderKind: true, customer: { select: { id: true, name: true } } },
      take: 300,
    });
    return rows.map((r) => ({
      id: `crm:${r.id}`, kind: 'crm' as const, layer: 'crm' as const,
      title: r.customer.name, note: r.body?.slice(0, 140) ?? r.reminderKind ?? null,
      start: r.dueAt!.toISOString(), end: new Date(r.dueAt!.getTime() + 15 * 60000).toISOString(), allDay: false,
      ref: { type: 'customer' as const, id: r.customer.id },
    }));
  }

  /** My own documents running out in the window. */
  private async documents(q: ItemsQuery): Promise<CalendarItem[]> {
    const rows = await this.prisma.document.findMany({
      where: {
        organizationId: q.organizationId, userId: q.userId, hiddenFromMember: false,
        status: { in: ['ISSUED', 'SIGNED', 'AWAITING_SIGNATURE'] as any },
        expiresOn: { gte: new Date(`${q.from}T00:00:00Z`), lte: new Date(`${q.to}T00:00:00Z`) },
      },
      select: { id: true, title: true, expiresOn: true },
      take: 100,
    });
    return rows.map((d) => ({
      id: `document:${d.id}`, kind: 'document' as const, layer: 'documents' as const, title: d.title,
      start: toISODateString(d.expiresOn!), end: toISODateString(d.expiresOn!), allDay: true,
      ref: { type: 'document' as const, id: d.id },
    }));
  }

  /** What a workspace's day looks like for the whole team — the calendar's Team view. */
  async team(q: Caller & { spaceId: string; from: string; to: string; teamSpaces?: string[] }) {
    if (!q.spaceId || !CalendarService.within(q.teamSpaces, q.spaceId)) throw new ForbiddenException('You do not lead that workspace');
    if (!DATE.test(q.from ?? '') || !DATE.test(q.to ?? '') || q.to < q.from) throw new BadRequestException('from and to are days, from first');
    if (eachDay(q.from, q.to, CALENDAR_MAX_RANGE_DAYS + 2).length > CALENDAR_MAX_RANGE_DAYS) throw new BadRequestException(`At most ${CALENDAR_MAX_RANGE_DAYS} days at a time`);
    const place = await this.rules.place(q.organizationId, q.spaceId, q.from, q.to);
    if (!place) throw new BadRequestException('Workspace not found');
    return success({
      place: place.place,
      holidays: place.holidays,
      days: eachDay(q.from, q.to).map((day) => ({ day, kind: dayKind(day, place.rules) })),
    });
  }
}
