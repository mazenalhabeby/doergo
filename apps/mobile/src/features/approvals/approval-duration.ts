/**
 * Minutes said in the approvals' own unit words. Typing a duration (hours + minutes fields, its reading and its
 * range) is shared with the web: `durationFieldsOf`, `durationMinutes`, `durationInRange` in `@hbcfield/shared`.
 */

/** Minutes as the reader says them — "1 Std. 30 Min." / "45 min" / "2 h" — from the approvals' own unit words. */
export function minutesText(minutes: number, t: (key: string) => string): string {
  const total = Math.max(0, Math.round(minutes));
  const h = Math.floor(total / 60);
  const m = total % 60;
  const parts = [h ? `${h} ${t('approvals.unitHours')}` : '', m || !h ? `${m} ${t('approvals.unitMinutes')}` : ''];
  return parts.filter(Boolean).join(' ');
}
