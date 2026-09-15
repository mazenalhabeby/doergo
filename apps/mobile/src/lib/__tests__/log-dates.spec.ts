import { ASSET_ENTRY_BACKDATE_DAYS, LOG_MEMBER_BACKDATE_DAYS, assetEntryDateMessage, logDateProblem } from '@hbcfield/shared/client';
import { assetEntryDateText, dateFromDayKey, dayKeyOf, logEntryDayBounds, occurredAtForDay } from '../log-dates';

/**
 * The days the logbook's calendar offers — pinned against the rule the server
 * refuses by, so a day the phone offers is a day the server takes.
 */

// A Monday afternoon, local time.
const now = new Date(2026, 8, 14, 15, 30, 0);

describe('day keys', () => {
  it('is the LOCAL day, not the UTC one', () => {
    // 00:30 local: toISOString() would answer the previous day east of Greenwich.
    expect(dayKeyOf(new Date(2026, 8, 15, 0, 30))).toBe('2026-09-15');
  });

  it('reads a real day and refuses everything else', () => {
    expect(dateFromDayKey('2026-09-14')?.getTime()).toBe(new Date(2026, 8, 14).getTime());
    for (const bad of ['', '2026-02-30', '14.09.2026', '2026-9-14', 'yesterday', null, undefined]) {
      expect(dateFromDayKey(bad as string)).toBeNull();
    }
  });

  it('round-trips', () => {
    expect(dayKeyOf(dateFromDayKey('2024-02-29')!)).toBe('2024-02-29');
  });
});

describe('logEntryDayBounds', () => {
  it('ends today — never offers tomorrow', () => {
    const { maxDate } = logEntryDayBounds(now);
    expect(dayKeyOf(maxDate)).toBe('2026-09-14');
  });

  it("reaches a member back no further than the server's window", () => {
    const { minDate } = logEntryDayBounds(now);
    expect(minDate).toBeDefined();
    const span = Math.round((new Date(2026, 8, 14).getTime() - minDate!.getTime()) / 86_400_000);
    expect(span).toBe(LOG_MEMBER_BACKDATE_DAYS - 1);
  });

  it('every offered day is accepted by the server rule, at any time of day', () => {
    for (const hour of [0, 9, 12, 23]) {
      const at = new Date(2026, 8, 14, hour, 59);
      const { minDate, maxDate } = logEntryDayBounds(at);
      for (const edge of [minDate!, maxDate]) {
        const filed = occurredAtForDay(dayKeyOf(edge), at)!;
        expect(logDateProblem(filed, { now: at })).toBeNull();
      }
    }
  });

  it('by the afternoon, the day before the first offered one is refused — the bound is not just cautious', () => {
    const { minDate } = logEntryDayBounds(now);
    const before = new Date(minDate!.getFullYear(), minDate!.getMonth(), minDate!.getDate() - 1);
    expect(logDateProblem(occurredAtForDay(dayKeyOf(before), now)!, { now })).toBe('too-old');
  });

  it('somebody who manages assets types in history: no lower bound', () => {
    expect(logEntryDayBounds(now, { canManageAssets: true }).minDate).toBeUndefined();
    const lastYear = occurredAtForDay('2025-03-01', now)!;
    expect(logDateProblem(lastYear, { now, canManageAssets: true })).toBeNull();
    expect(logDateProblem(lastYear, { now })).toBe('too-old');
  });
});

describe('occurredAtForDay', () => {
  it('today is now, so two entries this morning keep their order', () => {
    expect(occurredAtForDay('2026-09-14', now)!.getTime()).toBe(now.getTime());
  });

  it('a past day is its local midday', () => {
    const d = occurredAtForDay('2026-09-10', now)!;
    expect([d.getFullYear(), d.getMonth(), d.getDate(), d.getHours()]).toEqual([2026, 8, 10, 12]);
  });

  it('nothing for a day that does not exist', () => {
    expect(occurredAtForDay('2026-02-30', now)).toBeNull();
  });
});

describe('logDateProblem', () => {
  it('refuses the future past a day of grace', () => {
    expect(logDateProblem(new Date(now.getTime() + 60 * 60_000), { now })).toBeNull();
    expect(logDateProblem(new Date(now.getTime() + 2 * 86_400_000), { now })).toBe('future');
  });
});

/*
  ⚠️ The logbook and the receipt screen say ONE sentence about a date, and it is
  the server's sentence. The receipt screen used to take "YYYY-MM-DD" typed into
  a box, checked nothing, and filed UTC midnight — the evening before, west of
  Greenwich.
*/
describe('assetEntryDateText', () => {
  // Echoes the fallback with its count, which is what an English phone shows.
  const t = (_k: string, fallback: string, o?: Record<string, unknown>) =>
    fallback.replace('{{count}}', String(o?.count ?? ''));

  it('says nothing about a day the calendar offers', () => {
    const { minDate, maxDate } = logEntryDayBounds(now);
    expect(assetEntryDateText(t, dayKeyOf(minDate!), { now })).toBeNull();
    expect(assetEntryDateText(t, dayKeyOf(maxDate), { now })).toBeNull();
  });

  it("says the server's words for an old slip, naming the shared window", () => {
    expect(assetEntryDateText(t, '2026-01-02', { now }))
      .toBe(`An entry older than ${ASSET_ENTRY_BACKDATE_DAYS} days has to be filed by the office`);
    expect(assetEntryDateText(t, '2026-01-02', { now })).toBe(assetEntryDateMessage('too-old'));
  });

  it('lets the office through with last year, as the server does', () => {
    expect(assetEntryDateText(t, '2025-03-01', { now, canManageAssets: true })).toBeNull();
  });

  it('refuses a day after tomorrow, and a day that does not exist', () => {
    expect(assetEntryDateText(t, '2026-09-17', { now })).toBe(assetEntryDateMessage('future'));
    expect(assetEntryDateText(t, '2026-02-30', { now })).toBe('That date could not be read');
  });

  it('asks for keys every language has', () => {
    const keys: string[] = [];
    const spy = (k: string, fallback: string) => { keys.push(k); return fallback; };
    assetEntryDateText(spy, '2026-01-02', { now });
    assetEntryDateText(spy, '2026-09-17', { now });
    assetEntryDateText(spy, 'nope', { now });
    for (const loc of ['en', 'de', 'es', 'fr', 'it']) {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const d = require(`../../i18n/locales/${loc}.json`);
      for (const k of keys) {
        const v = k.split('.').reduce((o: any, p) => o?.[p], d);
        expect(typeof v === 'string' && v.trim().length > 0).toBe(true);
      }
      expect(d.logbook.dateTooOld).toContain('{{count}}');
    }
  });

  it("the English catalogue says exactly the server's sentence", () => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const en = require('../../i18n/locales/en.json');
    expect(en.logbook.dateFuture).toBe(assetEntryDateMessage('future'));
    expect(en.logbook.dateTooOld.replace('{{count}}', String(ASSET_ENTRY_BACKDATE_DAYS))).toBe(assetEntryDateMessage('too-old'));
    expect(en.logbook.badDate).toBe(assetEntryDateMessage('unreadable'));
  });
});

describe('both screens that file against an asset use this rule', () => {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const fs = require('fs');
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const path = require('path');
  // Comments quote the very shortcuts this forbids, so they are stripped first.
  const read = (f: string) => (fs.readFileSync(path.join(__dirname, '../../../app/(app)', f), 'utf8') as string)
    .replace(/(^|[\s{])\/\*[\s\S]*?\*\//g, '$1')
    .replace(/(^|[^:/])\/\/[^\n]*/g, '$1');

  it.each(['asset-log.tsx', 'asset-expense.tsx'])('%s: the calendar, bounded, and the shared sentence', (file) => {
    const src = read(file);
    expect(src).toContain('<DateField');
    expect(src).toMatch(/minDate=\{bounds\.minDate\}/);
    expect(src).toContain('assetEntryDateText(');
    expect(src).toContain('assetEntryDateExempt(');
    // A bare ISO day is UTC midnight — the evening before, west of Greenwich.
    expect(src).not.toMatch(/new Date\(when\)/);
    expect(src).not.toMatch(/toISOString\(\)\.slice\(0, 10\)/);
  });
});
