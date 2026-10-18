import type { DayKind } from '@hbcfield/shared/client';

// The range, event and people shapes are the shared HTTP layer's (http/types.ts),
// so the web and the phone read one definition of what the API returns.
export type { CalendarEventDetail, CalendarEventInput, CalendarPerson, CalendarRange } from '@hbcfield/shared/client';


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
    calendarFeedsEnabled: boolean;
      holidayCount: number;
      estimatedCount: number;
      country: string | null;
      region: string | null;
      weekend: number[];
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
