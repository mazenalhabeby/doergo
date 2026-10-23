import { PrismaService, addDaysStr, occurrences, orgTimezone, type Repeat, type ReminderEvent } from '@hbcfield/shared';
import type { CalendarCaller, CalendarEventMessage } from '@hbcfield/shared/microservices';

const DAY = 86400000;

const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{1,3})?)?(Z|[+-]\d{2}:?\d{2})$/;

const DATE = /^\d{4}-\d{2}-\d{2}$/;

/** The caller, as the gateway resolved it from the token — never from the body. */
export type Caller = CalendarCaller;

/** The event as sent — the message contract's type. */
export type EventInput = CalendarEventMessage;

const MEETING_KEYS = [
  'meetingMode',
  'placeKind',
  'placeSpaceId',
  'room',
  'phone',
  'callDirection',
  'location',
  'meetingUrl',
] as const;

type EventRow = {
  id: string;
  organizationId: string;
  spaceId: string | null;
  createdById: string;
  kind: 'APPOINTMENT' | 'REMINDER';
  title: string;
  description: string | null;
  location: string | null;
  meetingUrl: string | null;
  customerId: string | null;
  startAt: Date;
  endAt: Date;
  allDay: boolean;
  timezone: string;
  repeat: unknown;
  seriesEndAt: Date | null;
  reminderOffsets: number[];
  visibility: 'BUSY' | 'DETAILS';
  canceledAt: Date | null;
};

function validZone(tz: unknown): tz is string {
  if (typeof tz !== 'string' || tz.length > 64) return false;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

function clean(v: unknown, max: number): string | null {
  if (v === undefined || v === null) return null;
  const s = String(v)
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '')
    .trim();
  return s ? s.slice(0, max) : null;
}

export function reminderEventOf(
  ev: Pick<EventRow, 'startAt' | 'endAt' | 'repeat' | 'timezone' | 'reminderOffsets'>,
): ReminderEvent {
  return {
    startAt: ev.startAt,
    endAt: ev.endAt,
    repeat: (ev.repeat as Repeat | null) ?? null,
    timezone: ev.timezone,
    offsets: ev.reminderOffsets,
  };
}

/** When the last occurrence ends — NULL for a series without an end. */
export function seriesEndOf(startAt: Date, endAt: Date, repeat: Repeat | null, tz: string): Date | null {
  if (!repeat) return endAt;
  if (!repeat.until && !repeat.count) return null;
  const dur = endAt.getTime() - startAt.getTime();
  const to = repeat.until ? new Date(`${addDaysStr(repeat.until, 2)}T00:00:00Z`) : new Date('2999-12-31T00:00:00Z');
  const list = occurrences(startAt, dur, repeat, tz, startAt, to);
  const last = list[list.length - 1];
  return last ? new Date(last.getTime() + dur) : endAt;
}

export { DAY, ISO, DATE, MEETING_KEYS, EventRow, validZone, clean };

/** The organization's zone — where an event without its own is placed. */
export async function orgZoneOf(prisma: PrismaService, organizationId: string): Promise<string> {
  const o = await orgTimezone(prisma, organizationId);
  return o?.timezone || 'Europe/Vienna';
}
