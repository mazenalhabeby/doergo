/**
 * A duration as a person TYPES it — two fields, hours and minutes — for web and phone alike. Hours may be
 * decimal with a comma or a dot ("1,5" h is 90 min); an empty field is nothing; "1.000" is refused rather than
 * guessed (a thousands group has no place in hours or minutes). A decision counts 1 min – 24 h.
 */

/** The longest time one decision may count (the server's own ceiling): 24 h. */
export const DECISION_MINUTES_MAX = 1440;

export type DurationFields = { h: string; m: string };

/** Whole minutes as the two fields show them: 90 → 1 h 30; a whole number of hours leaves the minutes empty. */
export function durationFieldsOf(minutes: number): DurationFields {
  const n = Math.max(0, Math.round(Number.isFinite(minutes) ? minutes : 0));
  return { h: n >= 60 ? String(Math.floor(n / 60)) : '', m: n % 60 ? String(n % 60) : '' };
}

/** One field as typed: "" when empty, null when it cannot be read (letters, a minus, two separators, "1.000"). */
export function readDurationPart(v: string): number | '' | null {
  const s = v.trim();
  if (s === '') return '';
  if (!/^[\d.,]+$/.test(s) || !/\d/.test(s)) return null;
  const seps = s.match(/[.,]/g) ?? [];
  if (seps.length > 1 || /^\d+[.,]\d{3}$/.test(s)) return null;
  return Number(s.replace(',', '.'));
}

/** Total minutes of the two fields: null when either cannot be read, 0 when both are empty. */
export function durationMinutes({ h, m }: DurationFields): number | null {
  const [hours, minutes] = [readDurationPart(h), readDurationPart(m)];
  if (hours === null || minutes === null) return null;
  return Math.round((hours || 0) * 60 + (minutes || 0));
}

/** May this total be sent with a decision? 1 min – 24 h, whole minutes. */
export const durationInRange = (total: number | null): total is number =>
  total !== null && Number.isInteger(total) && total >= 1 && total <= DECISION_MINUTES_MAX;
