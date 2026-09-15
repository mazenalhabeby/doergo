import fs from 'fs';
import path from 'path';
import { BadRequestException } from '@nestjs/common';
import {
  ASSET_ENTRY_BACKDATE_DAYS,
  ASSET_ENTRY_FUTURE_GRACE_MS,
  LOG_MEMBER_BACKDATE_DAYS,
  assetEntryDateExempt,
  assetEntryDateMessage,
  assetEntryDateProblem,
  assetEntryDayBounds,
  assetEntryOccurredAt,
  kindTemplate,
  localDayKey,
  logDateProblem,
} from '@hbcfield/shared';
import { AssetAccessService } from '../asset-access.service';
import { AssetExpenseService } from '../asset-expense.service';
import { AssetLogService } from '../asset-log.service';
import { readAssetEntryDate } from '../asset-entry-date';

/**
 * ONE date rule for everything filed against an asset.
 *
 * A fuel slip sent through "Add a receipt" and a Fuel entry sent through the
 * logbook are the same `AssetMoney` row. They were dated by two copies of the
 * rule, and the receipt copy exempted nobody — so the office could log last
 * year's service and was refused last year's invoice for the same van.
 */

const DAY = 86_400_000;
const NOW = new Date('2026-09-14T13:30:00Z');

describe('the shared rule', () => {
  it('keeps the logbook names as the same function, not a copy', () => {
    expect(logDateProblem).toBe(assetEntryDateProblem);
    expect(LOG_MEMBER_BACKDATE_DAYS).toBe(ASSET_ENTRY_BACKDATE_DAYS);
  });

  it('accepts exactly the window and refuses one millisecond past it', () => {
    const edge = new Date(NOW.getTime() - ASSET_ENTRY_BACKDATE_DAYS * DAY);
    expect(assetEntryDateProblem(edge, { now: NOW })).toBeNull();
    expect(assetEntryDateProblem(new Date(edge.getTime() - 1), { now: NOW })).toBe('too-old');
  });

  it('gives a day of grace into the future, and not a millisecond more', () => {
    const edge = new Date(NOW.getTime() + ASSET_ENTRY_FUTURE_GRACE_MS);
    expect(assetEntryDateProblem(edge, { now: NOW })).toBeNull();
    expect(assetEntryDateProblem(new Date(edge.getTime() + 1), { now: NOW })).toBe('future');
  });

  it('exempts somebody who manages assets from the past — never from the future', () => {
    const lastYear = new Date(NOW.getTime() - 400 * DAY);
    expect(assetEntryDateProblem(lastYear, { now: NOW, canManageAssets: true })).toBeNull();
    expect(assetEntryDateProblem(new Date(NOW.getTime() + 3 * DAY), { now: NOW, canManageAssets: true })).toBe('future');
  });

  it('the exemption is ORG-WIDE, because that is what every route is handed', () => {
    expect(assetEntryDateExempt({ role: 'ADMIN' })).toBe(true);
    expect(assetEntryDateExempt({ role: 'MANAGER', canManageAssets: true })).toBe(true);
    expect(assetEntryDateExempt({ role: 'MANAGER', access: { org: { canManageAssets: true }, perSpace: {} } })).toBe(true);
    // A Space Manager's grant in their own depot does not reach `req.user.canManageAssets`.
    expect(assetEntryDateExempt({
      role: 'MANAGER', canManageAssets: false,
      access: { org: {}, perSpace: { depot: { canManageAssets: true } } },
    })).toBe(false);
    expect(assetEntryDateExempt({ role: 'EMPLOYEE' })).toBe(false);
    expect(assetEntryDateExempt(null)).toBe(false);
  });

  it('says one sentence per refusal, naming the window', () => {
    expect(assetEntryDateMessage('future')).toBe('An entry cannot be dated in the future');
    expect(assetEntryDateMessage('too-old')).toBe(`An entry older than ${ASSET_ENTRY_BACKDATE_DAYS} days has to be filed by the office`);
  });
});

/*
  ⚠️ The time zone edge. A picked day travels as an INSTANT — its local midday,
  or now for today — and the server asks the rule of that instant, on a clock in
  some other zone. Every day a calendar offers must be accepted wherever the
  phone is and whatever time it is there.

  Written as explicit UTC offsets rather than by switching `process.env.TZ`,
  which a running Node does not reliably re-read: a test that silently stayed
  in one zone would pass for every zone.
*/
describe('the days a calendar offers, in any time zone', () => {
  const H = 3_600_000;
  // A wall-clock time in a zone `offset` hours east of UTC, as the instant it is.
  const wall = (y: number, m: number, d: number, h: number, min: number, offset: number) =>
    new Date(Date.UTC(y, m, d, h, min) - offset * H);

  it('offers a member exactly one day less than the window, ending today', () => {
    const now = new Date(2026, 8, 14, 15, 30);
    const { minDate, maxDate } = assetEntryDayBounds(now);
    expect(localDayKey(maxDate)).toBe('2026-09-14');
    expect(Math.round((new Date(2026, 8, 14).getTime() - minDate!.getTime()) / DAY)).toBe(ASSET_ENTRY_BACKDATE_DAYS - 1);
    expect(assetEntryDayBounds(now, { canManageAssets: true }).minDate).toBeUndefined();
  });

  it.each([-11, -8, 0, 1, 2, 5.5, 12, 14])('UTC%s: the oldest offered day is accepted at every hour of the day', (offset) => {
    for (const hour of [0, 1, 11, 12, 13, 23]) {
      const now = wall(2026, 8, 14, hour, 59, offset);
      // The oldest offered day, filed at its local midday in the same zone.
      const oldest = wall(2026, 8, 14 - (ASSET_ENTRY_BACKDATE_DAYS - 1), 12, 0, offset);
      expect(assetEntryDateProblem(oldest, { now })).toBeNull();
      // Today is filed as now.
      expect(assetEntryDateProblem(now, { now })).toBeNull();
    }
  });

  it.each([-11, 0, 14])('UTC%s: by the afternoon, the day before it is refused — the bound is not just cautious', (offset) => {
    const now = wall(2026, 8, 14, 15, 30, offset);
    const dayBefore = wall(2026, 8, 14 - ASSET_ENTRY_BACKDATE_DAYS, 12, 0, offset);
    expect(assetEntryDateProblem(dayBefore, { now })).toBe('too-old');
  });

  it('a phone fourteen hours ahead of the server files "now" without being called the future', () => {
    const serverNow = new Date('2026-09-14T10:00:00Z');
    const phoneClockAhead = new Date(serverNow.getTime() + 14 * H);
    expect(assetEntryDateProblem(phoneClockAhead, { now: serverNow })).toBeNull();
  });

  it('a past day is filed at its local midday; today at the moment itself', () => {
    const now = new Date(2026, 8, 14, 9, 17);
    const past = assetEntryOccurredAt('2026-09-10', now)!;
    expect([localDayKey(past), past.getHours(), past.getMinutes()]).toEqual(['2026-09-10', 12, 0]);
    expect(assetEntryOccurredAt('2026-09-14', now)!.getTime()).toBe(now.getTime());
    expect(assetEntryOccurredAt('2026-02-30', now)).toBeNull();
  });
});

describe('the server reads every asset date through one door', () => {
  it('refuses with the shared sentence', () => {
    const old = new Date(NOW.getTime() - 200 * DAY).toISOString();
    expect(() => readAssetEntryDate(old, {}, NOW)).toThrow(new BadRequestException(assetEntryDateMessage('too-old')));
    expect(readAssetEntryDate(old, { canManageAssets: true }, NOW).toISOString()).toBe(old);
    expect(() => readAssetEntryDate('not a date', {}, NOW)).toThrow(BadRequestException);
  });

  /*
    The same member, the same van, the same 200-day-old date: the expense route
    and the logbook route must refuse it with the same words, and the same
    office member must get both through.
  */
  const vehicle = kindTemplate('vehicle')!.shape;
  const old = () => new Date(Date.now() - 200 * DAY).toISOString();
  const member = { userId: 'ahmed', userRole: 'EMPLOYEE', organizationId: 'org-1' };
  const office = { ...member, userId: 'office', canManageAssets: true };

  function services() {
    const prisma: any = {
      asset: {
        findFirst: jest.fn(async () => ({ id: 'van', name: 'Sprinter', category: { config: vehicle, spaceId: null } })),
        findUnique: jest.fn(async () => ({ logState: null })),
      },
      assetMoney: {
        findUnique: jest.fn(async () => null),
        create: jest.fn(async ({ data }: any) => ({ id: 'e1', ...data })),
        findMany: jest.fn(async () => []),
      },
      $transaction: jest.fn(async (fn: any) => fn({
        assetMoney: {
          create: jest.fn(async ({ data }: any) => ({ id: 'e1', ...data })),
          findMany: jest.fn(async () => []),
          findFirst: jest.fn(async () => null),
        },
        asset: { update: jest.fn(), findUnique: jest.fn(async () => ({ category: { config: vehicle } })) },
      })),
    };
    const custody: any = { heldBy: jest.fn(async () => true) };
    const notifier: any = { expenseSubmitted: jest.fn() };
    const store: any = { head: jest.fn(async () => ({ exists: true, sizeBytes: 10 })) };
    const expense = new AssetExpenseService(prisma, new AssetAccessService(prisma), custody, notifier, store);
    const log = new AssetLogService(prisma, new AssetAccessService(prisma), custody, expense, store);
    return { expense, log };
  }

  it('a member is refused an old date by both, in the same words', async () => {
    const { expense, log } = services();
    const words = assetEntryDateMessage('too-old');
    await expect(expense.submit({ ...member, id: 'van', category: 'Fuel', amountCents: 5000, occurredAt: old() }))
      .rejects.toThrow(words);
    await expect(log.create({ ...member, id: 'van', logType: 'fuel', values: { odometer: '1000', litres: '40', amount: 5000 }, occurredAt: old() }))
      .rejects.toThrow(words);
  });

  it('the office gets an old date through both — the receipt copy used to exempt nobody', async () => {
    const { expense, log } = services();
    await expect(expense.submit({ ...office, id: 'van', category: 'Fuel', amountCents: 5000, occurredAt: old() })).resolves.toBeDefined();
    await expect(log.create({ ...office, id: 'van', logType: 'fuel', values: { odometer: '1000', litres: '40', amount: 5000 }, occurredAt: old() }))
      .resolves.toBeDefined();
  });

  it('no asset service keeps its own copy of the window', () => {
    const dir = path.join(__dirname, '..');
    const offenders = fs.readdirSync(dir)
      .filter((f) => f.endsWith('.service.ts'))
      .filter((f) => {
        const src = fs.readFileSync(path.join(dir, f), 'utf8');
        return /BACKDATE_DAYS\s*=|\b120\s*\*\s*86_400_000|(entry|receipt) cannot be dated/.test(src);
      });
    expect(offenders).toEqual([]);
  });
});
