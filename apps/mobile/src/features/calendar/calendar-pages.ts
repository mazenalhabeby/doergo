import type { CalendarRange } from '@/lib/api/calendar';
import { onSessionEnd } from '@/lib/session/session-registry';

/**
 * Calendar pages read this session, newest last — bounded, so a long swipe never grows memory.
 *
 * ⚠️ KEYED BY MEMBER, AND FORGOTTEN AT THE END OF A SESSION. The cache is a
 * module-level map and outlives a sign-out; keyed by range alone, the next
 * person to open the calendar on the same phone was drawn the last person's
 * appointments, leave and client visits from memory before their own arrived.
 */
const PAGES = new Map<string, CalendarRange>();
export const PAGE_MAX = 24;

export function calendarPageKey(
  userId: string | null | undefined,
  from: string,
  to: string,
  spaceId: string | null,
  layers: string,
  lang: string,
): string {
  return `${userId ?? '-'}|${from}|${to}|${spaceId ?? ''}|${layers}|${lang}`;
}

export const calendarPages = {
  get: (key: string): CalendarRange | undefined => PAGES.get(key),
  has: (key: string): boolean => PAGES.has(key),
  remember(key: string, r: CalendarRange): void {
    PAGES.delete(key);
    PAGES.set(key, r);
    if (PAGES.size > PAGE_MAX) PAGES.delete(PAGES.keys().next().value as string);
  },
  /** After a write the cached pages are stale; at the end of a session they are somebody else's. */
  forget(): void {
    PAGES.clear();
  },
  size: (): number => PAGES.size,
};

onSessionEnd('calendar-pages', () => calendarPages.forget());
