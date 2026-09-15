import {
  normalizeKindShape,
  normalizeLogTypes,
  logTypesForKind,
  findLogType,
  logKeyFrom,
  kindTemplate,
  KIND_SHAPE_LIMITS,
  validateLogValues,
  readLogNumber,
  latestReadings,
  computeNextDue,
  dueStatus,
  nextReminderAt,
  remindAtAfterWrite,
  addMonths,
  creditsByAuthor,
  creditsByLogType,
  kindMeters,
  totalsByPeriod,
  type KindLogType,
  type CustodyPeriod,
} from '@hbcfield/shared/client';

/**
 * The logbook's rules: what a log type may say, what an entry may hold, when a
 * job is due again, and whose money it was.
 *
 * The due arithmetic is the part a business acts on — "the Sprinter's oil is
 * due at 101,412 km" sends somebody to a garage — so every edge of "whichever
 * first" is pinned here with fixed dates rather than trusted to three screens.
 */

const vehicle = normalizeKindShape(kindTemplate('vehicle')!.shape);
const oil = findLogType(vehicle, 'oil_change')!;
const fuel = findLogType(vehicle, 'fuel')!;

describe('log types in a kind', () => {
  it('survives junk where a list belongs', () => {
    for (const junk of [null, '[]', 42, {}, [null, 3, 'x', { label: '' }]]) {
      expect(normalizeLogTypes(junk)).toEqual([]);
    }
    expect(normalizeKindShape({}).logTypes).toEqual([]);
  });

  it('keeps a stored key through a rename, and makes one from the label the first time', () => {
    const [kept] = normalizeLogTypes([{ key: 'oil', label: 'Engine oil', fields: [{ key: 'km', label: 'Odometer', type: 'number' }] }]);
    expect(kept!.key).toBe('oil');
    expect(kept!.fields[0]!.key).toBe('km');
    const [fresh] = normalizeLogTypes([{ label: 'Öl-Wechsel', fields: [{ label: 'Kilometerstand', type: 'number' }] }]);
    expect(fresh!.key).toBe('ol_wechsel');
    expect(logKeyFrom('  !!  ')).toBe('field');
  });

  it('never lets a type take the ledger’s key, and never two types one key', () => {
    const types = normalizeLogTypes([{ key: 'cost', label: 'Costs' }, { key: 'x', label: 'A' }, { key: 'x', label: 'B' }, { label: 'a' }]);
    expect(types.map((t) => t.key)).toEqual(['cost_2', 'x', 'x_2']);
  });

  it('keeps one amount and one photo per type — the columns an entry actually has', () => {
    const [t] = normalizeLogTypes([{
      label: 'Fuel',
      fields: [
        { label: 'Amount', type: 'money' }, { label: 'Tip', type: 'money' },
        { label: 'Slip', type: 'photo' }, { label: 'Pump', type: 'photo' },
      ],
    }]);
    expect(t!.fields.map((f) => f.label)).toEqual(['Amount', 'Slip']);
  });

  it('turns a choice with no options into text, and bounds everything', () => {
    const [t] = normalizeLogTypes([{ label: 'X', fields: [{ label: 'Fuel', type: 'choice', options: [] }] }]);
    expect(t!.fields[0]!.type).toBe('text');
    const many = Array.from({ length: 40 }, (_, i) => ({ label: `T${i}`, fields: Array.from({ length: 30 }, (_, j) => ({ label: `F${j}` })) }));
    const bounded = normalizeLogTypes(many);
    expect(bounded).toHaveLength(KIND_SHAPE_LIMITS.maxLogTypes);
    expect(bounded[0]!.fields).toHaveLength(KIND_SHAPE_LIMITS.maxLogFields);
  });

  it('drops a unit rule that counts in something that is not a meter of the same type', () => {
    const [t] = normalizeLogTypes([{
      label: 'Oil',
      fields: [{ key: 'litres', label: 'Litres', type: 'number' }],
      due: { units: 15000, meterKey: 'litres', months: 12 },
    }]);
    expect(t!.due).toEqual({ months: 12, units: null, meterKey: null, leadDays: null, leadUnits: null });
    const [none] = normalizeLogTypes([{ label: 'Oil', due: { units: 15000, meterKey: 'nope' } }]);
    expect(none!.due).toBeNull();
  });

  it('offers Cost first wherever the kind tracks money, and reads an unkeyed entry as a cost', () => {
    expect(logTypesForKind(vehicle).map((t) => t.key)).toEqual(['cost', 'fuel', 'oil_change', 'service', 'damage']);
    expect(findLogType(vehicle, null)?.key).toBe('cost');
    expect(findLogType(normalizeKindShape({}), null)).toBeNull();
    expect(findLogType(vehicle, 'nope')).toBeNull();
  });

  it('knows one odometer across Fuel, Oil change and Service', () => {
    expect(kindMeters(vehicle.logTypes)).toEqual([{ key: 'odometer', label: 'Odometer', unit: 'km' }]);
  });

  it('every template survives its own normalisation unchanged', () => {
    for (const id of ['machine', 'apartment', 'vehicle', 'tool', 'property']) {
      const shape = kindTemplate(id)!.shape;
      expect(normalizeLogTypes(shape.logTypes)).toEqual(shape.logTypes);
    }
  });
});

describe('an entry’s values', () => {
  it('reads numbers the way people type them', () => {
    expect(readLogNumber('86 412')).toBe(86412);
    expect(readLogNumber('86.412')).toBe(86412);
    expect(readLogNumber('12,5')).toBe(12.5);
    expect(readLogNumber('1.234,50')).toBe(1234.5);
    expect(readLogNumber('1.5')).toBe(1.5);
    expect(readLogNumber('abc')).toBeNull();
  });

  it('refuses a missing required answer and says which', () => {
    const r = validateLogValues(fuel, { odometer: '86412' });
    expect(r.ok).toBe(false);
    expect(r.problems).toEqual([{ key: 'amount', code: 'required' }]);
  });

  it('keeps only what the type asks, pulls out money and meters', () => {
    const r = validateLogValues(fuel, { odometer: '86.412', litres: '52,3', amount: 7412, sneaky: 'x' });
    expect(r.ok).toBe(true);
    expect(r.values).toEqual({ odometer: 86412, litres: 52.3 });
    expect(r.readings).toEqual({ odometer: 86412 });
    expect(r.amountCents).toBe(7412);
    expect(r.direction).toBe('OUT');
    expect(r.category).toBe('Fuel');
  });

  it('holds a choice to its list, in the list’s spelling', () => {
    const [t] = normalizeLogTypes([{ label: 'Check', fields: [{ key: 'r', label: 'Result', type: 'choice', options: ['Passed', 'Failed'] }] }]);
    expect(validateLogValues(t!, { r: 'passed' }).values).toEqual({ r: 'Passed' });
    expect(validateLogValues(t!, { r: 'maybe' }).problems).toEqual([{ key: 'r', code: 'not-an-option' }]);
  });

  it('refuses an impossible date and a negative meter', () => {
    const [t] = normalizeLogTypes([{ label: 'X', fields: [{ key: 'd', label: 'D', type: 'date' }, { key: 'm', label: 'M', type: 'number', meter: true }] }]);
    expect(validateLogValues(t!, { d: '2026-02-30', m: '-4' }).problems).toEqual([
      { key: 'd', code: 'not-a-date' },
      { key: 'm', code: 'out-of-range' },
    ]);
  });

  it('files a cost under its heading, with the heading’s direction', () => {
    const flat = normalizeKindShape(kindTemplate('apartment')!.shape);
    const cost = findLogType(flat, 'cost')!;
    const r = validateLogValues(cost, { category: 'rent', amount: 90000 }, { shape: flat });
    expect(r.category).toBe('Rent');
    expect(r.direction).toBe('IN');
  });

  it('asks for a required photo through the flag, never through the values', () => {
    const [t] = normalizeLogTypes([{ label: 'Damage', fields: [{ key: 'p', label: 'Photo', type: 'photo', required: true }] }]);
    expect(validateLogValues(t!, { p: 'some/key' }).ok).toBe(false);
    expect(validateLogValues(t!, {}, { hasPhoto: true }).ok).toBe(true);
  });
});

describe('readings', () => {
  it('is the NEWEST reading, not the largest — so a typo can be corrected', () => {
    const latest = latestReadings([
      { id: 'a', occurredAt: '2026-09-01', readings: { odometer: 860_000 } }, // typo
      { id: 'b', occurredAt: '2026-09-02', readings: { odometer: 86_100 } },
      { id: 'c', occurredAt: '2026-08-01', readings: { odometer: 85_000, hours: 12 } },
    ]);
    expect(latest.odometer).toEqual({ value: 86_100, at: new Date('2026-09-02').toISOString(), entryId: 'b' });
    expect(latest.hours!.value).toBe(12);
  });
});

describe('next due', () => {
  const done = { id: 'e1', occurredAt: '2026-01-31T10:00:00Z', readings: { odometer: 86_412 } };

  it('clamps months to the end of a short month', () => {
    expect(addMonths(new Date('2026-01-31T10:00:00Z'), 1).toISOString()).toBe('2026-02-28T10:00:00.000Z');
    expect(addMonths(new Date('2024-02-29T00:00:00Z'), 12).toISOString()).toBe('2025-02-28T00:00:00.000Z');
  });

  it('is never due for a type that was never done', () => {
    expect(computeNextDue(oil, null)).toBeNull();
    expect(computeNextDue(fuel, done)).toBeNull(); // no rule
  });

  it('computes both limits from the job that reset them', () => {
    const s = computeNextDue(oil, done)!;
    expect(s.dueAt).toBe('2027-01-31T10:00:00.000Z');
    expect(s.dueReading).toBe(101_412);
    expect(s.remindReading).toBe(100_412);
    expect(s.remindAt).toBe(new Date(Date.parse('2027-01-31T10:00:00Z') - 30 * 86_400_000).toISOString());
    expect(s.lastEntryId).toBe('e1');
  });

  it('counts no units when the job did not record where the meter stood', () => {
    const s = computeNextDue(oil, { ...done, readings: null })!;
    expect(s.dueReading).toBeNull();
    expect(s.dueAt).not.toBeNull();
  });

  it('whichever first: the kilometres trip before the months', () => {
    const s = computeNextDue(oil, done)!;
    const june = new Date('2026-06-01T00:00:00Z');
    expect(dueStatus(s, 95_000, june).stage).toBe('ok');
    expect(dueStatus(s, 100_500, june).stage).toBe('soon');
    const over = dueStatus(s, 101_500, june);
    expect(over.stage).toBe('overdue');
    expect(over.unitsLeft).toBe(-88);
    expect(over.progress).toBeGreaterThan(1);
  });

  it('whichever first: the months trip with the van parked', () => {
    const s = computeNextDue(oil, done)!;
    expect(dueStatus(s, 86_500, new Date('2027-01-10T00:00:00Z')).stage).toBe('soon');
    expect(dueStatus(s, 86_500, new Date('2027-02-01T00:00:00Z')).stage).toBe('overdue');
    expect(dueStatus(s, null, new Date('2027-02-01T00:00:00Z')).daysLeft).toBeLessThan(0);
  });

  it('tells the sweep when to look again — only dates, and only future ones', () => {
    const s = computeNextDue(oil, done)!;
    const at = new Date('2026-06-01T00:00:00Z');
    expect(nextReminderAt([s], at)!.toISOString()).toBe(s.remindAt);
    expect(nextReminderAt([s], new Date(s.remindAt!))!.toISOString()).toBe(s.dueAt);
    expect(nextReminderAt([s], new Date(s.dueAt!))).toBeNull();
  });

  it('after a write, anything already soon is looked at now', () => {
    const s = computeNextDue(oil, done)!;
    const now = new Date('2026-06-01T00:00:00Z');
    const reading = { odometer: { value: 100_600, at: now.toISOString(), entryId: 'x' } };
    expect(remindAtAfterWrite([s], reading, now)).toEqual(now);
    expect(remindAtAfterWrite([s], {}, now)!.toISOString()).toBe(s.remindAt);
  });
});

describe('whose money it was', () => {
  it('credits the author, once, and keeps the unattributed in the sum', () => {
    const credits = creditsByAuthor([
      { authorId: 'ahmed', amountCents: 7000, direction: 'OUT' },
      { authorId: 'mira', amountCents: 5000, direction: 'OUT' },
      { authorId: 'ahmed', amountCents: 1000, direction: 'IN' },
      { authorId: null, amountCents: 300, direction: 'OUT' },
    ]);
    expect(credits.get('ahmed')).toEqual({ inCents: 1000, outCents: 7000, netCents: -6000, entries: 2 });
    expect(credits.get('mira')!.outCents).toBe(5000);
    expect(credits.get('')!.outCents).toBe(300);
  });

  it('splits by log type, with the ledger’s old entries under cost', () => {
    const byType = creditsByLogType([
      { logType: null, amountCents: 100, direction: 'OUT' },
      { logType: 'fuel', amountCents: 200, direction: 'OUT' },
      { logType: 'fuel', amountCents: 50, direction: 'OUT' },
    ]);
    expect(byType.get('cost')!.outCents).toBe(100);
    expect(byType.get('fuel')).toEqual({ inCents: 0, outCents: 250, netCents: -250, entries: 2 });
  });

  it('on a machine held by a shift, custody totals charge the operator who logged it', () => {
    const periods: CustodyPeriod[] = [
      { userId: 'early', startedAt: new Date('2026-01-01'), endedAt: null },
      { userId: 'late', startedAt: new Date('2026-03-01'), endedAt: null },
    ];
    const { byPeriod } = totalsByPeriod(
      [
        { occurredAt: '2026-04-01', amountCents: 400, direction: 'OUT', authorId: 'late' },
        { occurredAt: '2026-04-02', amountCents: 100, direction: 'OUT', authorId: 'office' },
      ],
      periods,
    );
    expect(byPeriod.get(periods[1]!)!.outCents).toBe(400);
    // Logged by somebody holding nothing: the stable fallback, still counted once.
    expect(byPeriod.get(periods[0]!)!.outCents).toBe(100);
  });
});

// Types compile against what the templates produce.
const _typed: KindLogType = oil;
void _typed;
