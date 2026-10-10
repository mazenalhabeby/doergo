import { call, type ApiResponse } from '../http-client';
import { apiError } from '../server-error';
import type { CalendarAvailability, CalendarEventDetail, CalendarEventInput, CalendarPerson, CalendarRange, CalendarSettings, LeaveCountResult } from './types/calendar';
import { calendarEndpoints, timeOffEndpoints, type CalendarPlace, type DayKind, type ResolvedHoliday, type RsvpResponse } from '@hbcfield/shared/client';

export async function calendarCall<T>(p: Promise<ApiResponse<unknown>>): Promise<T> {
  const r = await p;
  if (r.error) throw apiError(r);
  const body = r.data as { data?: T } | T;
  return ((body as { data?: T })?.data ?? body) as T;
}


export const calendarApi = {
  range: (q: { from: string; to: string; spaceId?: string | null; layers?: string[]; lang?: string }) =>
    calendarCall<CalendarRange>((call(calendarEndpoints.range, {
      from: q.from, to: q.to, spaceId: q.spaceId || undefined, layers: q.layers?.length ? q.layers : undefined, lang: q.lang,
    }) as Promise<ApiResponse<unknown>>)),
  team: (q: { spaceId: string; from: string; to: string }) =>
    calendarCall<{ place: CalendarPlace; holidays: ResolvedHoliday[]; days: { day: string; kind: DayKind }[] }>((call(calendarEndpoints.team, q) as Promise<ApiResponse<unknown>>)),
  people: (q?: string) => calendarCall<CalendarPerson[]>((call(calendarEndpoints.people, undefined, { query: { q: q || undefined } }) as Promise<ApiResponse<unknown>>)),
  availability: (userIds: string[], from: string, to: string) =>
    calendarCall<CalendarAvailability[]>((call(calendarEndpoints.availability, undefined, { body: { userIds, from, to } }) as Promise<ApiResponse<unknown>>)),
  freeSlots: (body: { userIds: string[]; durationMin: number; from?: string; days?: number; timezone?: string }) =>
    calendarCall<{ start: string; end: string }[]>((call(calendarEndpoints.freeSlots, undefined, { body: body }) as Promise<ApiResponse<unknown>>)),

  event: (id: string) => calendarCall<CalendarEventDetail>((call(calendarEndpoints.event, { id }) as Promise<ApiResponse<unknown>>)),
  create: (input: CalendarEventInput) => calendarCall<CalendarEventDetail>((call(calendarEndpoints.create, undefined, { body: input }) as Promise<ApiResponse<unknown>>)),
  update: (id: string, input: CalendarEventInput) => calendarCall<CalendarEventDetail>((call(calendarEndpoints.update, { id }, { body: input }) as Promise<ApiResponse<unknown>>)),
  cancel: (id: string) => calendarCall<{ ok: true }>((call(calendarEndpoints.cancel, { id }) as Promise<ApiResponse<unknown>>)),
  respond: (id: string, response: 'ACCEPTED' | 'MAYBE' | 'DECLINED') =>
    calendarCall<{ response: RsvpResponse }>((call(calendarEndpoints.respond, { id }, { body: { response } }) as Promise<ApiResponse<unknown>>)),

  feedStatus: () => calendarCall<{ allowed: boolean; active: boolean; createdAt: string | null; lastUsedAt: string | null }>((call(calendarEndpoints.feedStatus) as Promise<ApiResponse<unknown>>)),
  feedRotate: () => calendarCall<{ path: string }>((call(calendarEndpoints.feedRotate, undefined, { body: {} }) as Promise<ApiResponse<unknown>>)),
  feedRevoke: () => calendarCall<{ ok: true }>((call(calendarEndpoints.feedRevoke) as Promise<ApiResponse<unknown>>)),

  settings: (year?: number, lang?: string) => calendarCall<CalendarSettings>((call(calendarEndpoints.settings, undefined, { query: { year, lang } }) as Promise<ApiResponse<unknown>>)),
  updateOrg: (body: { weekendDays?: number[]; holidayCountry?: string | null; holidayRegion?: string | null; calendarFeedsEnabled?: boolean }) =>
    calendarCall<{ ok: true }>((call(calendarEndpoints.updateSettings, undefined, { body: body }) as Promise<ApiResponse<unknown>>)),
  updateWorkspace: (spaceId: string, body: { weekendDays?: number[]; holidayCountry?: string | null; holidayRegion?: string | null }) =>
    calendarCall<{ ok: true }>((call(calendarEndpoints.updateWorkspaceSettings, { spaceId }, { body: body }) as Promise<ApiResponse<unknown>>)),
  holidays: (q: { spaceId?: string | null; year: number; lang?: string }) =>
    calendarCall<{ year: number; place: CalendarPlace; holidays: (ResolvedHoliday & { removed?: boolean })[] }>(
      (call(calendarEndpoints.holidays, { spaceId: q.spaceId || undefined, year: q.year, lang: q.lang }) as Promise<ApiResponse<unknown>>),
    ),
  saveHoliday: (body: { id?: string | null; spaceId?: string | null; libraryKey?: string | null; date: string; days?: number; name: string; halfDay?: boolean; confirmed?: boolean; removed?: boolean }) => {
    const { id, ...rest } = body;
    return calendarCall<{ id: string }>(id ? (call(calendarEndpoints.updateHoliday, { id }, { body: rest }) as Promise<ApiResponse<unknown>>) : (call(calendarEndpoints.createHoliday, undefined, { body: rest }) as Promise<ApiResponse<unknown>>));
  },
  removeHoliday: (id: string) => calendarCall<{ ok: true }>((call(calendarEndpoints.removeHoliday, { id }) as Promise<ApiResponse<unknown>>)),
  countries: (lang?: string) => calendarCall<{ code: string; name: string }[]>((call(calendarEndpoints.countries, undefined, { query: { lang } }) as Promise<ApiResponse<unknown>>)),
  regions: (country: string, lang?: string) =>
    calendarCall<{ code: string; name: string }[]>((call(calendarEndpoints.regions, { country }, { query: { lang } }) as Promise<ApiResponse<unknown>>)),

  /** What a leave range would cost this person — weekends, rota rest days and holidays left out. */
  countLeave: (personId: string, from: string, to: string) =>
    calendarCall<LeaveCountResult>((call(timeOffEndpoints.count, { employeeId: personId, from, to }) as Promise<ApiResponse<unknown>>)),
}
