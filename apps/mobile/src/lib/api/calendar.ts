import type {
  CalendarEventDetail, CalendarEventInput, CalendarPerson, CalendarRange, LeaveCount, RsvpResponse,
} from '@hbcfield/shared/client';
import { call, E } from './client';

/** The organization's own calendar (shared calendar/*) — the same endpoints the web reads. */

export type { CalendarRange, CalendarEventDetail, CalendarEventInput, CalendarPerson, LeaveCount };

export const calendarApi = {
  range: (q: { from: string; to: string; spaceId?: string | null; layers?: string[]; lang?: string }): Promise<CalendarRange> =>
    call(E.calendar.range, {
      from: q.from, to: q.to, spaceId: q.spaceId || undefined, layers: q.layers?.length ? q.layers : undefined, lang: q.lang,
    }),
  event: (eventId: string): Promise<CalendarEventDetail> => call(E.calendar.event, { id: eventId }),
  create: (input: CalendarEventInput & { id?: string }): Promise<CalendarEventDetail> =>
    call(E.calendar.create, undefined, { body: input }),
  update: (eventId: string, input: CalendarEventInput): Promise<CalendarEventDetail> =>
    call(E.calendar.update, { id: eventId }, { body: input }),
  cancel: (eventId: string): Promise<{ ok: true }> => call(E.calendar.cancel, { id: eventId }),
  respond: (eventId: string, response: 'ACCEPTED' | 'MAYBE' | 'DECLINED'): Promise<{ response: RsvpResponse }> =>
    call(E.calendar.respond, { id: eventId }, { body: { response } }),
  /** `occurrence` = the one the push announced; without it, the next one the server has planned. */
  snooze: (eventId: string, minutes = 10, occurrence?: string): Promise<{ nextRemindAt: string }> =>
    call(E.calendar.snooze, { id: eventId }, { body: { minutes, ...(occurrence ? { occurrence } : {}) } }),
  done: (eventId: string, occurrence?: string): Promise<{ nextRemindAt: string | null }> =>
    call(E.calendar.done, { id: eventId }, { body: occurrence ? { occurrence } : {} }),
  people: (q?: string): Promise<CalendarPerson[]> =>
    call(E.calendar.people, { q: q || undefined }),
  /** What a leave range would cost — the server's count, the one the request is charged by. */
  countLeave: (personId: string, from: string, to: string): Promise<LeaveCount> =>
    call(E.timeOff.count, { employeeId: personId, from, to }),
};
