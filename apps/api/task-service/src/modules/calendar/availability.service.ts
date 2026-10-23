import { BadRequestException, Injectable } from '@nestjs/common';
import {
  notEndedWhere,
  ABSENCE_WHERE,
  addDaysStr,
  dayKind,
  findFreeSlots,
  localPartsIn,
  occurrences,
  success,
  type Repeat,
  toISODateString,
  peopleNames,
  PrismaService,
} from '@hbcfield/shared';
import { DAY, ISO, Caller, validZone, orgZoneOf } from './events-helpers';
import { CalendarRulesService } from './calendar-rules.service';
import { EventPeopleService } from './event-people.service';
import { EventViewService } from './event-view.service';

/** Free/busy and finding a time that suits everybody. */
@Injectable()
export class AvailabilityService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly rules: CalendarRulesService,
    private readonly invitees: EventPeopleService,
    private readonly view: EventViewService,
  ) {}

  /**
   * Free / busy for colleagues around a time — the invite dialog's strips. Times only, never titles.
   */
  async availability(dto: Caller & { userIds: string[]; from: string; to: string }) {
    if (!ISO.test(dto.from ?? '') || !ISO.test(dto.to ?? '')) throw new BadRequestException('from and to are instants');
    const from = new Date(dto.from),
      to = new Date(dto.to);
    if (!(to > from) || to.getTime() - from.getTime() > 14 * DAY)
      throw new BadRequestException('At most two weeks at a time');
    const people = await this.invitees.inviteable(dto, (dto.userIds ?? []).slice(0, 20));
    const ids = [dto.userId, ...people.keys()];
    const [events, leave, users] = await Promise.all([
      this.view.eventsFor(dto.organizationId, ids, from, to),
      this.prisma.timeOff.findMany({
        where: {
          technicianId: { in: ids },
          status: { in: ['APPROVED', 'PENDING'] },
          ...ABSENCE_WHERE,
          startDate: { lte: to },
          endDate: { gte: new Date(from.getTime() - DAY) },
        },
        select: { technicianId: true, startDate: true, endDate: true, status: true },
      }),
      peopleNames(this.prisma, ids),
    ]);
    const tz = await orgZoneOf(this.prisma, dto.organizationId);
    const fromKey = localPartsIn(from, tz).dateStr,
      toKey = localPartsIn(to, tz).dateStr;
    const [rulesOf, team] = await Promise.all([
      this.rules.personRulesMany(dto.organizationId, ids, fromKey, toKey),
      this.teamOf(dto, ids),
    ]);
    const out = [];
    for (const u of users) {
      const busy: { start: string; end: string }[] = [];
      for (const ev of events.filter((e) => e.attendees.some((a) => a.userId === u.id && a.response !== 'DECLINED'))) {
        const dur = ev.endAt.getTime() - ev.startAt.getTime();
        for (const s of occurrences(ev.startAt, dur, (ev.repeat as Repeat | null) ?? null, ev.timezone, from, to)) {
          busy.push({ start: s.toISOString(), end: new Date(s.getTime() + dur).toISOString() });
        }
      }
      const r = rulesOf.get(u.id);
      /*
        Somebody's LEAVE (and their rota) is told only to who leads them — the cover chart's rule.
        Anybody else learns "not working that day", never why.
      */
      const sees = u.id === dto.userId || team.has(u.id);
      const days: { day: string; kind: string; leave: 'APPROVED' | 'PENDING' | null }[] = [];
      for (let d = fromKey; d <= toKey; d = addDaysStr(d, 1)) {
        const l = leave.find(
          (x) => x.technicianId === u.id && toISODateString(x.startDate) <= d && toISODateString(x.endDate) >= d,
        );
        const kind = r ? dayKind(d, r.rules, r.roster) : 'work';
        if (sees) days.push({ day: d, kind, leave: (l?.status as 'APPROVED' | 'PENDING') ?? null });
        else
          days.push({ day: d, kind: kind === 'work' && !(l && l.status === 'APPROVED') ? 'work' : 'off', leave: null });
      }
      out.push({ userId: u.id, firstName: u.firstName, lastName: u.lastName, busy, days });
    }
    return success(out);
  }

  /** Of these people, the ones the caller leads (their leave may be shown). */
  private async teamOf(caller: Caller, ids: string[]): Promise<Set<string>> {
    if (caller.teamSpaces === undefined) return new Set(ids);
    if (!caller.teamSpaces.length) return new Set();
    const rows = await this.prisma.spaceAssignment.findMany({
      where: {
        organizationId: caller.organizationId,
        userId: { in: ids },
        spaceId: { in: caller.teamSpaces },
        ...notEndedWhere(),
      },
      select: { userId: true },
    });
    return new Set(rows.map((r) => r.userId));
  }

  /** The next times everybody is free, inside working days and hours. */
  async freeSlots(
    dto: Caller & { userIds: string[]; durationMin: number; from?: string; days?: number; timezone?: string },
  ) {
    const dur = Number(dto.durationMin);
    if (!Number.isInteger(dur) || dur < 5 || dur > 8 * 60)
      throw new BadRequestException('Duration 5 minutes to 8 hours');
    const days = Math.min(Math.max(Number(dto.days) || 10, 1), 30);
    const from = dto.from && ISO.test(dto.from) ? new Date(dto.from) : new Date();
    const start = new Date(Math.max(from.getTime(), Date.now()));
    const to = new Date(start.getTime() + days * DAY);
    const people = await this.invitees.inviteable(dto, (dto.userIds ?? []).slice(0, 20));
    const ids = [dto.userId, ...people.keys()];
    const tz = validZone(dto.timezone) ? dto.timezone : await orgZoneOf(this.prisma, dto.organizationId);
    const fromKey = localPartsIn(start, tz).dateStr,
      toKey = localPartsIn(to, tz).dateStr;
    const [events, leave] = await Promise.all([
      this.view.eventsFor(dto.organizationId, ids, start, to),
      this.prisma.timeOff.findMany({
        where: {
          technicianId: { in: ids },
          status: 'APPROVED',
          ...ABSENCE_WHERE,
          startDate: { lte: to },
          endDate: { gte: start },
        },
        select: { technicianId: true, startDate: true, endDate: true },
      }),
    ]);
    const rulesOf = await this.rules.personRulesMany(dto.organizationId, ids, fromKey, toKey);
    const persons = ids.map((id) => {
      const r = rulesOf.get(id);
      const busy = events
        .filter((e) => e.attendees.some((a) => a.userId === id))
        .flatMap((ev) => {
          const d = ev.endAt.getTime() - ev.startAt.getTime();
          return occurrences(ev.startAt, d, (ev.repeat as Repeat | null) ?? null, ev.timezone, start, to).map((s) => ({
            start: s,
            end: new Date(s.getTime() + d),
          }));
        });
      const myLeave = leave.filter((l) => l.technicianId === id);
      return {
        busy,
        works: (day: string) =>
          (!r || dayKind(day, r.rules, r.roster) === 'work') &&
          !myLeave.some((l) => toISODateString(l.startDate) <= day && toISODateString(l.endDate) >= day),
      };
    });
    const slots = findFreeSlots({ people: persons, timezone: tz, durationMin: dur, from: start, days, limit: 3 });
    return success(slots.map((s) => ({ start: s.start.toISOString(), end: s.end.toISOString() })));
  }
}
