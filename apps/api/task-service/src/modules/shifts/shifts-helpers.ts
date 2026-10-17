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

export { HHMM, earliestOf };
