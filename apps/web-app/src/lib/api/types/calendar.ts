import type { CalendarItem, CalendarPlace, DayKind, EventVisibility, Repeat, RsvpResponse } from '@hbcfield/shared/client';

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
  space: { id: string; name: string } | null;
  customer: { id: string; name: string } | null;
  /** How and where (shared calendar/meeting.ts). */
  meetingMode: 'IN_PERSON' | 'ONLINE' | 'PHONE' | null;
  placeKind: 'OFFICE' | 'CLIENT_SITE' | 'ADDRESS' | null;
  placeSpace: { id: string; name: string; address: string | null; lat: number | null; lng: number | null } | null;
  room: string | null;
  phone: string | null;
  callDirection: 'OUTGOING' | 'INCOMING' | null;
  organizerId: string;
  canEdit: boolean;
  myResponse: RsvpResponse;
  attendees: CalendarAttendee[];
}


export interface CalendarEventInput {
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


export interface CalendarPerson { id: string; firstName: string; lastName: string; avatarUrl?: string | null; position?: string | null }

export interface CalendarAvailability {
  userId: string;
  firstName: string;
  lastName: string;
  busy: { start: string; end: string }[];
  days: { day: string; kind: DayKind; leave: 'APPROVED' | 'PENDING' | null }[];
}


export interface CalendarSettings {
  year: number;
  organization: {
    weekendDays: number[]; holidayCountry: string | null; holidayRegion: string | null; addressCountry: string | null;
    calendarFeedsEnabled: boolean; holidayCount: number; estimatedCount: number; country: string | null; region: string | null; weekend: number[];
  };
  workspaces: {
    id: string; name: string; weekendDays: number[]; holidayCountry: string | null; holidayRegion: string | null; people: number;
    holidayCount: number; estimatedCount: number; country: string | null; region: string | null; weekend: number[];
    inherited: { weekend: boolean; holidays: boolean };
    /** CHOSEN by hand · LOCATION from its map point · ORGANIZATION inherited. */
    holidaySource: "CHOSEN" | "LOCATION" | "ORGANIZATION";
    detectedCountry: string | null; detectedRegion: string | null; hasLocation: boolean;
    /** Holiday changes on this workspace are its own (else the organization's). */
    ownList: boolean;
  }[];
}


export interface LeaveCountResult {
  from: string; to: string; calendarDays: number; counted: number; restDays: number;
  holidays: { day: string; name: string; halfDay: boolean; estimated: boolean }[];
  byYear: Record<string, number>;
  days: { day: string; kind: DayKind; cost: number; holiday: string | null }[];
}
