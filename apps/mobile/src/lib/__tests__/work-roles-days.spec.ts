import {
  RateBook, planRateChange, RateChangeError, parseDayKey, dayKeyIn, rateStartProblem,
  effectiveBillBy, billsHours, billsDays, roleComboProblem, workedDays, permissionsForKind,
  buildLabourLines, labourTotalCents,
  type RateHistoryRow, type LabourEntry, type DayEntry,
} from '@hbcfield/shared/client';

/**
 * Work roles, day rates and dated rates — the rules behind the agreed mockup.
 *
 * ⚠️ THE PROMISE THIS FILE KEEPS: changing a rate never re-prices work already
 * done. The invoice scenario at the bottom is the mockup's own BILLA invoice,
 * to the cent ($20,520.00).
 */

const day = (k: string, cents: number | null, createdAt = '2026-01-01T00:00:00Z'): RateHistoryRow => ({
  target: 'ROLE', targetId: 'mech', spaceId: 'billa', kind: 'BILL_DAY', cents, effectiveFrom: k, createdAt,
});

describe('RateBook — the rate in force on a day', () => {
  const book = new RateBook([day('2026-03-01', 18000), day('2026-09-01', 20000), day('2026-11-01', 22000)]);
  const on = (d: string) => book.on(d, 'ROLE', 'mech', 'BILL_DAY', null, 'billa');

  it('prices each day at the rate that applied then', () => {
    expect(on('2026-02-28')).toBeNull(); // before any rate
    expect(on('2026-03-01')).toBe(18000); // the first day counts
    expect(on('2026-10-31')).toBe(20000);
    expect(on('2026-11-01')).toBe(22000);
  });

  it('a later change does not move an earlier day — the whole point', () => {
    const before = on('2026-10-15');
    const after = new RateBook([day('2026-03-01', 18000), day('2026-09-01', 20000), day('2026-11-01', 22000), day('2026-12-01', 99900)]);
    expect(after.on('2026-10-15', 'ROLE', 'mech', 'BILL_DAY', null, 'billa')).toBe(before);
  });

  it('the later write wins when two changes start on the same day', () => {
    const b = new RateBook([day('2026-09-01', 20000, '2026-08-01T10:00:00Z'), day('2026-09-01', 21000, '2026-08-01T11:00:00Z')]);
    expect(b.on('2026-09-02', 'ROLE', 'mech', 'BILL_DAY', null, 'billa')).toBe(21000);
  });

  it('a clearing row means inherit from that day (null), not zero', () => {
    const b = new RateBook([day('2026-01-01', 20000), day('2026-06-01', null)]);
    expect(b.on('2026-05-31', 'ROLE', 'mech', 'BILL_DAY', null, 'billa')).toBe(20000);
    expect(b.on('2026-06-01', 'ROLE', 'mech', 'BILL_DAY', null, 'billa')).toBeNull();
  });

  it('falls back to the column only when a record has no history at all', () => {
    expect(book.on('2026-10-01', 'MEMBER', 'nobody', 'BILL_HOUR', 4500)).toBe(4500);
    expect(book.on('2026-10-01', 'MEMBER', null, 'BILL_HOUR', 4500)).toBeNull();
  });

  it('keeps a rate per workspace apart', () => {
    expect(book.on('2026-10-01', 'ROLE', 'mech', 'BILL_DAY', null, 'siemens')).toBeNull();
  });

  it('splits days into runs that share one rate', () => {
    const runs = book.splitDays(['2026-10-30', '2026-11-02', '2026-10-31', '2026-11-01'], 'ROLE', 'mech', 'BILL_DAY', 'billa');
    expect(runs).toEqual([
      { fromDay: '2026-10-30', toDay: '2026-10-31', days: 2, cents: 20000 },
      { fromDay: '2026-11-01', toDay: '2026-11-02', days: 2, cents: 22000 },
    ]);
  });

  it('timeline lists a series oldest first', () => {
    expect(book.timeline('ROLE', 'mech', 'BILL_DAY', 'billa').map((r) => r.cents)).toEqual([18000, 20000, 22000]);
  });
});

describe('planRateChange — one writer for every rate path', () => {
  const base = { organizationId: 'o', target: 'ROLE' as const, targetId: 'mech', kind: 'BILL_DAY' as const, spaceId: 'billa', today: '2026-10-04' };

  it('defaults to today and cleans the amount', () => {
    const p = planRateChange({ ...base, cents: 20000.4 });
    expect(p.effectiveFrom).toBe('2026-10-04');
    expect(p.cents).toBe(20000);
    expect(p.row.effectiveFrom.toISOString()).toBe('2026-10-04T00:00:00.000Z');
  });

  it('schedules a future change', () => {
    expect(planRateChange({ ...base, cents: 22000, effectiveFrom: '2026-11-01' }).effectiveFrom).toBe('2026-11-01');
  });

  it('refuses a day that does not exist, and dates absurdly far away', () => {
    expect(() => planRateChange({ ...base, cents: 1, effectiveFrom: '2026-02-30' })).toThrow(RateChangeError);
    expect(() => planRateChange({ ...base, cents: 1, effectiveFrom: '2020-01-01' })).toThrow(/past/);
    expect(() => planRateChange({ ...base, cents: 1, effectiveFrom: '2030-01-01' })).toThrow(/ahead/);
  });

  it('an unusable amount becomes "inherit", never a hidden zero', () => {
    expect(planRateChange({ ...base, cents: -5 }).cents).toBeNull();
    expect(planRateChange({ ...base, cents: 0 }).cents).toBe(0);
  });

  it('day keys', () => {
    expect(parseDayKey('2026-11-01')).toBe('2026-11-01');
    expect(parseDayKey('nope')).toBeNull();
    expect(rateStartProblem('2026-10-04', '2026-10-04')).toBeNull();
    // 23:30 in Vienna on 31 Oct is still 31 Oct there, though it is 22:30 UTC.
    expect(dayKeyIn(new Date('2026-10-31T22:30:00Z'), 'Europe/Vienna')).toBe('2026-10-31');
    expect(dayKeyIn(new Date('2026-10-31T23:30:00Z'), 'Europe/Vienna')).toBe('2026-11-01');
  });
});

describe('work roles', () => {
  it('billing is the member\'s own choice; none chosen bills by the hour, as before', () => {
    expect(effectiveBillBy('HOUR')).toBe('HOUR'); // Mark
    expect(effectiveBillBy('BOTH')).toBe('BOTH'); // Patrick — same trade, billed differently
    expect(effectiveBillBy(null)).toBe('HOUR');
    expect(billsHours('BOTH') && billsDays('BOTH')).toBe(true);
    expect(billsHours('DAY')).toBe(false);
  });

  it('a work role grants nothing, whatever was sent', () => {
    expect(permissionsForKind('WORK', { canManageUsers: true })).toEqual({});
    expect(permissionsForKind('MANAGEMENT', { canManageUsers: true })).toEqual({ canManageUsers: true });
  });

  const combo = (o: Partial<Parameters<typeof roleComboProblem>[0]>) =>
    roleComboProblem({ hasWorkRole: false, hasManagementRole: false, allowSecondRole: false, isExternal: false, ...o });

  it('two roles only when allowed', () => {
    expect(combo({ hasWorkRole: true, workRoleKind: 'WORK', hasManagementRole: true, managementRoleKind: 'MANAGEMENT' })).toBe('SECOND_ROLE_NOT_ALLOWED');
    expect(combo({ hasWorkRole: true, workRoleKind: 'WORK', hasManagementRole: true, managementRoleKind: 'MANAGEMENT', allowSecondRole: true })).toBeNull();
    expect(combo({ hasWorkRole: true, workRoleKind: 'WORK' })).toBeNull();
    expect(combo({ hasManagementRole: true, managementRoleKind: 'MANAGEMENT' })).toBeNull();
  });

  it('the kinds must match the slot, and an outsider has no trade', () => {
    expect(combo({ hasWorkRole: true, workRoleKind: 'MANAGEMENT' })).toBe('WORK_ROLE_NOT_WORK');
    expect(combo({ hasManagementRole: true, managementRoleKind: 'WORK' })).toBe('MANAGEMENT_ROLE_IS_WORK');
    expect(combo({ hasWorkRole: true, workRoleKind: 'WORK', isExternal: true })).toBe('EXTERNAL_NO_WORK_ROLE');
  });

  it('a day worked is any day clocked in, once per day, in the workspace\'s zone', () => {
    const key = (d: Date) => dayKeyIn(d, 'Europe/Vienna');
    const days = workedDays(
      [
        { clockInAt: '2026-10-15T06:00:00Z' },
        { clockInAt: '2026-10-15T13:00:00Z' }, // second shift, same day
        { clockInAt: '2026-10-15T22:30:00Z' }, // 00:30 on the 16th in Vienna
        { clockInAt: '2026-10-14T08:00:00Z' }, // before the period
      ],
      key, '2026-10-15', '2026-11-15',
    );
    expect(days).toEqual(['2026-10-15', '2026-10-16']);
  });
});

describe('the BILLA invoice from the mockup', () => {
  const hours = (id: string, name: string, role: string, h: number, rate: number, billable = true, taskId = `${id}-t`): LabourEntry => ({
    taskId, taskTitle: `Job of ${name}`, workerId: id, workerName: name, hours: h,
    billRateCents: rate, costRateCents: null, workRoleId: role === 'Mechanic' ? 'mech' : 'elec', workRoleName: role,
    hoursBillable: billable,
  });
  const ENTRIES: LabourEntry[] = [
    hours('pk', 'Patrick Kern', 'Mechanic', 88, 9000),
    hours('mw', 'Mark Weber', 'Mechanic', 96, 8500),
    hours('ah', 'Ahmed Hassan', 'Electrician', 40, 8000, false), // billed by the day only
  ];
  const DAYS: DayEntry[] = [
    { workerId: 'pk', workerName: 'Patrick Kern', workRoleId: 'mech', workRoleName: 'Mechanic', days: 7, fromDay: '2026-10-15', toDay: '2026-10-31', dayRateCents: 20000 },
    { workerId: 'pk', workerName: 'Patrick Kern', workRoleId: 'mech', workRoleName: 'Mechanic', days: 4, fromDay: '2026-11-01', toDay: '2026-11-15', dayRateCents: 22000 },
    { workerId: 'ah', workerName: 'Ahmed Hassan', workRoleId: 'elec', workRoleName: 'Electrician', days: 12, fromDay: '2026-10-15', toDay: '2026-11-15', dayRateCents: 18000 },
  ];

  it('grouped by role: headings, hours AND days for Patrick, hours only for Mark, days only for Ahmed', () => {
    const lines = buildLabourLines(ENTRIES, 'member', 'Unassigned', { days: DAYS, groupByRole: true });
    expect(lines.map((l) => [l.kind, l.description, l.quantity, l.unitPriceCents])).toEqual([
      ['HEADING', 'Electrician', 0, 0],
      ['DAYS', 'Ahmed Hassan · 12 days worked', 12, 18000],
      [null, 'Job of Ahmed Hassan — 40h', 1, 0], // listed, not charged — and so marked billed
      ['HEADING', 'Mechanic', 0, 0],
      ['HOURS', 'Patrick Kern · 88h', 88, 9000],
      ['DAYS', 'Patrick Kern · 7 days worked, 2026-10-15 – 2026-10-31', 7, 20000],
      ['DAYS', 'Patrick Kern · 4 days worked, 2026-11-01 – 2026-11-15', 4, 22000],
      ['HOURS', 'Mark Weber · 96h', 96, 8500],
    ]);
    expect(labourTotalCents(lines)).toBe(2_052_000);
  });

  it('not grouped: one list, the role at the end of each charged line, same total', () => {
    const lines = buildLabourLines(ENTRIES, 'member', 'Unassigned', { days: DAYS, groupByRole: false });
    expect(lines.some((l) => l.kind === 'HEADING')).toBe(false);
    expect(lines.find((l) => l.kind === 'HOURS')!.description).toBe('Patrick Kern · 88h · Mechanic');
    expect(labourTotalCents(lines)).toBe(2_052_000);
  });

  it('every charged line multiplies out', () => {
    for (const grouping of ['task', 'member', 'both'] as const) {
      for (const l of buildLabourLines(ENTRIES, grouping, 'U', { days: DAYS, groupByRole: true })) {
        if (!l.descriptive) expect(l.amountCents).toBe(Math.round(l.quantity * l.unitPriceCents));
      }
    }
  });

  it('the day-billed worker\'s job is never charged, in any grouping, and is always listed', () => {
    for (const grouping of ['task', 'member', 'both'] as const) {
      const lines = buildLabourLines(ENTRIES, grouping, 'U', { days: DAYS, groupByRole: true });
      const ahmedJob = lines.filter((l) => l.taskId === 'ah-t');
      expect(ahmedJob).toHaveLength(1);
      expect(ahmedJob[0]!.amountCents).toBe(0);
      expect(labourTotalCents(lines)).toBe(2_052_000);
    }
  });

  it('somebody billed by the day who finished no job still gets their days', () => {
    const lines = buildLabourLines([], 'member', 'U', { days: DAYS.slice(2) });
    expect(lines).toHaveLength(1);
    expect(lines[0]!.amountCents).toBe(216_000);
  });

  it('no roles and no days: exactly the invoice it always was', () => {
    const plain = ENTRIES.map(({ workRoleId, workRoleName, hoursBillable, ...e }) => e);
    const lines = buildLabourLines(plain, 'member', 'U', { groupByRole: true });
    expect(lines.map((l) => l.description)).toEqual(['Patrick Kern · 88h', 'Mark Weber · 96h', 'Ahmed Hassan · 40h']);
  });
});

describe('a work role\'s default day rate', () => {
  const r = (spaceId: string | null, cents: number | null, from: string) =>
    ({ target: 'ROLE' as const, targetId: 'mech', spaceId, kind: 'BILL_DAY' as const, cents, effectiveFrom: from, createdAt: '2026-01-01' });

  it('a workspace without its own rate uses the default', () => {
    const book = new RateBook([r(null, 15000, '1970-01-01')]);
    expect(book.dayRateOn('2026-10-01', 'mech', 'siemens')).toBe(15000);
    expect(book.dayRateSourceOn('2026-10-01', 'mech', 'siemens')).toBe('default');
  });

  it('its own rate wins once it has started; before that, and once cleared, the default applies', () => {
    const book = new RateBook([r(null, 15000, '1970-01-01'), r('billa', 20000, '2026-10-10'), r('billa', null, '2026-11-01')]);
    expect(book.dayRateOn('2026-10-09', 'mech', 'billa')).toBe(15000);
    expect(book.dayRateOn('2026-10-10', 'mech', 'billa')).toBe(20000);
    expect(book.dayRateSourceOn('2026-10-10', 'mech', 'billa')).toBe('workspace');
    expect(book.dayRateOn('2026-11-02', 'mech', 'billa')).toBe(15000);
  });

  it('days split where either rate changes', () => {
    const book = new RateBook([r(null, 15000, '1970-01-01'), r('billa', 20000, '2026-10-10')]);
    expect(book.splitDaysWith(['2026-10-08', '2026-10-09', '2026-10-10', '2026-10-10'], (d) => book.dayRateOn(d, 'mech', 'billa')))
      .toEqual([
        { fromDay: '2026-10-08', toDay: '2026-10-09', days: 2, cents: 15000 },
        { fromDay: '2026-10-10', toDay: '2026-10-10', days: 1, cents: 20000 },
      ]);
  });
});
