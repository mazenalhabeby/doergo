/**
 * What the calendar API returns — one flat list of items, each carrying its LAYER, so the web grid,
 * the phone agenda and the ICS feed draw from the same shape.
 */
export const CALENDAR_LAYERS = ['jobs', 'events', 'crm', 'shifts', 'leave', 'holidays', 'documents'] as const;
export type CalendarLayer = (typeof CALENDAR_LAYERS)[number];

export type CalendarItemKind = 'job' | 'event' | 'reminder' | 'crm' | 'shift' | 'leave' | 'holiday' | 'document';

export type RsvpResponse = 'PENDING' | 'ACCEPTED' | 'MAYBE' | 'DECLINED';
export const RSVP_RESPONSES: readonly RsvpResponse[] = ['PENDING', 'ACCEPTED', 'MAYBE', 'DECLINED'];

export type EventVisibility = 'BUSY' | 'DETAILS';

export interface CalendarItem {
  /** Unique within one response. Occurrences of a repeating event are `${eventId}:${startIso}`. */
  id: string;
  kind: CalendarItemKind;
  layer: CalendarLayer;
  title: string;
  /** Timed: ISO instant. All-day: YYYY-MM-DD. */
  start: string;
  /** Timed: ISO instant. All-day: YYYY-MM-DD, inclusive. */
  end: string;
  allDay: boolean;
  spaceId?: string | null;
  /** Whose item it is (leave, shift) — for the team view. */
  personId?: string | null;
  personName?: string | null;
  /** Leave: PENDING / APPROVED. Event: my response. Job: status. Holiday: ESTIMATED / CONFIRMED / FIXED. */
  status?: string | null;
  /** Where it links to in the app. */
  ref?: { type: 'task' | 'event' | 'customer' | 'timeOff' | 'document'; id: string } | null;
  location?: string | null;
  meetingUrl?: string | null;
  /** An appointment's how (calendar/meeting.ts): the list shows Join for online, Call for phone. */
  meetingMode?: 'IN_PERSON' | 'ONLINE' | 'PHONE' | null;
  phone?: string | null;
  room?: string | null;
  /** Free text kept short: leave type, holiday kind, event organizer, … */
  note?: string | null;
  halfDay?: boolean;
}

/** One workspace's weekend + where its holidays come from — the calendar shades days with it. */
export interface CalendarPlace {
  spaceId: string | null;
  name: string;
  weekend: number[];
  country: string | null;
  region: string | null;
  /** Set on the workspace itself, or inherited from the organization. */
  inherited: { weekend: boolean; holidays: boolean };
  /** Where the holiday country came from — see resolveHolidayPlace. */
  holidaySource?: HolidaySource;
}

/** CHOSEN = picked by hand on the workspace; LOCATION = the workspace's map point; ORGANIZATION = the organization's. */
export type HolidaySource = 'CHOSEN' | 'LOCATION' | 'ORGANIZATION';

/** Bounds on any one calendar read — a range bigger than this is refused, not truncated. */
export const CALENDAR_MAX_RANGE_DAYS = 62;
export const EVENT_TITLE_MAX = 140;
export const EVENT_TEXT_MAX = 2000;
export const EVENT_MAX_ATTENDEES = 50;
export const EVENT_MAX_DURATION_DAYS = 14;
