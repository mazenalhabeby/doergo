import {
  resolveRate, explainRate, usesTwoRates, marginCents, lineTotals, snapshotRates,
  RATE_LEVELS, type RateSources,
} from '@hbcfield/shared/client';

/**
 * One rate or two, and where each one comes from.
 *
 * ⚠️ The case this exists for, in the words it was asked in: a staffing company
 * pays Ahmed €20 an hour and bills the client €40. Neither number is entered in
 * the same place, and the company down the road has ONE rate and should never
 * be shown a margin column at all.
 */
describe('the ladder', () => {
  const cents = (bill: number | null, cost: number | null = null) => ({
    billRateCents: bill, costRateCents: cost,
  });

  it('takes the most specific level that is set', () => {
    const s: RateSources = {
      contract: cents(4500),
      member: cents(4000),
      client: cents(3500),
      organization: cents(7500),
    };
    expect(resolveRate('bill', s)).toEqual({ cents: 4500, level: 'contract' });
  });

  it('falls through every empty level in order', () => {
    expect(resolveRate('bill', { organization: cents(7500) }))
      .toEqual({ cents: 7500, level: 'organization' });
    expect(resolveRate('bill', { client: cents(4000), organization: cents(7500) }))
      .toEqual({ cents: 4000, level: 'client' });
  });

  it('answers null rather than zero when nothing is set', () => {
    // A missing rate is a question for a person; 0 is an invoice for nothing.
    expect(resolveRate('bill', {})).toEqual({ cents: null, level: null });
  });

  it('treats a rate of ZERO as a real answer', () => {
    /*
      ⚠️ `||` instead of `??` here sends 0 back down the ladder to be replaced
      by the organization default — so an internal job deliberately billed at
      nothing quietly bills at €75.
    */
    expect(resolveRate('bill', { member: cents(0), organization: cents(7500) }))
      .toEqual({ cents: 0, level: 'member' });
  });

  it('resolves bill and cost INDEPENDENTLY — the agency case', () => {
    /*
      The whole question. The client contract sets what is billed; the member
      record sets what they cost. Neither needs the other, and no special mode
      is required — Ahmed's bill rate is simply blank.
    */
    const s: RateSources = {
      member: { billRateCents: null, costRateCents: 2000 },   // Ahmed costs €20
      client: { billRateCents: 4000, costRateCents: null },   // the deal is €40
      organization: cents(7500),
    };
    expect(resolveRate('bill', s)).toEqual({ cents: 4000, level: 'client' });
    expect(resolveRate('cost', s)).toEqual({ cents: 2000, level: 'member' });
  });

  it('explains itself with the same walk that decided it', () => {
    // A second traversal that disagreed would put an explanation on screen for
    // a number that came from somewhere else.
    const s: RateSources = { member: cents(8500), organization: cents(7500) };
    const steps = explainRate('bill', s);
    expect(steps.map((x) => x.level)).toEqual([...RATE_LEVELS]);
    expect(steps.filter((x) => x.won)).toHaveLength(1);
    expect(steps.find((x) => x.won)!.level).toBe('member');
    expect(steps.find((x) => x.level === 'organization')!.cents).toBe(7500);
  });
});

describe('one rate or two is discovered, not configured', () => {
  it('is one rate until a cost exists anywhere', () => {
    expect(usesTwoRates([{ billRateCents: 8500 }, { billRateCents: 7500 }])).toBe(false);
  });

  it('becomes two the moment any cost rate is set', () => {
    // Nobody switches this on. A company that never enters a cost never sees
    // a margin column; the day one is entered, it is worth having.
    expect(usesTwoRates([{ billRateCents: 8500 }, { costRateCents: 2000 }])).toBe(true);
  });

  it('counts a cost of zero as a cost', () => {
    // A salaried member whose hours carry no marginal cost is a deliberate
    // answer, and the margin against them is the whole bill — which is true.
    expect(usesTwoRates([{ costRateCents: 0 }])).toBe(true);
  });

  it('ignores absent and null levels without throwing', () => {
    expect(usesTwoRates([null, undefined, {}])).toBe(false);
  });
});

describe('margin', () => {
  it('is the difference, in cents', () => {
    expect(marginCents(4000, 2000)).toBe(2000);
  });

  it('is null when either side is unknown', () => {
    // A margin against a missing cost reads as pure profit, and is false.
    expect(marginCents(4000, null)).toBeNull();
    expect(marginCents(null, 2000)).toBeNull();
  });

  it('can be negative, and says so', () => {
    // Billing under cost happens — a fixed-price job, a goodwill rate — and
    // hiding it is how somebody finds out at the end of a quarter.
    expect(marginCents(2000, 3200)).toBe(-1200);
  });
});

describe('a line', () => {
  it('multiplies hours by both rates', () => {
    expect(lineTotals({ hours: 12, billRateCents: 4000, costRateCents: 2000 }))
      .toEqual({ billCents: 48_000, costCents: 24_000, marginCents: 24_000 });
  });

  it('rounds once, at the end', () => {
    // Rounding the rate per line and summing the roundings is how a total
    // misses its own lines by a cent.
    expect(lineTotals({ hours: 3.5, billRateCents: 8533, costRateCents: null }).billCents)
      .toBe(Math.round(8533 * 3.5));
  });

  it('carries the unknown through instead of guessing zero', () => {
    const r = lineTotals({ hours: 8, billRateCents: null, costRateCents: 2000 });
    expect(r.billCents).toBeNull();
    expect(r.marginCents).toBeNull();
  });

  it('treats absent or negative hours as none', () => {
    expect(lineTotals({ hours: -4, billRateCents: 4000, costRateCents: null }).billCents).toBe(0);
    expect(lineTotals({ hours: NaN, billRateCents: 4000, costRateCents: null }).billCents).toBe(0);
  });
});

describe('the snapshot', () => {
  it('freezes both rates as they resolve today', () => {
    /*
      ⚠️ An issued invoice has to keep answering "what was it THEN". Give
      somebody a raise in June and a paid invoice from March must not move —
      which it does the instant a screen re-resolves instead of reading this.
    */
    const s: RateSources = {
      member: { billRateCents: null, costRateCents: 2000 },
      client: { billRateCents: 4000, costRateCents: null },
    };
    expect(snapshotRates(s)).toEqual({ billRateCents: 4000, costRateCents: 2000 });
  });

  it('records the absence of a rate as an absence', () => {
    // Not 0 — the line genuinely had no rate, and a later reader must be able
    // to tell that from a line that was billed at nothing on purpose.
    expect(snapshotRates({})).toEqual({ billRateCents: null, costRateCents: null });
  });
});
