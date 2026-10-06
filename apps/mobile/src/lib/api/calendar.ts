import {
  buildUrlWithQuery,
  type CalendarItem, type CalendarPlace, type DayKind, type Repeat, type RsvpResponse, type EventVisibility,
} from '@hbcfield/shared/client';
import { fetchWithAuth } from './client';

/** The organization's own calendar (shared calendar/*) — the same endpoints the web reads. */

export interface CalendarRange {
  from: string;
  to: string;
  timezone: string;
  places: CalendarPlace[];
  days: { day: string; kind: DayKind }[];
  items: CalendarItem[];
}

export interface CalendarEventDetail {
  id: string;
  kind: 'APPOINTMENT' | 'REMINDER';
  title: string;
  description: string | null;
  location: string | null;
  meetingUrl: string | null;
  startAt: string;
  endAt: string;
  allDay: boolean;
  timezone: string;
  repeat: Repeat | null;
  reminders: number[];
  visibility: EventVisibility;
  canceled: boolean;
  organizerId: string;
  canEdit: boolean;
  myResponse: RsvpResponse;
  attendees: { userId: string; response: RsvpResponse; isOrganizer: boolean; firstName: string; lastName: string; avatarUrl?: string | null }[];
}

export interface CalendarEventInput {
  kind?: 'APPOINTMENT' | 'REMINDER';
  title?: string;
  description?: string | null;
  location?: string | null;
  meetingUrl?: string | null;
  allDay?: boolean;
  startAt?: string;
  endAt?: string;
  startDate?: string;
  endDate?: string;
  timezone?: string;
  repeat?: Repeat | null;
  reminders?: number[];
  attendeeIds?: string[];
}

export interface CalendarPerson { id: string; firstName: string; lastName: string; avatarUrl?: string | null; position?: string | null }

export interface LeaveCount {
  calendarDays: number;
  counted: number;
  restDays: number;
  holidays: { day: string; name: string; halfDay: boolean; estimated: boolean }[];
  days: { day: string; kind: DayKind; cost: number; holiday: string | null }[];
}

const id = (v: string) => encodeURIComponent(v);

export const calendarApi = {
  range: (q: { from: string; to: string; spaceId?: string | null; layers?: string[]; lang?: string }): Promise<CalendarRange> =>
    fetchWithAuth<CalendarRange>(buildUrlWithQuery('/calendar', {
      from: q.from, to: q.to, spaceId: q.spaceId || undefined, layers: q.layers?.join(',') || undefined, lang: q.lang,
    }), { method: 'GET' }),
  event: (eventId: string): Promise<CalendarEventDetail> => fetchWithAuth(`/calendar/events/${id(eventId)}`, { method: 'GET' }),
  create: (input: CalendarEventInput & { id?: string }): Promise<CalendarEventDetail> =>
    fetchWithAuth('/calendar/events', { method: 'POST', body: JSON.stringify(input) }),
  update: (eventId: string, input: CalendarEventInput): Promise<CalendarEventDetail> =>
    fetchWithAuth(`/calendar/events/${id(eventId)}`, { method: 'PATCH', body: JSON.stringify(input) }),
  cancel: (eventId: string): Promise<{ ok: true }> => fetchWithAuth(`/calendar/events/${id(eventId)}`, { method: 'DELETE' }),
  respond: (eventId: string, response: 'ACCEPTED' | 'MAYBE' | 'DECLINED'): Promise<{ response: RsvpResponse }> =>
    fetchWithAuth(`/calendar/events/${id(eventId)}/respond`, { method: 'POST', body: JSON.stringify({ response }) }),
  snooze: (eventId: string, minutes = 10): Promise<{ nextRemindAt: string }> =>
    fetchWithAuth(`/calendar/events/${id(eventId)}/snooze`, { method: 'POST', body: JSON.stringify({ minutes }) }),
  done: (eventId: string): Promise<{ nextRemindAt: string | null }> =>
    fetchWithAuth(`/calendar/events/${id(eventId)}/done`, { method: 'POST', body: JSON.stringify({}) }),
  people: (q?: string): Promise<CalendarPerson[]> =>
    fetchWithAuth(buildUrlWithQuery('/calendar/people', { q: q || undefined }), { method: 'GET' }),
  /** What a leave range would cost — the server's count, the one the request is charged by. */
  countLeave: (personId: string, from: string, to: string): Promise<LeaveCount> =>
    fetchWithAuth(buildUrlWithQuery(`/employees/${id(personId)}/time-off/count`, { from, to }), { method: 'GET' }),
};
