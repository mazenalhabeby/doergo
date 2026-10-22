/** The card's hero, target, budget and the totals revision (moved here unchanged) */
import { formatDuration } from '@hbcfield/shared/client';

/**
 * `3` `h` `12` `m` — THE HERO IS SET LIKE AN AMOUNT.
 *
 * Integer at display size, unit at decimal size: the same rule the system uses
 * for money, and the reason `3h 12m` at one size reads as a string of
 * characters while this reads as a quantity.
 */
export function heroParts(minutes: number): { value: string; unit: string }[] {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return [{ value: String(m), unit: 'm' }];
  return [{ value: String(h), unit: 'h' }, { value: String(m).padStart(2, '0'), unit: 'm' }];
}

/**
 * `8h`, `7h 30m` — what a target reads as.
 *
 * ⚠️ NOT `Math.round(minutes / 60)`. A 7h30 shift read `of 8h`, and a 6h20
 * one `of 6h`: the label disagreed with the bar drawn above it, and with the
 * clock-out sheet's own target, by up to half an hour.
 */
export function targetLabel(minutes: number): string {
  return formatDuration(minutes);
}

/** `84` `h` `of 160h` — FLEXIBLE's hero, a month against its budget. */
export function budgetParts(doneMinutes: number, targetHours: number): { value: string; unit: string }[] {
  return [
    { value: String(Math.floor(doneMinutes / 60)), unit: 'h' },
    { value: '', unit: `of ${targetHours}h` },
  ];
}

/**
 * When the totals must be asked again: on and off the clock, a new entry — and
 * ⚠️ when a queued shift change finishes sending. A clock-out is optimistic:
 * the status flips at the tap and the history is asked at once, BEFORE the
 * queued clock-out reached the server, so ⑥ showed the shift before this one
 * with nothing to ask again once it landed. ONE key for the Time page and the
 * home card — they were two copies, and fixing one left the other wrong.
 */
export function totalsRevision(
  status: { isClockedIn?: boolean; currentEntry?: { id?: string } | null } | null | undefined,
  pendingSync: boolean,
): string {
  return `${status?.isClockedIn ? '1' : '0'}:${status?.currentEntry?.id ?? ''}:${pendingSync ? 'q' : ''}`;
}
