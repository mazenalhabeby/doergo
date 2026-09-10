import {
  planHandover,
  canHandOver,
  partiesAfter,
  holderOn,
  holdersOn,
  totalsByPeriod,
  attribute,
  custodyDays,
  partyKey,
  openPeriods,
  type CustodyPeriod,
} from '@hbcfield/shared/client';

/**
 * Who held the van, and what it cost while they had it.
 *
 * Every one of these is arithmetic against fixed dates, which is the point:
 * "Ahmed's six months on the Ford cost €1,240" is a claim the business will act
 * on, so the rule that produces it is pinned here rather than trusted to three
 * screens that each filter a list.
 */

const AHMED = 'user-ahmed';
const MIRA = 'user-mira';

const period = (userId: string, from: string, to?: string | null): CustodyPeriod => ({
  userId,
  customerId: null,
  startedAt: new Date(from),
  endedAt: to ? new Date(to) : null,
});

const spend = (on: string, cents: number) => ({
  occurredAt: new Date(on),
  amountCents: cents,
  direction: 'OUT',
});

// Ahmed had the Ford for six months, then Mira took it.
const FORD: CustodyPeriod[] = [
  period(AHMED, '2026-01-15T09:00:00Z', '2026-07-15T09:00:00Z'),
  period(MIRA, '2026-07-15T09:00:00Z'),
];

describe('who held it', () => {
  it('answers for a date inside a closed period', () => {
    expect(holderOn(FORD, '2026-03-01T12:00:00Z')?.userId).toBe(AHMED);
  });

  it('answers for a date inside the open one', () => {
    expect(holderOn(FORD, '2026-08-01T12:00:00Z')?.userId).toBe(MIRA);
  });

  it('answers nobody before the first custody', () => {
    // A van bought in December and handed out in January was held by nobody in
    // between, and saying so is more useful than attributing it to whoever came
    // first — the delivery invoice is the organization's, not a driver's.
    expect(holderOn(FORD, '2025-12-01T12:00:00Z')).toBeNull();
  });

  /*
    The handover instant belongs to exactly one of them.

    Inclusive at both ends, a receipt timestamped 09:00 on the day of the
    handover counts against BOTH drivers and the parts stop summing to the
    whole. Half-open — start counts, end does not — is what makes the two
    columns add up to the ledger.
  */
  it('gives the handover instant to the new holder, not both', () => {
    const at = '2026-07-15T09:00:00Z';
    expect(holdersOn(FORD, at)).toHaveLength(1);
    expect(holderOn(FORD, at)?.userId).toBe(MIRA);
  });

  it('reads an ISO string as readily as a Date', () => {
    const asStrings: CustodyPeriod[] = [{ userId: AHMED, startedAt: '2026-01-15T09:00:00Z', endedAt: null }];
    expect(holderOn(asStrings, '2026-02-01T00:00:00Z')?.userId).toBe(AHMED);
  });

  it('namespaces the two kinds of holder, so ids cannot collide', () => {
    expect(partyKey({ userId: 'x' })).not.toBe(partyKey({ customerId: 'x' }));
    expect(partyKey({})).toBe('');
  });
});

describe('what it cost while they had it', () => {
  const entries = [
    spend('2026-02-01T10:00:00Z', 8_000), // Ahmed
    spend('2026-06-30T10:00:00Z', 4_400), // Ahmed
    spend('2026-08-02T10:00:00Z', 9_900), // Mira
    spend('2025-12-01T10:00:00Z', 50_000), // nobody — bought before anyone drove it
  ];

  it('splits the ledger at the handover', () => {
    const { byPeriod } = totalsByPeriod(entries, FORD);
    expect(byPeriod.get(FORD[0]!)!.outCents).toBe(12_400);
    expect(byPeriod.get(FORD[1]!)!.outCents).toBe(9_900);
  });

  it('keeps what belongs to nobody rather than hiding it', () => {
    // Dropped, the breakdown would be €22,300 against a ledger of €72,300 and
    // neither number would look wrong on its own.
    const { byPeriod, unattributed } = totalsByPeriod(entries, FORD);
    expect(unattributed.outCents).toBe(50_000);
    const sum = [...byPeriod.values()].reduce((n, t) => n + t.outCents, 0) + unattributed.outCents;
    expect(sum).toBe(72_300);
  });

  it('counts money in and money out separately, and nets them', () => {
    const mixed = [
      { occurredAt: new Date('2026-02-01T10:00:00Z'), amountCents: 10_000, direction: 'IN' },
      spend('2026-02-02T10:00:00Z', 2_500),
    ];
    const t = totalsByPeriod(mixed, FORD).byPeriod.get(FORD[0]!)!;
    expect(t).toMatchObject({ inCents: 10_000, outCents: 2_500, netCents: 7_500, entries: 2 });
  });

  /*
    A shift of operators shares a machine, so several custodies are open at once
    — and a €400 repair must still be €400 in the breakdown, not €400 per
    operator. It is charged once, to the earliest.
  */
  it('charges a shared asset once, not once per holder', () => {
    const shift = [period(AHMED, '2026-01-01T00:00:00Z'), period(MIRA, '2026-01-02T00:00:00Z')];
    const { byPeriod, unattributed } = totalsByPeriod([spend('2026-01-05T10:00:00Z', 40_000)], shift);
    const total = [...byPeriod.values()].reduce((n, t) => n + t.outCents, 0) + unattributed.outCents;
    expect(total).toBe(40_000);
  });

  it('tags each row with its holder, for the ledger column', () => {
    const tagged = attribute([spend('2026-03-01T10:00:00Z', 100)], FORD);
    expect(tagged[0]!.heldBy?.userId).toBe(AHMED);
  });
});

describe('how long they had it', () => {
  it('measures a closed custody', () => {
    expect(custodyDays(FORD[0]!)).toBe(181);
  });

  it('counts an open one up to today', () => {
    const p = period(MIRA, '2026-09-01T00:00:00Z');
    expect(custodyDays(p, new Date('2026-09-11T00:00:00Z'))).toBe(10);
  });
});

describe('handing it over', () => {
  const NOW = new Date('2026-07-15T09:00:00Z');
  const held = [period(AHMED, '2026-01-15T09:00:00Z')];

  it('closes one custody and opens the next', () => {
    const plan = planHandover({ periods: held, to: [{ userId: MIRA }], at: NOW, now: NOW, limit: 1 });
    expect(canHandOver(plan)).toBe(true);
    expect(plan.closing).toHaveLength(1);
    expect(plan.closing[0]!.userId).toBe(AHMED);
    expect(plan.opening).toEqual([{ userId: MIRA }]);
  });

  it('takes it back to nobody', () => {
    const plan = planHandover({ periods: held, to: [], at: NOW, now: NOW, limit: 1 });
    expect(canHandOver(plan)).toBe(true);
    expect(plan.closing).toHaveLength(1);
    expect(plan.opening).toEqual([]);
    expect(partiesAfter(plan)).toEqual([]);
  });

  it('does nothing when the same person keeps it', () => {
    /*
      Saving a record without touching the driver must not close and reopen the
      custody — that would chop one six-month period into a row per save, and
      the person's history would read as a dozen handovers to themselves.
    */
    const plan = planHandover({ periods: held, to: [{ userId: AHMED }], at: NOW, now: NOW, limit: 1 });
    expect(plan.closing).toEqual([]);
    expect(plan.opening).toEqual([]);
    expect(plan.unchanged).toHaveLength(1);
    expect(canHandOver(plan)).toBe(false); // nothing to do
    expect(plan.problems).toEqual([{ kind: 'nobody' }]);
  });

  it('refuses more holders than the kind allows', () => {
    const plan = planHandover({ periods: [], to: [{ userId: AHMED }, { userId: MIRA }], at: NOW, now: NOW, limit: 1 });
    expect(plan.problems).toContainEqual({ kind: 'too-many', limit: 1, asked: 2 });
  });

  it('allows a shift when the kind allows several', () => {
    const plan = planHandover({ periods: [], to: [{ userId: AHMED }, { userId: MIRA }], at: NOW, now: NOW, limit: 8 });
    expect(canHandOver(plan)).toBe(true);
    expect(plan.opening).toHaveLength(2);
  });

  /*
    Dating a handover into the future would leave the asset held by NOBODY
    between now and then, so every receipt in the gap falls out of both
    custodies. Scheduling is a different feature; this one refuses.
  */
  it('refuses a handover dated into the future', () => {
    const plan = planHandover({ periods: held, to: [{ userId: MIRA }], at: '2026-08-01T00:00:00Z', now: NOW });
    expect(plan.problems).toContainEqual({ kind: 'future', at: new Date('2026-08-01T00:00:00Z') });
  });

  it('refuses a handover dated before the custody it would close', () => {
    const plan = planHandover({ periods: held, to: [{ userId: MIRA }], at: '2026-01-01T00:00:00Z', now: NOW });
    expect(plan.problems[0]).toMatchObject({ kind: 'before-start' });
  });

  it('ignores a blank row from a picker', () => {
    const plan = planHandover({ periods: held, to: [{ userId: '' }, { userId: MIRA }], at: NOW, now: NOW, limit: 1 });
    expect(plan.opening).toEqual([{ userId: MIRA }]);
  });

  it('names who ends up holding it, for the row that mirrors this', () => {
    const shift = [period(AHMED, '2026-01-01T00:00:00Z')];
    const plan = planHandover({
      periods: shift, to: [{ userId: AHMED }, { userId: MIRA }], at: NOW, now: NOW, limit: 8,
    });
    expect(partiesAfter(plan)).toEqual([{ userId: AHMED }, { userId: MIRA }]);
    expect(openPeriods(shift)).toHaveLength(1);
  });
});
