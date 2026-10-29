/**
 * Layer 0 — "which day is this, and what time is it there", across midnight and the clock changes.
 *
 * Every hour worked, every leave day and every invoice line is placed on a day by these helpers. A wrong answer
 * moves somebody's work onto the wrong day for an hour twice a year — so every quarter hour of the two change days
 * is checked, in zones with summer time, without it, and with odd offsets.
 */
import { zonedWallTimeToUtc, localPartsIn } from '../../attendance/zoned-time';
import { localDateKey } from '../date';
import { zonedParts } from '../zone-parts';
import { zonedInputToUtc, utcToZonedInput } from '../zoned-time';
import { toCents, fromCents } from '../money';

const pad = (n: number) => String(n).padStart(2, '0');

/** The days the clocks change in 2026, per zone (none for zones without summer time). */
const ZONES: Array<{ tz: string; changeDays: string[] }> = [
  { tz: 'Europe/Vienna', changeDays: ['2026-03-29', '2026-10-25'] },
  { tz: 'America/New_York', changeDays: ['2026-03-08', '2026-11-01'] },
  { tz: 'America/Bahia_Banderas', changeDays: ['2026-04-05', '2026-10-25'] }, // no summer time since 2022
  { tz: 'Asia/Kolkata', changeDays: ['2026-03-29'] }, // +05:30
  { tz: 'Pacific/Chatham', changeDays: ['2026-04-05', '2026-09-27'] }, // +12:45 / +13:45
  { tz: 'UTC', changeDays: ['2026-03-29'] },
];

/** Does this wall time exist in the zone (the hour skipped in spring does not)? */
function exists(day: string, h: number, m: number, tz: string): boolean {
  const p = zonedParts(zonedWallTimeToUtc(day, h, m, tz), tz);
  return p.hour === h && p.minute === m;
}

describe('a wall time in a zone, and back', () => {
  for (const { tz, changeDays } of ZONES) {
    for (const day of changeDays) {
      it(`${tz} on ${day}: every existing quarter hour comes back as itself, on the same day`, () => {
        const bad: string[] = [];
        let missing = 0;
        for (let q = 0; q < 96; q++) {
          const h = Math.floor(q / 4);
          const m = (q % 4) * 15;
          if (!exists(day, h, m, tz)) {
            missing++;
            continue;
          }
          const instant = zonedWallTimeToUtc(day, h, m, tz);
          const p = zonedParts(instant, tz);
          const key = `${p.year}-${pad(p.month)}-${pad(p.day)}`;
          if (key !== day || localDateKey(instant, tz) !== day || localPartsIn(instant, tz).dateStr !== day) {
            bad.push(`${pad(h)}:${pad(m)}`);
          }
          if (localPartsIn(instant, tz).minutesOfDay !== h * 60 + m) bad.push(`${pad(h)}:${pad(m)} minutes`);
        }
        expect(bad).toEqual([]);
        // Only the skipped spring hour may be missing — never more than one hour.
        expect(missing).toBeLessThanOrEqual(4);
      });
    }
  }

  it('the skipped spring hour in Vienna is the only one missing, and it is exactly 02:00–02:59', () => {
    const gone = [0, 15, 30, 45].map((m) => exists('2026-03-29', 2, m, 'Europe/Vienna'));
    expect(gone).toEqual([false, false, false, false]);
    expect(exists('2026-03-29', 3, 0, 'Europe/Vienna')).toBe(true);
  });

  it('a whole day lasts 23 h in spring and 25 h in autumn in Vienna, 24 h in Bahia Banderas', () => {
    const len = (a: string, b: string, tz: string) =>
      (zonedWallTimeToUtc(b, 0, 0, tz).getTime() - zonedWallTimeToUtc(a, 0, 0, tz).getTime()) / 3_600_000;
    expect(len('2026-03-29', '2026-03-30', 'Europe/Vienna')).toBe(23);
    expect(len('2026-10-25', '2026-10-26', 'Europe/Vienna')).toBe(25);
    expect(len('2026-10-25', '2026-10-26', 'America/Bahia_Banderas')).toBe(24);
  });

  it('a wall time in the spring gap is the first instant after it; one in the autumn overlap is the first', () => {
    const iso = (day: string, h: number, m: number, tz: string) => zonedWallTimeToUtc(day, h, m, tz).toISOString();
    expect(iso('2026-03-29', 2, 30, 'Europe/Vienna')).toBe('2026-03-29T01:00:00.000Z'); // 03:00 CEST
    expect(iso('2026-03-08', 2, 30, 'America/New_York')).toBe('2026-03-08T07:00:00.000Z'); // 03:00 EDT
    expect(iso('2026-10-25', 2, 30, 'Europe/Vienna')).toBe('2026-10-25T00:30:00.000Z'); // the first 02:30 (CEST)
    expect(iso('2026-11-01', 1, 30, 'America/New_York')).toBe('2026-11-01T05:30:00.000Z'); // the first 01:30 (EDT)
    // Either side of a change is untouched, and a zone without one is plain arithmetic.
    expect(iso('2026-03-29', 1, 59, 'Europe/Vienna')).toBe('2026-03-29T00:59:00.000Z');
    expect(iso('2026-03-29', 3, 0, 'Europe/Vienna')).toBe('2026-03-29T01:00:00.000Z');
    expect(iso('2026-03-29', 2, 30, 'Asia/Kolkata')).toBe('2026-03-28T21:00:00.000Z');
  });

  it('a night shift across the autumn change counts the extra hour (22:00 → 06:00 = 9 h in Vienna)', () => {
    const start = zonedWallTimeToUtc('2026-10-24', 22, 0, 'Europe/Vienna');
    const end = zonedWallTimeToUtc('2026-10-25', 6, 0, 'Europe/Vienna');
    expect((end.getTime() - start.getTime()) / 3_600_000).toBe(9);
    expect(localDateKey(start, 'Europe/Vienna')).toBe('2026-10-24');
  });
});

describe('which day an instant falls on', () => {
  it('00:30 in Vienna is that day there, not yesterday (the UTC day)', () => {
    const instant = new Date('2026-07-14T22:30:00Z'); // 00:30 on the 15th in Vienna
    expect(localDateKey(instant, 'Europe/Vienna')).toBe('2026-07-15');
    expect(localDateKey(instant, 'America/New_York')).toBe('2026-07-14');
    expect(localDateKey(instant, 'UTC')).toBe('2026-07-14');
  });

  it('an unknown zone never throws (it falls back to the runtime day)', () => {
    expect(() => localDateKey(new Date(), 'Mars/Olympus')).not.toThrow();
    expect(localDateKey(new Date('nonsense'), 'Europe/Vienna')).toBe('');
  });

  it('the web input round trip keeps the wall time in the workspace zone', () => {
    for (const tz of ['Europe/Vienna', 'America/New_York', 'Asia/Kolkata']) {
      for (const wall of ['2026-03-29T03:15', '2026-10-25T02:30', '2026-12-31T23:45', '2026-01-01T00:00']) {
        expect(utcToZonedInput(zonedInputToUtc(wall, tz), tz)).toBe(wall);
      }
    }
  });
});

describe('money in cents', () => {
  it('10,000 random amounts round to the nearest cent and back without losing one', () => {
    let seed = 7;
    const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    for (let i = 0; i < 10_000; i++) {
      const cents = Math.floor(rnd() * 10_000_000) - 2_000_000;
      expect(toCents(fromCents(cents))).toBe(cents);
    }
    expect(toCents(0.1 + 0.2)).toBe(30);
    expect(toCents(1.005)).toBeGreaterThanOrEqual(100);
    expect(toCents(Number.NaN)).toBe(0);
  });
});
