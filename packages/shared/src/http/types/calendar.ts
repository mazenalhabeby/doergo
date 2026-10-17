/** Answer shapes for the calendar, and the support widget's settings. */
import type { CalendarItem, CalendarPlace, EventVisibility, RsvpResponse } from '../../calendar/types';
import type { DayKind } from '../../calendar/days';
import type { Repeat } from '../../calendar/recurrence';

// ── calendar ─────────────────────────────────────────────────────────────────

export interface CalendarRange {
  from: string;
  to: string;
  timezone: string;
  places: CalendarPlace[];
  days: { day: string; kind: DayKind }[];
  items: CalendarItem[];
}

export interface CalendarAttendee {
  userId: string;
  response: RsvpResponse;
  isOrganizer: boolean;
  firstName: string;
  lastName: string;
  avatarUrl?: string | null;
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
  space?: { id: string; name: string } | null;
  customer?: { id: string; name: string } | null;
  /** How and where (shared calendar/meeting.ts). */
  meetingMode?: 'IN_PERSON' | 'ONLINE' | 'PHONE' | null;
  placeKind?: 'OFFICE' | 'CLIENT_SITE' | 'ADDRESS' | null;
  placeSpace?: { id: string; name: string; address: string | null; lat: number | null; lng: number | null } | null;
  room?: string | null;
  phone?: string | null;
  callDirection?: 'OUTGOING' | 'INCOMING' | null;
  organizerId: string;
  canEdit: boolean;
  myResponse: RsvpResponse;
  attendees: CalendarAttendee[];
}

export interface CalendarEventInput {
  /** A client-made id, so a retried create is the same event. */
  id?: string;
  kind?: 'APPOINTMENT' | 'REMINDER';
  title?: string;
  description?: string | null;
  location?: string | null;
  meetingUrl?: string | null;
  customerId?: string | null;
  spaceId?: string | null;
  allDay?: boolean;
  startAt?: string;
  endAt?: string;
  startDate?: string;
  endDate?: string;
  timezone?: string;
  repeat?: Repeat | null;
  reminders?: number[];
  visibility?: EventVisibility;
  attendeeIds?: string[];
  meetingMode?: 'IN_PERSON' | 'ONLINE' | 'PHONE' | null;
  placeKind?: 'OFFICE' | 'CLIENT_SITE' | 'ADDRESS' | null;
  placeSpaceId?: string | null;
  room?: string | null;
  phone?: string | null;
  callDirection?: 'OUTGOING' | 'INCOMING' | null;
}

export interface CalendarPerson {
  id: string;
  firstName: string;
  lastName: string;
  avatarUrl?: string | null;
  position?: string | null;
}

// ── support ──────────────────────────────────────────────────────────────────

export interface SupportConfig {
  tier: string | null;
  slaBusinessMinutes: number;
  liveChat: boolean;
  priorityRouting: boolean;
  dedicatedSupport: boolean;
}
