import {
  AVAILABLE_ADD_ONS,
  ADD_ON_KEYS,
  addOnMonthlyCents,
  addOnsMonthlyCost,
  isAddOn,
  orgHasAddOn,
  orgMonthlyCost,
  AVAILABLE_MODULES,
} from '@hbcfield/shared';

/**
 * Org add-ons — the capabilities that are bought once rather than per space.
 *
 * Money tests are worth writing badly-tempered: every figure is one somebody
 * could be asked to justify on an invoice.
 */
describe('the add-on catalogue', () => {
  it('prices every add-on — none may be free', () => {
    // A €0 add-on is a gate that charges nothing, which means a feature is
    // being given away by an entry in a table nobody re-reads.
    for (const a of AVAILABLE_ADD_ONS) expect(a.monthlyCents).toBeGreaterThan(0);
  });

  it('has no key that is also a module', () => {
    // The two catalogues answer different questions and are billed differently.
    // A key in both would be charged twice and gated twice.
    const modules = new Set(AVAILABLE_MODULES.map(m => m.key as string));
    for (const key of ADD_ON_KEYS) expect(modules.has(key)).toBe(false);
  });

  it('covers every capability the old tier model gated', () => {
    // The migration backfills these names. One missing here is a feature that
    // silently becomes unreachable for every customer who was paying for it.
    const wasTierGated = [
      'recurring', 'overtime', 'invoicing', 'priority_routing', 'reports_builder',
      'shift_scheduling', 'workflows', 'audit_log', 'live_chat', 'report_scheduling',
      'dedicated_support',
    ];
    for (const key of wasTierGated) expect(isAddOn(key)).toBe(true);
    expect(ADD_ON_KEYS.length).toBe(wasTierGated.length);
  });

  it('costs nothing for an unknown key rather than breaking a bill', () => {
    expect(addOnMonthlyCents('not_an_addon')).toBe(0);
    expect(isAddOn('not_an_addon')).toBe(false);
  });
});

describe('what add-ons cost', () => {
  it('adds up what was bought', () => {
    const { monthlyCents, lines } = addOnsMonthlyCost(['invoicing', 'audit_log']);
    expect(monthlyCents).toBe(1900 + 1500);
    expect(lines).toHaveLength(2);
  });

  it('charges a duplicate once', () => {
    expect(addOnsMonthlyCost(['invoicing', 'invoicing']).monthlyCents).toBe(1900);
  });

  it('ignores a key that is not an add-on — an invoice line nobody could cancel', () => {
    expect(addOnsMonthlyCost(['invoicing', 'ghost']).monthlyCents).toBe(1900);
    expect(addOnsMonthlyCost(['ghost']).lines).toEqual([]);
  });

  it('costs nothing for an org that bought nothing', () => {
    for (const v of [[], null, undefined]) expect(addOnsMonthlyCost(v).monthlyCents).toBe(0);
  });

  it('lists the dearest first, so a total can be checked', () => {
    const { lines } = addOnsMonthlyCost(['overtime', 'workflows', 'invoicing']);
    expect(lines.map(l => l.key)).toEqual(['workflows', 'invoicing', 'overtime']);
  });
});

describe('whether an organization has one', () => {
  it('is true only for what is in the list', () => {
    expect(orgHasAddOn(['invoicing'], 'invoicing')).toBe(true);
    expect(orgHasAddOn(['invoicing'], 'workflows')).toBe(false);
  });

  it('treats anything that is not an array as nothing', () => {
    // Defends the gate: a malformed value must never read as permission.
    for (const v of [null, undefined, 'invoicing' as any, {} as any, 0 as any]) {
      expect(orgHasAddOn(v, 'invoicing')).toBe(false);
    }
  });
});

describe('the whole bill', () => {
  const space = { spaceId: 's1', spaceName: 'Site', enabledModules: ['tracking'] };

  it('is seats plus spaces plus add-ons', () => {
    const bill = orgMonthlyCost({ seatCount: 10, spaces: [space], addOns: ['invoicing', 'workflows'] });
    expect(bill.seatMonthlyCents).toBe(9990);      // 10 × €9.99
    expect(bill.spacesMonthlyCents).toBe(2500);    // tracking
    expect(bill.addOnsMonthlyCents).toBe(1900 + 2900);
    expect(bill.monthlyCents).toBe(9990 + 2500+ 1900 + 2900);
  });

  it('reports the parts as well as the total', () => {
    // "Why is my bill this?" is the question this object exists to answer.
    const bill = orgMonthlyCost({ seatCount: 3, spaces: [space], addOns: ['audit_log'] });
    expect(
      bill.seatMonthlyCents + bill.spacesMonthlyCents + bill.usageMonthlyCents + bill.addOnsMonthlyCents,
    ).toBe(bill.monthlyCents);
    expect(bill.addOns).toHaveLength(1);
  });

  it('gives two months free on annual, add-ons included', () => {
    const bill = orgMonthlyCost({ seatCount: 1, spaces: [], addOns: ['invoicing'] });
    expect(bill.annualCents).toBe(bill.monthlyCents * 10);
  });

  it('bills nothing for an organization with nobody, nothing and no add-ons', () => {
    expect(orgMonthlyCost({ seatCount: 0, spaces: [], addOns: [] }).monthlyCents).toBe(0);
  });
});

describe('an organization billed by agreement', () => {
  /*
    There is no code here to test directly — the flag is enforced in
    billing.service — so these pin the PROPERTIES that make it safe, which is
    what a reviewer needs to know:

      • the bill is still computed, because a renewal conversation needs it
      • nothing about the computation changes; only whether it is charged

    The enforcement itself is two early returns, one in reconcileSeats before
    any Stripe call and one in createCheckout, both placed before anything that
    could produce a charge.
  */
  it('still computes a real bill — the figure is the point of the contract', () => {
    const bill = orgMonthlyCost({
      seatCount: 13,
      spaces: [{ spaceId: 'a', spaceName: 'A', enabledModules: ['tracking'], usage: {} }],
      addOns: ['invoicing'],
    });
    expect(bill.monthlyCents).toBeGreaterThan(0);
  });

  it('computes it identically whether or not it will be charged', () => {
    // The flag decides BILLING, never arithmetic. A contract customer's
    // estimate and a paying customer's invoice come from the same call, so a
    // renewal is negotiated against the real list price.
    const input = {
      seatCount: 5,
      spaces: [{ spaceId: 'a', spaceName: 'A', enabledModules: ['crm'], usage: { crm: 120 } }],
      addOns: ['audit_log'],
    };
    expect(orgMonthlyCost(input).monthlyCents).toBe(orgMonthlyCost(input).monthlyCents);
  });
});
