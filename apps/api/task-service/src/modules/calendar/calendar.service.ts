import { BadRequestException, Injectable } from '@nestjs/common';
import {
  CALENDAR_LAYERS,
  CALENDAR_MAX_RANGE_DAYS,
  addDaysStr,
  dayKind,
  eachDay,
  success,
  zonedWallTimeToUtc,
  type CalendarItem,
  type CalendarLayer,
  type CalendarPlace,
  type DayKind,
} from '@hbcfield/shared';
import { type PlaceCalendar } from './calendar-rules.service';
import { DATE, ItemsQuery } from './calendar-helpers';
import { CalendarSourcesBase } from './calendar-sources.base';

export { type ItemsQuery } from './calendar-helpers';

/**
 * The calendar read: one call, every layer the caller may see, for one window.
 *
 * Each layer is a bounded indexed query run in parallel; nothing is fetched for a layer that is
 * switched off. Other people's leave only where the caller leads (the same gate as the cover
 * chart), other people's work only where they see all the work — the calendar never widens what
 * a member could already read elsewhere.
 */
@Injectable()
export class CalendarService extends CalendarSourcesBase {
  async items(q: ItemsQuery) {
    if (!DATE.test(q.from ?? '') || !DATE.test(q.to ?? '') || q.to < q.from)
      throw new BadRequestException('from and to are days, from first');
    if (eachDay(q.from, q.to, CALENDAR_MAX_RANGE_DAYS + 2).length > CALENDAR_MAX_RANGE_DAYS) {
      throw new BadRequestException(`At most ${CALENDAR_MAX_RANGE_DAYS} days at a time`);
    }
    const layers = new Set<CalendarLayer>(
      (q.layers?.length ? q.layers : CALENDAR_LAYERS).filter((l): l is CalendarLayer =>
        (CALENDAR_LAYERS as readonly string[]).includes(l),
      ),
    );
    const spaceId = q.spaceId || null;
    // The organization's zone and the workspace check are independent reads: asked together.
    const [org, space] = await Promise.all([
      this.prisma.organization.findUnique({ where: { id: q.organizationId }, select: { timezone: true } }),
      spaceId
        ? this.prisma.companyLocation.findFirst({
            where: { id: spaceId, organizationId: q.organizationId },
            select: { id: true },
          })
        : null,
    ]);
    if (spaceId && !space) throw new BadRequestException('Workspace not found');
    const tz = org?.timezone || 'Europe/Vienna';
    const fromAt = zonedWallTimeToUtc(q.from, 0, 0, tz);
    const toAt = zonedWallTimeToUtc(addDaysStr(q.to, 1), 0, 0, tz);

    // Days: shaded for the workspace being looked at, or for the caller themselves.
    const daysP = (async (): Promise<{ places: PlaceCalendar[]; days: { day: string; kind: DayKind }[] }> => {
      if (spaceId) {
        const p = await this.rules.place(q.organizationId, spaceId, q.from, q.to, q.lang);
        return {
          places: p ? [p] : [],
          days: eachDay(q.from, q.to).map((day) => ({ day, kind: p ? dayKind(day, p.rules) : 'work' })),
        };
      }
      // The person's days and the places they work in, from one load (they used to be loaded twice).
      const {
        rules,
        roster,
        spaceIds,
        places: map,
      } = await this.rules.personRulesWithPlaces(q.organizationId, q.userId, q.from, q.to, q.lang);
      const places = spaceIds.length
        ? (spaceIds.map((id) => map.get(id)).filter(Boolean) as PlaceCalendar[])
        : [map.get(null)!].filter(Boolean);
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
            id: `holiday:${p.place.spaceId ?? 'org'}:${h.key}`,
            kind: 'holiday',
            layer: 'holidays',
            title: h.name,
            start: h.date,
            end: h.endDate,
            allDay: true,
            spaceId: p.place.spaceId,
            status: h.status,
            halfDay: h.halfDay,
            note: shade.places.length > 1 ? p.place.name : h.kind === 'COMPANY' ? 'COMPANY' : null,
          });
        }
      }
    }
    const items = [...holidays, ...lists.flat()].sort((a, b) => (a.start < b.start ? -1 : a.start > b.start ? 1 : 0));
    const places: CalendarPlace[] = shade.places.map((p) => p.place);
    return success({ from: q.from, to: q.to, timezone: tz, places, days: shade.days, items });
  }
}
