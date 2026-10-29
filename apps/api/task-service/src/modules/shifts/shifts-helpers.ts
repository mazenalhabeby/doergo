import { toISODateString } from '@hbcfield/shared';

const HHMM = /^([01]\d|2[0-3]):([0-5]\d)$/;

/** The Monday-to-Sunday week holding `from` (default: today, UTC day), as YYYY-MM-DD. */
export function weekOf(from?: string): string[] {
  const base =
    from && /^\d{4}-\d{2}-\d{2}$/.test(from)
      ? new Date(`${from}T00:00:00.000Z`)
      : new Date(toISODateString(new Date()) + 'T00:00:00.000Z');
  const monday = new Date(base.getTime() - ((base.getUTCDay() + 6) % 7) * 86_400_000);
  return Array.from({ length: 7 }, (_, i) => toISODateString(new Date(monday.getTime() + i * 86_400_000)));
}

/** The earliest of some dates — where a rota change can start to matter. */
function earliestOf(...dates: Array<Date | null | undefined>): Date | null {
  const t = dates.filter((d): d is Date => d instanceof Date && !isNaN(d.getTime())).map((d) => d.getTime());
  return t.length ? new Date(Math.min(...t)) : null;
}

/**
 * A rota window bound as the day it names: midnight UTC of that calendar day, whatever time a
 * client sent with it ("2026-11-03T23:59:59+01:00" is the 3rd). Every reader compares DAYS
 * (`rotaInForceOn`), so a time on the bound only ever made instant comparisons disagree.
 */
function rotaDay(s: string): Date {
  const asDate = new Date(s);
  if (isNaN(asDate.getTime())) return asDate; // refused downstream exactly as before
  const d = /^\d{4}-\d{2}-\d{2}/.test(s) ? s.slice(0, 10) : toISODateString(asDate);
  return new Date(`${d}T00:00:00.000Z`);
}

export { HHMM, earliestOf, rotaDay };
