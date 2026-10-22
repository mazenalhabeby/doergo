/**
 * People-screen helpers.
 *
 * (The dashboard status/presence derivation ported from the web, and the
 * UTC-based `getTodayString` — wrong for anybody east of UTC just after
 * midnight — were removed 2026-10-10: nothing called them.)
 */
import i18n from '@/i18n';

/** Human-readable elapsed time since a date string. */
export function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return i18n.t('common.timeAgo.justNow');
  if (mins < 60) return i18n.t('common.timeAgo.minutes', { count: mins });
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return i18n.t('common.timeAgo.hours', { count: hrs });
  return i18n.t('common.timeAgo.days', { count: Math.floor(hrs / 24) });
}
