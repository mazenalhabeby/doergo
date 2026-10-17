/**
 * The company calendar. Gateway: modules/calendar.
 * The phone keeps the range and one event offline (a day's plan must still read
 * with no signal); adding and answering are online.
 */
import type { CalendarPlace, RsvpResponse } from '../../calendar/types';
import type { DayKind } from '../../calendar/days';
import { defineEndpoints, endpoint } from '../core/define';
import { path, withQuery } from '../core/path';
import type { CalendarEventDetail, CalendarEventInput, CalendarPerson, CalendarRange } from '../types';

type Id = { id: string };

export interface CalendarRangeQuery {
  from: string;
  to: string;
  spaceId?: string | null;
  /** Joined with commas on the wire. */
  layers?: string[];
  lang?: string;
}

export const calendarEndpoints = defineEndpoints('calendar', {
  /** Every item the caller may see in a window (≤ 62 days). */
  range: endpoint<CalendarRangeQuery, CalendarRange>({
    method: 'GET',
    path: (q) => withQuery('/calendar', q),
    keep: true,
  }),
  team: endpoint<
    { spaceId: string; from: string; to: string },
    { place: CalendarPlace; holidays: unknown[]; days: { day: string; kind: DayKind }[] }
  >({
    method: 'GET',
    path: (q) => withQuery('/calendar/team', q),
  }),
  people: endpoint<{ q?: string } | void, CalendarPerson[]>({
    method: 'GET',
    path: (q) => withQuery('/calendar/people', q || undefined),
  }),
  availability: endpoint<void, unknown[], { userIds: string[]; from: string; to: string }>({
    method: 'POST',
    path: () => '/calendar/availability',
  }),
  freeSlots: endpoint<
    void,
    { start: string; end: string }[],
    { userIds: string[]; durationMin: number; from?: string; days?: number; timezone?: string }
  >({
    method: 'POST',
    path: () => '/calendar/free-slots',
  }),

  event: endpoint<Id, CalendarEventDetail>({ method: 'GET', path: (a) => path`/calendar/events/${a.id}`, keep: true }),
  create: endpoint<void, CalendarEventDetail, CalendarEventInput>({ method: 'POST', path: () => '/calendar/events' }),
  update: endpoint<Id, CalendarEventDetail, CalendarEventInput>({
    method: 'PATCH',
    path: (a) => path`/calendar/events/${a.id}`,
  }),
  cancel: endpoint<Id, { ok: true }>({ method: 'DELETE', path: (a) => path`/calendar/events/${a.id}` }),
  respond: endpoint<Id, { response: RsvpResponse }, { response: 'ACCEPTED' | 'MAYBE' | 'DECLINED' }>({
    method: 'POST',
    path: (a) => path`/calendar/events/${a.id}/respond`,
  }),
  /** `occurrence` names the occurrence the push was about — the row already points at the next one. */
  snooze: endpoint<Id, { nextRemindAt: string }, { minutes?: number; occurrence?: string }>({
    method: 'POST',
    path: (a) => path`/calendar/events/${a.id}/snooze`,
  }),
  done: endpoint<Id, { nextRemindAt: string | null }, { occurrence?: string }>({
    method: 'POST',
    path: (a) => path`/calendar/events/${a.id}/done`,
  }),

  // ── the member's private ICS link (shown once, hash stored) ──
  feedStatus: endpoint<
    void,
    { allowed: boolean; active: boolean; createdAt: string | null; lastUsedAt: string | null }
  >({ method: 'GET', path: () => '/calendar/feed', keep: false }),
  feedRotate: endpoint<void, { path: string }>({ method: 'POST', path: () => '/calendar/feed' }),
  feedRevoke: endpoint<void, { ok: true }>({ method: 'DELETE', path: () => '/calendar/feed' }),

  // ── weekends and holidays ──
  settings: endpoint<{ year?: number; lang?: string } | void, unknown>({
    method: 'GET',
    path: (q) => withQuery('/calendar/settings', q || undefined),
  }),
  updateSettings: endpoint<
    void,
    { ok: true },
    {
      weekendDays?: number[];
      holidayCountry?: string | null;
      holidayRegion?: string | null;
      calendarFeedsEnabled?: boolean;
    }
  >({
    method: 'PATCH',
    path: () => '/calendar/settings',
  }),
  updateWorkspaceSettings: endpoint<
    { spaceId: string },
    { ok: true },
    { weekendDays?: number[]; holidayCountry?: string | null; holidayRegion?: string | null }
  >({
    method: 'PATCH',
    path: (a) => path`/calendar/settings/workspaces/${a.spaceId}`,
  }),
  holidays: endpoint<{ spaceId?: string | null; year: number; lang?: string }, unknown>({
    method: 'GET',
    path: (q) => withQuery('/calendar/holidays', q),
  }),
  createHoliday: endpoint<void, { id: string }, Record<string, unknown>>({
    method: 'POST',
    path: () => '/calendar/holidays',
  }),
  updateHoliday: endpoint<Id, { id: string }, Record<string, unknown>>({
    method: 'PATCH',
    path: (a) => path`/calendar/holidays/${a.id}`,
  }),
  removeHoliday: endpoint<Id, { ok: true }>({ method: 'DELETE', path: (a) => path`/calendar/holidays/${a.id}` }),
  countries: endpoint<{ lang?: string } | void, { code: string; name: string }[]>({
    method: 'GET',
    path: (q) => withQuery('/calendar/countries', q || undefined),
  }),
  regions: endpoint<{ country: string; lang?: string }, { code: string; name: string }[]>({
    method: 'GET',
    path: ({ country, ...q }) => withQuery(path`/calendar/countries/${country}/regions`, q),
  }),
});
