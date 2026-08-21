import {
  SEAT_MONTHLY_CENTS,
  MODULE_MONTHLY_CENTS,
  moduleMonthlyCents,
  spaceMonthlyCost,
  orgMonthlyCost,
  moduleQuantities,
  formatCents,
  AVAILABLE_MODULES,
} from '@hbcfield/shared';

/**
 * The bill is two halves:
 *
 *   users  × €9.99, everybody the same
 *   spaces = the sum of the modules switched on in each
 *
 * These are the arithmetic the invoice is made of, so they assert real amounts
 * rather than "a number came back" — a pricing test that only checks the shape
 * lets a decimal move without anyone noticing.
 */
describe('the price list', () => {
  it('charges €9.99 per user, the same for everyone', () => {
    expect(SEAT_MONTHLY_CENTS).toBe(999);
  });

  it('prices every module in the catalogue — nothing is free or missing', () => {
    // A module with no entry would be billed at zero, so a space could switch on
    // something valuable and pay nothing without anyone noticing.
    for (const m of AVAILABLE_MODULES) {
      expect(MODULE_MONTHLY_CENTS[m.key as string]).toBeGreaterThan(0);
    }
    // And nothing is priced that is not in the catalogue — an invoice line
    // nobody could switch off.
    const known = new Set<string>(AVAILABLE_MODULES.map((m) => m.key as string));
    for (const key of Object.keys(MODULE_MONTHLY_CENTS)) expect(known.has(key)).toBe(true);
  });

  it('holds the agreed prices', () => {
    expect(moduleMonthlyCents('tracking')).toBe(2500);
    expect(moduleMonthlyCents('time_tracking')).toBe(2500);
    expect(moduleMonthlyCents('space_sharing')).toBe(2900);
    expect(moduleMonthlyCents('service_reports')).toBe(1500);
    expect(moduleMonthlyCents('subtasks')).toBe(300);
    // Bases, not whole prices — the count is charged on top of each.
    expect(moduleMonthlyCents('crm')).toBe(1500);
    expect(moduleMonthlyCents('b2c_portal')).toBe(4900);
    expect(moduleMonthlyCents('assets')).toBe(900);
  });

  it('treats an unknown module as free rather than crashing a bill', () => {
    expect(moduleMonthlyCents('not_a_module')).toBe(0);
  });
});

describe('what a space costs', () => {
  const field = ['checklists', 'attachments', 'tracking', 'service_reports', 'time_tracking'];

  it('adds up the modules switched on — the typical field space is €74', () => {
    // 4 + 5 + 25 + 15 + 25. Was €55 while route and time tracking were €19 and
    // €12; both moved to €25, each replacing a product bought separately.
    expect(spaceMonthlyCost(field).monthlyCents).toBe(7400);
  });

  it('costs less with fewer modules on', () => {
    expect(spaceMonthlyCost(['checklists', 'attachments']).monthlyCents).toBe(900);
  });

  it('costs nothing with nothing on', () => {
    expect(spaceMonthlyCost([]).monthlyCents).toBe(0);
    expect(spaceMonthlyCost(null).monthlyCents).toBe(0);
  });

  it('comes to €209 with everything on', () => {
    // Moves whenever a module is added, removed or repriced — that is the point.
    // 157 -> 169 when Assets (€12) arrived, back to 157 when Apartments (€12)
    // was retired into it, and 157 -> 154 when Assets became a €9 base with the
    // count priced on top of it.
    // ...and 154 -> 209 when route/time tracking went to €25, sharing to €29,
    // and Client Portal became a €49 base with further portals priced on top.
    expect(spaceMonthlyCost(AVAILABLE_MODULES.map((m) => m.key as string)).monthlyCents).toBe(20900);
  });

  it('flags a base-only line, so a space total never reads as the whole price', () => {
    const { lines } = spaceMonthlyCost(['assets', 'tracking']);
    expect(lines.find((l) => l.moduleKey === 'assets')?.usageBilled).toBe(true);
    expect(lines.find((l) => l.moduleKey === 'tracking')?.usageBilled).toBeUndefined();
  });

  it('prices every module in the catalogue — none may be free', () => {
    // A €0 module is a toggle that silently changes nothing on the bill, which
    // is the one thing this pricing model must never have.
    const unpriced = AVAILABLE_MODULES
      .map((m) => m.key as string)
      .filter((key) => moduleMonthlyCents(key) <= 0);
    expect(unpriced).toEqual([]);
  });

  it('ignores a key that is not a module — an invoice line nobody could explain', () => {
    expect(spaceMonthlyCost(['tracking', 'ghost_module']).monthlyCents).toBe(2500);
  });

  it('charges a duplicated module once', () => {
    expect(spaceMonthlyCost(['tracking', 'tracking']).monthlyCents).toBe(2500);
  });

  it('lists the dearest line first, so a total can be checked', () => {
    const { lines } = spaceMonthlyCost(field);
    // time_tracking and tracking are both €25 now, so the tie breaks
    // alphabetically — a stable order keeps an invoice comparable month to month.
    expect(lines.map((l) => l.moduleKey)).toEqual([
      'time_tracking', 'tracking', 'service_reports', 'attachments', 'checklists',
    ]);
    expect(lines.reduce((s, l) => s + l.monthlyCents, 0)).toBe(7400);
  });
});

describe('what an organization pays', () => {
  const field = ['checklists', 'attachments', 'tracking', 'service_reports', 'time_tracking'];
  const twoSites = [
    { spaceId: 'a', spaceName: 'Site A', enabledModules: field },
    { spaceId: 'b', spaceName: 'Site B', enabledModules: field },
  ];

  it('is users × €9.99 plus every space — 10 users, two €74 sites = €247.90', () => {
    const bill = orgMonthlyCost({ seatCount: 10, spaces: twoSites });
    expect(bill.seatMonthlyCents).toBe(9990);
    expect(bill.spacesMonthlyCents).toBe(14800);
    expect(bill.monthlyCents).toBe(24790);
  });

  it('gives two months free on annual', () => {
    expect(orgMonthlyCost({ seatCount: 10, spaces: twoSites }).annualCents).toBe(24790 * 10);
  });

  it('reports the halves as well as the total', () => {
    // "Why is my bill this?" is the question the object exists to answer.
    const bill = orgMonthlyCost({ seatCount: 10, spaces: twoSites });
    expect(bill.seatMonthlyCents + bill.spacesMonthlyCents).toBe(bill.monthlyCents);
    expect(bill.spaces).toHaveLength(2);
    expect(bill.spaces[0]!.cost.monthlyCents).toBe(7400);
  });

  it('bills nothing for an organization with nobody and nothing', () => {
    expect(orgMonthlyCost({ seatCount: 0, spaces: [] }).monthlyCents).toBe(0);
  });

  it('never bills a negative seat count', () => {
    expect(orgMonthlyCost({ seatCount: -5, spaces: [] }).seatMonthlyCents).toBe(0);
  });

  it('honours a negotiated seat price without touching the list price', () => {
    const bill = orgMonthlyCost({ seatCount: 10, spaces: [], seatMonthlyCents: 500 });
    expect(bill.monthlyCents).toBe(5000);
    expect(SEAT_MONTHLY_CENTS).toBe(999);
  });
});

describe('what Stripe is told', () => {
  it('counts SPACES per module, which is how the line is billed', () => {
    // Same mechanism as seats: one price per module, quantity = spaces using it.
    // Switching a module off decrements a quantity instead of needing a credit.
    expect(
      moduleQuantities([
        { spaceId: 'a', spaceName: 'A', enabledModules: ['tracking', 'checklists'] },
        { spaceId: 'b', spaceName: 'B', enabledModules: ['tracking'] },
      ]),
    ).toEqual({ tracking: 2, checklists: 1 });
  });

  it('counts a space once however many times a module is listed', () => {
    expect(
      moduleQuantities([{ spaceId: 'a', spaceName: 'A', enabledModules: ['tracking', 'tracking'] }]),
    ).toEqual({ tracking: 1 });
  });
});

describe('formatting', () => {
  it('drops the decimals on whole euros and keeps them where they matter', () => {
    expect(formatCents(5500)).toBe('€55');
    expect(formatCents(999)).toBe('€9.99');
    expect(formatCents(20990)).toBe('€209.90');
    expect(formatCents(0)).toBe('€0');
  });
});
