import type { Ionicons } from '@expo/vector-icons';
import type { AvailabilityResponse, ScheduleEntry, TimeOffRequest } from '../../lib/api/types';

/*
  The Time off screen's RULES — plain functions, no React, so they are tested
  on their own (`time-off-availability-plan.spec.ts`). Moved out of the
  1,400-line route unchanged in behaviour.
*/

export const REASON_TYPE_KEYS = ['vacation', 'sickLeave', 'family', 'other'] as const;

export type RequestFilter = 'upcoming' | 'past' | 'all';

/** Calendar days from start to end inclusive — never fewer than one. */
export function getDayCount(startDate: string, endDate: string): number {
  const start = new Date(startDate);
  const end = new Date(endDate);
  const diffMs = end.getTime() - start.getTime();
  return Math.max(1, Math.round(diffMs / (1000 * 60 * 60 * 24)) + 1);
}

export function getTypeIcon(reason?: string): keyof typeof Ionicons.glyphMap {
  if (!reason) return 'calendar-outline';
  const lower = reason.toLowerCase();
  if (lower.includes('sick') || lower.includes('medical')) return 'medkit-outline';
  if (lower.includes('personal') || lower.includes('family')) return 'people-outline';
  return 'sunny-outline';
}

export function getTypeLabelKey(reason?: string): string {
  if (!reason) return 'timeOff.typeLabels.timeOff';
  const lower = reason.toLowerCase();
  if (lower.includes('sick') || lower.includes('medical')) return 'timeOff.typeLabels.sickLeave';
  if (lower.includes('personal') || lower.includes('family')) return 'timeOff.typeLabels.family';
  if (lower.includes('vacation') || lower.includes('holiday')) return 'timeOff.typeLabels.vacation';
  return 'timeOff.typeLabels.timeOff';
}

/** YYYY-MM-DD in the phone's own zone. */
export function toDateString(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function formatLongDate(d: Date, locale: string): string {
  return d.toLocaleDateString(locale, { month: 'short', day: 'numeric', year: 'numeric' });
}

/** Build a grid of 6 rows x 7 columns for a month calendar (Mon-start). */
export function getMonthGrid(year: number, month: number): (Date | null)[][] {
  const firstDay = new Date(year, month, 1);
  // Convert JS getDay (0=Sun) to Mon-start (0=Mon)
  let startDow = firstDay.getDay() - 1;
  if (startDow < 0) startDow = 6;

  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const grid: (Date | null)[][] = [];
  let dayNum = 1 - startDow;

  for (let row = 0; row < 6; row++) {
    const week: (Date | null)[] = [];
    for (let col = 0; col < 7; col++) {
      if (dayNum >= 1 && dayNum <= daysInMonth) {
        week.push(new Date(year, month, dayNum));
      } else {
        week.push(null);
      }
      dayNum++;
    }
    // Skip trailing empty rows
    if (week.every(d => d === null) && row >= 4) break;
    grid.push(week);
  }

  return grid;
}

export function isDateInRange(date: Date, start: Date, end: Date): boolean {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
  const s = new Date(start.getFullYear(), start.getMonth(), start.getDate()).getTime();
  const e = new Date(end.getFullYear(), end.getMonth(), end.getDate()).getTime();
  return d >= s && d <= e;
}

/** Mon=0 … Sun=6, the calendar grid's and the backend schedule's numbering. */
export function mondayDow(date: Date): number {
  const dow = date.getDay() - 1;
  return dow < 0 ? 6 : dow;
}

/** Schedule day lookup: dayOfWeek (0=Mon..6=Sun) → isActive. */
export function scheduleDayMap(schedule: readonly ScheduleEntry[]): Record<number, boolean> {
  const map: Record<number, boolean> = {};
  schedule.forEach(entry => {
    map[entry.dayOfWeek] = entry.isActive;
  });
  return map;
}

/** Every day covered by the member's requests in one status — the calendar's dots. */
export function datesWithStatus(requests: readonly TimeOffRequest[], status: TimeOffRequest['status']): Record<string, true> {
  const dateSet: Record<string, true> = {};
  requests.forEach(r => {
    if (r.status !== status) return;
    const start = new Date(r.startDate);
    const end = new Date(r.endDate);
    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
      dateSet[toDateString(d)] = true;
    }
  });
  return dateSet;
}

export interface TimeOffStats { daysUsed: number; upcoming: number; pending: number; rejected: number }

export function timeOffStats(requests: readonly TimeOffRequest[], today: Date): TimeOffStats {
  const todayStr = toDateString(today);
  const approved = requests.filter(r => r.status === 'APPROVED');
  return {
    daysUsed: approved
      .filter(r => r.endDate < todayStr)
      .reduce((sum, r) => sum + getDayCount(r.startDate, r.endDate), 0),
    upcoming: approved
      .filter(r => r.endDate >= todayStr)
      .reduce((sum, r) => sum + getDayCount(r.startDate, r.endDate), 0),
    pending: requests.filter(r => r.status === 'PENDING').length,
    rejected: requests.filter(r => r.status === 'REJECTED').length,
  };
}

export function filterRequests<T extends TimeOffRequest>(requests: readonly T[], filter: RequestFilter, today: Date): T[] {
  const todayStr = toDateString(today);
  switch (filter) {
    case 'upcoming':
      return requests.filter(r =>
        r.endDate >= todayStr && (r.status === 'PENDING' || r.status === 'APPROVED')
      );
    case 'past':
      return requests.filter(r =>
        r.endDate < todayStr || r.status === 'REJECTED' || r.status === 'CANCELED'
      );
    default:
      return [...requests];
  }
}

export interface AvailabilityInsights {
  worstAvailable: number;
  worstTotal: number;
  worstDay: string;
  lowCoverage: boolean;
  teamOnTimeOff: string[];
  userNotScheduledDays: string[];
}

/** What the team looks like over the picked range, from whatever days are known. Null when none are. */
export function availabilityInsights(
  rangeStart: Date,
  rangeEnd: Date,
  cache: Readonly<Record<string, AvailabilityResponse>>,
  scheduleDays: Readonly<Record<number, boolean>>,
  scheduleLength: number,
  userId: string | undefined,
): AvailabilityInsights | null {
  const days: string[] = [];
  const d = new Date(rangeStart);
  const end = new Date(rangeEnd);
  while (d <= end) {
    days.push(toDateString(d));
    d.setDate(d.getDate() + 1);
  }

  let worstAvailable = Infinity;
  let worstTotal = 0;
  let worstDay = '';
  const teamOnTimeOff: Record<string, string> = {}; // id → name
  let hasAnyData = false;
  const userNotScheduledDays: string[] = [];

  days.forEach(dayStr => {
    const data = cache[dayStr];
    if (!data) return;
    hasAnyData = true;

    const available = data.summary.available;
    const total = data.summary.total;
    if (available < worstAvailable) {
      worstAvailable = available;
      worstTotal = total;
      worstDay = dayStr;
    }

    data.technicians.forEach(tech => {
      if (tech.onTimeOff && tech.id !== userId) {
        teamOnTimeOff[tech.id] = `${tech.firstName} ${tech.lastName}`;
      }
    });

    // Check if user is scheduled that day
    const userScheduled = scheduleDays[mondayDow(new Date(dayStr + 'T00:00:00'))];
    if (userScheduled === false || (scheduleLength > 0 && userScheduled === undefined)) {
      userNotScheduledDays.push(dayStr);
    }
  });

  if (!hasAnyData) return null;

  return {
    worstAvailable: worstAvailable === Infinity ? 0 : worstAvailable,
    worstTotal,
    worstDay,
    lowCoverage: worstAvailable <= 1 && worstAvailable !== Infinity,
    teamOnTimeOff: Object.values(teamOnTimeOff),
    userNotScheduledDays,
  };
}
