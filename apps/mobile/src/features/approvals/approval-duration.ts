/**
 * The time a decision counts (overtime, extra time, time outside the shift), typed as hours and minutes —
 * the same reading as the web's duration field (web `approvals/_lib/rule-limit.ts`): hours may be decimal,
 * with a comma or a dot ("1,5" h is 90 min); an empty field is nothing; the total must be 1 min – 24 h.
 */

/** The longest time one decision may count (the server's own ceiling): 24 h. */
export const DURATION_MAX_MINUTES = 1440;

export type DurationText = { h: string; m: string };

/** Whole minutes as the two fields show them: "90" → 1 h 30; a whole number of hours leaves the minutes empty. */
export function durationText(minutes: number): DurationText {
  const n = Math.max(0, Math.round(Number.isFinite(minutes) ? minutes : 0));
  return { h: n >= 60 ? String(Math.floor(n / 60)) : '', m: n % 60 ? String(n % 60) : '' };
}

/**
 * One field as typed: "" when empty, null when it cannot be read (letters, a minus sign, two separators, or
 * "1.000" — a thousands group has no place in hours or minutes, so it is refused rather than guessed).
 */
export function readDurationPart(v: string): number | '' | null {
  const s = v.trim();
  if (s === '') return '';
  if (!/^[\d.,]+$/.test(s) || !/\d/.test(s)) return null;
  const seps = s.match(/[.,]/g) ?? [];
  if (seps.length > 1 || /^\d+[.,]\d{3}$/.test(s)) return null;
  return Number(s.replace(',', '.'));
}

/** Total minutes of the two fields: null when either cannot be read, 0 when both are empty. */
export function durationMinutes({ h, m }: DurationText): number | null {
  const [hours, minutes] = [readDurationPart(h), readDurationPart(m)];
  if (hours === null || minutes === null) return null;
  return Math.round((hours || 0) * 60 + (minutes || 0));
}

/** May this total be sent? 1 min – 24 h, whole minutes. */
export const durationInRange = (total: number | null): total is number =>
  total !== null && Number.isInteger(total) && total >= 1 && total <= DURATION_MAX_MINUTES;

/** Minutes as the reader says them — "1 Std. 30 Min." / "45 min" / "2 h" — from the approvals' own unit words. */
export function minutesText(minutes: number, t: (key: string) => string): string {
  const total = Math.max(0, Math.round(minutes));
  const h = Math.floor(total / 60);
  const m = total % 60;
  const parts = [h ? `${h} ${t('approvals.unitHours')}` : '', m || !h ? `${m} ${t('approvals.unitMinutes')}` : ''];
  return parts.filter(Boolean).join(' ');
}
