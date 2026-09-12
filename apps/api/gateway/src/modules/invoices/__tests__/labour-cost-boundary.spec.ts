import fs from 'fs';
import path from 'path';
import { stripLabourCost, cleanRateCents, MAX_RATE_CENTS } from '@hbcfield/shared';

/**
 * What labour COSTS never leaves without permission.
 *
 * ⚠️ Two different people. `canManageInvoices` is an office job — build the
 * bill, send it, chase it. What the labour cost the company is a different
 * question, asked by an owner. Bundling them lets the first clerk hired read
 * the margin on every job, which is the sort of thing nobody notices until it
 * matters.
 *
 * ⚠️ And it is stripped AT THE BOUNDARY, not hidden by a screen. A field that
 * reaches the browser has been disclosed whatever the UI draws — and this one
 * is the number a client must never see beside their own.
 */
describe('stripLabourCost', () => {
  const invoice = () => ({
    id: 'inv1',
    total: 480,
    items: [
      { description: 'Labour', billRateCents: 4000, costRateCents: 2000, amount: 480 },
      { description: 'Parts', billRateCents: null, costRateCents: null, amount: 90 },
    ],
  });

  it('takes the cost off every line for somebody who may not see it', () => {
    const out = stripLabourCost(invoice(), false);
    for (const line of out.items) {
      expect('costRateCents' in line).toBe(false);
      // The bill rate stays: it is what the invoice is made of.
      expect('billRateCents' in line).toBe(true);
    }
  });

  it('leaves it alone for somebody who may', () => {
    const out = stripLabourCost(invoice(), true);
    expect(out.items[0].costRateCents).toBe(2000);
  });

  it('strips the gather result too, where the lines have another name', () => {
    /*
      ⚠️ The same rates ride under `workEntries` on the way to the draft screen.
      A strip that knew only about `items` would close the front door and leave
      the back one open.
    */
    const gathered = {
      twoRates: true,
      workEntries: [{ taskId: 't1', billRateCents: 4000, costRateCents: 2000 }],
    };
    const out = stripLabourCost(gathered, false) as typeof gathered;
    expect('costRateCents' in out.workEntries[0]).toBe(false);
    // And the derived answer goes with it: "there is a margin here" is itself
    // an answer to the question they were not allowed to ask.
    expect(out.twoRates).toBe(false);
  });

  it('does not disturb anything else', () => {
    const out = stripLabourCost(invoice(), false);
    expect(out.id).toBe('inv1');
    expect(out.total).toBe(480);
    expect(out.items).toHaveLength(2);
    expect(out.items[1].amount).toBe(90);
  });

  it('survives shapes it was not built for', () => {
    expect(stripLabourCost(null, false)).toBeNull();
    expect(stripLabourCost(undefined, false)).toBeUndefined();
    expect(stripLabourCost({ items: 'not a list' }, false)).toEqual({ items: 'not a list' });
    expect(stripLabourCost({ items: [null, 3] }, false)).toEqual({ items: [null, 3] });
  });
});

describe('a rate on its way into the database', () => {
  it('keeps whole, bounded cents', () => {
    expect(cleanRateCents(4000)).toBe(4000);
    expect(cleanRateCents('8500')).toBe(8500);
    expect(cleanRateCents(4000.4)).toBe(4000);
  });

  it('keeps a deliberate zero', () => {
    // An internal job billed at nothing is a real answer, and null would send
    // it back to the ladder to be overwritten by the organization default.
    expect(cleanRateCents(0)).toBe(0);
  });

  it('refuses what cannot be a rate', () => {
    /*
      These arrive from a browser and are multiplied by hours into an
      organization's books. Unusable becomes null — "no rate recorded" — which
      is the safe direction, because the level above is always a rate somebody
      set on purpose.
    */
    for (const bad of [-1, NaN, Infinity, 'abc', {}, [], MAX_RATE_CENTS + 1]) {
      expect(cleanRateCents(bad as unknown)).toBeNull();
    }
  });

  it('treats blank as inherit, not as zero', () => {
    for (const blank of [null, undefined, '']) {
      expect(cleanRateCents(blank)).toBeNull();
    }
  });
});

describe('the controller funnels every response', () => {
  const SRC = fs.readFileSync(path.join(__dirname, '..', 'invoices.controller.ts'), 'utf8');
  const code = SRC.replace(/(^|[\s{])\/\*[\s\S]*?\*\//g, '$1').replace(/(^|[^:/])\/\/[^\n]*/g, '$1');

  it('has no route returning the raw microservice result', () => {
    /*
      Eight routes return invoices, and the ninth somebody adds is the one that
      forgets. One funnel is the only version of this that stays true.
    */
    const raw = code.split('\n').filter((l) => l.trim() === 'return result;');
    expect(raw).toEqual([]);
    // …and every route ends in the funnel instead.
    const funnelled = code.split('\n').filter((l) => l.includes('return this.forCaller(result, user)'));
    expect(funnelled.length).toBeGreaterThanOrEqual(8);
  });

  it('reads the permission rather than a role', () => {
    expect(code).toContain('canViewLabourCost');
    expect(code).toContain('stripLabourCost');
  });
});
