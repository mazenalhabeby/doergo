/** Types from calendar-views.tsx — moved here unchanged (2026-10-17 line-length split). */
import type { CalendarItem, DayKind } from '@hbcfield/shared/client';

/** Types the calendar views share. */
export type Kinds = Map<string, DayKind>;

export type Open = (x: CalendarItem) => void;
