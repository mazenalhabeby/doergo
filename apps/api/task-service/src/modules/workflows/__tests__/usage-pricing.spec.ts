import {
  MODULE_USAGE_PRICING,
  BILLABLE_ASSET_WHERE,
  usagePriceFor,
  billsByUsage,
  usageCost,
  includedUnits,
  marginalUnitCents,
  nextUsageBreak,
  orgMonthlyCost,
  spaceMonthlyCost,
  moduleMonthlyCents,
} from '@hbcfield/shared';

/**
 * The assets ladder, checked at the numbers a customer would check it at.
 *
 * Money tests are worth writing badly-tempered: every figure below is one
 * somebody could put on an invoice and be asked to justify, so each is computed
 * by hand in the comment rather than read back out of the implementation.
 */

const ASSETS_BASE = 900; // the module's own switch price, before any count

describe('the assets ladder', () => {
  it('is a ladder at all — assets bills by use, a plain switch does not', () => {
    expect(billsByUsage('assets')).toBe(true);
    expect(billsByUsage('tracking')).toBe(false);
    expect(usagePriceFor('tracking')).toBeNull();
  });

  it('covers the first ten assets in the base price', () => {
    expect(usageCost('assets', 0).monthlyCents).toBe(0);
    expect(usageCost('assets', 10).monthlyCents).toBe(0);
    expect(usageCost('assets', 10).billableUnits).toBe(0);
  });

  it('prices the eleventh, and only the eleventh', () => {
    // one asset past the allowance, at the first band
    expect(usageCost('assets', 11).monthlyCents).toBe(120);
    expect(usageCost('assets', 11).billableUnits).toBe(1);
  });

  it("prices the user's own example: 10 flats + 5 cars + 2 machines", () => {
    // 17 assets: 10 free, 7 × €1.20 = €8.40, on top of the €9 base = €17.40
    const cost = usageCost('assets', 17);
    expect(cost.units).toBe(17);
    expect(cost.billableUnits).toBe(7);
    expect(cost.monthlyCents).toBe(840);
    expect(ASSETS_BASE + cost.monthlyCents).toBe(1740);
  });

  it('is GRADUATED — a cheaper band re-prices only the units inside it', () => {
    // 51 assets: 40 × €1.20 (11-50) + 1 × €0.80 (51) = 4800 + 80
    expect(usageCost('assets', 51).monthlyCents).toBe(4880);
    // 250: 40 × 1.20 + 200 × 0.80 = 4800 + 16000
    expect(usageCost('assets', 250).monthlyCents).toBe(20800);
    // 1000: + 750 × 0.50 = 4800 + 16000 + 37500
    expect(usageCost('assets', 1000).monthlyCents).toBe(58300);
    // 5000: + 4000 × 0.30 = 4800 + 16000 + 37500 + 120000
    expect(usageCost('assets', 5000).monthlyCents).toBe(178300);
  });

  it('never charges LESS for more — the one thing a ladder must not do', () => {
    // A flat rate chosen by the total would make the bill fall at every break.
    let previous = -1;
    for (const n of [0, 9, 10, 11, 49, 50, 51, 249, 250, 251, 999, 1000, 1001, 4000]) {
      const cents = usageCost('assets', n).monthlyCents;
      expect(cents).toBeGreaterThanOrEqual(previous);
      previous = cents;
    }
  });

  it('gets cheaper per asset as it grows — the reason to have bands', () => {
    const each = (n: number) => usageCost('assets', n).effectiveUnitCents;
    expect(each(50)).toBeGreaterThan(each(250));
    expect(each(250)).toBeGreaterThan(each(1000));
    expect(each(1000)).toBeGreaterThan(each(5000));
    // and at a thousand it works out under €0.60 each
    expect(each(1000)).toBeLessThan(60);
  });

  it('itemises every band, and the lines add up to the total', () => {
    const cost = usageCost('assets', 300);
    expect(cost.lines).toEqual([
      { fromUnit: 11, toUnit: 50, units: 40, unitCents: 120, monthlyCents: 4800 },
      { fromUnit: 51, toUnit: 250, units: 200, unitCents: 80, monthlyCents: 16000 },
      { fromUnit: 251, toUnit: 300, units: 50, unitCents: 50, monthlyCents: 2500 },
    ]);
    expect(cost.lines.reduce((s, l) => s + l.monthlyCents, 0)).toBe(cost.monthlyCents);
  });

  it('answers "what does one more cost" with the marginal rate, not the average', () => {
    expect(marginalUnitCents('assets', 0)).toBe(0); // still inside the allowance
    expect(marginalUnitCents('assets', 9)).toBe(0); // the tenth is free
    expect(marginalUnitCents('assets', 10)).toBe(120); // the eleventh is not
    expect(marginalUnitCents('assets', 50)).toBe(80);
    expect(marginalUnitCents('assets', 250)).toBe(50);
    expect(marginalUnitCents('assets', 1000)).toBe(30);
    expect(marginalUnitCents('assets', 99999)).toBe(30);
  });

  it('says how far the next price break is', () => {
    // below the allowance the ladder has not started — measure from where it does
    expect(nextUsageBreak('assets', 0)).toEqual({ atUnits: 51, unitsAway: 51, unitCents: 80 });
    expect(nextUsageBreak('assets', 40)).toEqual({ atUnits: 51, unitsAway: 11, unitCents: 80 });
    expect(nextUsageBreak('assets', 50)).toEqual({ atUnits: 251, unitsAway: 201, unitCents: 50 });
    expect(nextUsageBreak('assets', 900)).toEqual({ atUnits: 1001, unitsAway: 101, unitCents: 30 });
    expect(nextUsageBreak('assets', 2000)).toBeNull(); // already on the last rung
  });

  it('survives rubbish rather than putting NaN on an invoice', () => {
    expect(usageCost('assets', -5).monthlyCents).toBe(0);
    expect(usageCost('assets', 17.9).units).toBe(17);
    expect(usageCost('assets', NaN).monthlyCents).toBe(0);
    expect(usageCost('not_a_module', 5000).monthlyCents).toBe(0);
    expect(marginalUnitCents('not_a_module', 10)).toBe(0);
  });

  it('gives each space its own allowance', () => {
    expect(includedUnits('assets')).toBe(10);
    expect(includedUnits('not_a_module')).toBe(0);
  });

  it('prices each space on its own count, so small sites stay free', () => {
    // Five sites with eight assets each: every one of them is inside its own
    // allowance, so the ladder charges nothing anywhere.
    expect(usageCost('assets', 8).monthlyCents).toBe(0);
    // The same forty assets in ONE space are not free — 30 past the allowance.
    expect(usageCost('assets', 40).monthlyCents).toBe(3600);
  });

  it('costs more spread over sites than gathered in one — the price of per-space', () => {
    // 10 x 50 vs 1 x 500. Accepted deliberately: a space's price has to be the
    // sum of what that space switched on, or the number on its screen cannot be
    // checked from that screen. Recorded here so a change to it is a decision.
    const spreadOut = usageCost('assets', 50).monthlyCents * 10;
    const gathered = usageCost('assets', 500).monthlyCents;
    expect(spreadOut).toBe(48000);
    expect(gathered).toBe(33300);
    expect(spreadOut).toBeGreaterThan(gathered);
    // Still lands near a euro an asset once the ten €9 bases are counted in.
    expect(Math.round((spreadOut + 900 * 10) / 500)).toBe(114);
  });

  it('has a well-formed ladder: ascending, open-ended, and cheaper each rung', () => {
    for (const [key, price] of Object.entries(MODULE_USAGE_PRICING)) {
      expect(price.bands.length).toBeGreaterThan(0);
      expect(price.bands[price.bands.length - 1]!.upTo).toBeNull();
      expect(moduleMonthlyCents(key)).toBeGreaterThan(0); // a base to build on
      let ceiling = price.included;
      let rate = Infinity;
      for (const band of price.bands) {
        if (band.upTo != null) {
          expect(band.upTo).toBeGreaterThan(ceiling);
          ceiling = band.upTo;
        }
        expect(band.unitCents).toBeLessThan(rate); // strictly cheaper each rung
        rate = band.unitCents;
      }
    }
  });
});

describe('what counts as a billable asset', () => {
  it('excludes retired ones — written once, shared by both services', () => {
    // It also excluded sub-assets, until assets stopped nesting. Asserted as a
    // whole object so an exclusion cannot be added or dropped unnoticed: this
    // clause decides what a customer is charged for.
    expect(BILLABLE_ASSET_WHERE).toEqual({ status: { not: 'RETIRED' } });
  });
});

describe('the usage ladder on the whole bill', () => {
  const withAssets = [{ spaceId: 'a', spaceName: 'Depot', enabledModules: ['assets', 'tracking'] }];

  it('gives every space its own allowance, and charges none of them for 8', () => {
    const fiveSmallSites = Array.from({ length: 5 }, (_, i) => ({
      spaceId: `s${i}`,
      spaceName: `Site ${i}`,
      enabledModules: ['assets'],
      usage: { assets: 8 },
    }));
    const bill = orgMonthlyCost({ seatCount: 0, spaces: fiveSmallSites });
    expect(bill.usageMonthlyCents).toBe(0);
    // The five base prices are still charged — the allowance is what they buy.
    expect(bill.spacesMonthlyCents).toBe(900 * 5);
    expect(bill.monthlyCents).toBe(4500);
  });

  it('charges each space for its own overflow only', () => {
    const bill = orgMonthlyCost({
      seatCount: 0,
      spaces: [
        { spaceId: 'a', spaceName: 'Depot', enabledModules: ['assets'], usage: { assets: 40 } },
        { spaceId: 'b', spaceName: 'Office', enabledModules: ['assets'], usage: { assets: 8 } },
      ],
    });
    // Depot: 30 x €1.20. Office: inside its own allowance, nothing.
    expect(bill.usageMonthlyCents).toBe(3600);
    expect(bill.spaces[0]!.cost.usageMonthlyCents).toBe(3600);
    expect(bill.spaces[1]!.cost.usageMonthlyCents).toBe(0);
  });

  it('does not charge a space for a count when it has the module switched off', () => {
    const bill = orgMonthlyCost({
      seatCount: 0,
      spaces: [{ spaceId: 'a', spaceName: 'Office', enabledModules: ['tracking'], usage: { assets: 500 } }],
    });
    expect(bill.usageMonthlyCents).toBe(0);
    expect(bill.usage).toEqual([]);
  });

  it('adds the ladder to the seats and the spaces', () => {
    // 3 users × €9.99 = 29.97 | assets €9 + tracking €19 = €28 | 17 assets = €8.40
    const bill = orgMonthlyCost({ seatCount: 3, spaces: [{ ...withAssets[0]!, usage: { assets: 17 } }] });
    expect(bill.seatMonthlyCents).toBe(2997);
    expect(bill.spacesMonthlyCents).toBe(900 + 2500); // assets base + tracking
    expect(bill.usageMonthlyCents).toBe(840);
    expect(bill.monthlyCents).toBe(2997 + 900 + 2500 + 840);
    expect(bill.annualCents).toBe((2997 + 900 + 2500 + 840) * 10);
  });

  it('makes a space total the whole truth about that space', () => {
    // The invariant this model exists to keep: what a space costs is the sum of
    // what that space switched on, with nothing decided somewhere else.
    const cost = spaceMonthlyCost(['assets', 'tracking'], { assets: 40 });
    expect(cost.baseMonthlyCents).toBe(900 + 2500);
    expect(cost.usageMonthlyCents).toBe(3600);
    expect(cost.monthlyCents).toBe(900 + 2500 + 3600);
  });

  it('ignores a count for a module that has no ladder', () => {
    const bill = orgMonthlyCost({ seatCount: 0, spaces: [{ ...withAssets[0]!, usage: { tracking: 900 } }] });
    expect(bill.usageMonthlyCents).toBe(0);
  });

  it('stays exactly as it was for an org with no usage at all', () => {
    const bill = orgMonthlyCost({ seatCount: 3, spaces: withAssets });
    expect(bill.usageMonthlyCents).toBe(0);
    expect(bill.monthlyCents).toBe(2997 + 900 + 2500);
  });
});

/**
 * The two ladders added alongside assets. Same arithmetic, two different shapes:
 * CRM is a long tail over a big allowance, Client Portal is "first one dearer,
 * every one after it cheaper" expressed as a single open band.
 */
describe('the CRM ladder', () => {
  const BASE = 1500; // €15, and it buys the first 50 clients

  it('charges nothing extra up to the allowance', () => {
    expect(usageCost('crm', 0).monthlyCents).toBe(0);
    expect(usageCost('crm', 50).monthlyCents).toBe(0);
    expect(includedUnits('crm')).toBe(50);
  });

  it('has no cliff at the allowance — client 51 costs what the first 50 implicitly did', () => {
    // €15 over 50 clients is €0.30 each, and the first band is €0.30. That
    // equality is the design, not a coincidence: crossing 50 must not make the
    // effective price jump, or the boundary needs explaining to every customer
    // who reaches it.
    const atAllowance = (BASE + usageCost('crm', 50).monthlyCents) / 50;
    const justOver = (BASE + usageCost('crm', 51).monthlyCents) / 51;
    expect(atAllowance).toBeCloseTo(0.3 * 100, 5);
    expect(justOver).toBeCloseTo(0.3 * 100, 5);
    expect(marginalUnitCents('crm', 50)).toBe(30);
  });

  it('prices 1,000 clients at €210 — 200 × 30c then 750 × 18c, plus the base', () => {
    // 50 free. 51–250 = 200 × 30 = 6000. 251–1000 = 750 × 18 = 13500.
    const cost = usageCost('crm', 1000);
    expect(cost.monthlyCents).toBe(200 * 30 + 750 * 18);
    expect(BASE + cost.monthlyCents).toBe(21000);
  });

  it('gets cheaper per client as it crosses each band, and never dearer', () => {
    const each = (n: number) => (BASE + usageCost('crm', n).monthlyCents) / n;
    // Flat WITHIN a band — 100 and 250 clients are both on the 30c rung, so
    // both work out at exactly 30c. Only crossing into a cheaper band moves it.
    expect(each(100)).toBeCloseTo(each(250), 5);
    // Strictly cheaper across the breaks.
    for (const [a, b] of [[250, 1000], [1000, 5000], [5000, 10000]]) {
      expect(each(b!)).toBeLessThan(each(a!));
    }
  });

  it('re-prices only the band it crosses into, so the bill never falls on growth', () => {
    for (const n of [49, 50, 51, 249, 250, 251, 999, 1000, 1001, 4999, 5000, 5001]) {
      expect(usageCost('crm', n + 1).monthlyCents).toBeGreaterThanOrEqual(
        usageCost('crm', n).monthlyCents,
      );
    }
  });
});

describe('the Client Portal ladder', () => {
  const BASE = 4900; // €49, and it buys the first portal

  it('is €49 for the first portal and €29 for every one after', () => {
    expect(moduleMonthlyCents('b2c_portal')).toBe(BASE);
    expect(BASE + usageCost('b2c_portal', 1).monthlyCents).toBe(4900);
    expect(BASE + usageCost('b2c_portal', 2).monthlyCents).toBe(4900 + 2900);
    expect(BASE + usageCost('b2c_portal', 5).monthlyCents).toBe(4900 + 4 * 2900);
  });

  it('charges the base even before a portal exists, like every other switch', () => {
    // Switching the module on is what is being paid for; assets behaves the
    // same way at zero. Anything else would make the toggle free until used.
    expect(usageCost('b2c_portal', 0).monthlyCents).toBe(0);
  });

  it('tells an operator the next portal costs €29, not €49', () => {
    expect(marginalUnitCents('b2c_portal', 1)).toBe(2900);
    expect(marginalUnitCents('b2c_portal', 4)).toBe(2900);
  });

  it('has no further break to promise, and says so', () => {
    // One open band: there is no cheaper rung to advertise, and the panel must
    // not invent one.
    expect(nextUsageBreak('b2c_portal', 3)).toBeNull();
  });
});

describe('the modules that stayed switches', () => {
  it('prices route tracking and time tracking level with each other', () => {
    expect(moduleMonthlyCents('tracking')).toBe(2500);
    expect(moduleMonthlyCents('time_tracking')).toBe(2500);
    expect(billsByUsage('tracking')).toBe(false);
    expect(billsByUsage('time_tracking')).toBe(false);
  });

  it('prices space sharing as a differentiator', () => {
    expect(moduleMonthlyCents('space_sharing')).toBe(2900);
    expect(billsByUsage('space_sharing')).toBe(false);
  });
});

describe('a space that switched on everything counted', () => {
  it('adds every base and every ladder, and nothing else', () => {
    const cost = spaceMonthlyCost(['assets', 'crm', 'b2c_portal'], {
      assets: 10,   // exactly the allowance → nothing on top
      crm: 100,     // 50 over → 50 × 30 = 1500
      b2c_portal: 2, // one over → 2900
    });
    expect(cost.baseMonthlyCents).toBe(900 + 1500 + 4900);
    expect(cost.usageMonthlyCents).toBe(0 + 1500 + 2900);
    expect(cost.monthlyCents).toBe(cost.baseMonthlyCents + cost.usageMonthlyCents);
  });

  it('ignores a count for a module the space has switched off', () => {
    // Otherwise turning CRM off in a space would still bill for the clients
    // sitting in it — the toggle has to actually stop the money.
    const cost = spaceMonthlyCost(['assets'], { crm: 5000, b2c_portal: 9 });
    expect(cost.usageMonthlyCents).toBe(0);
  });
});
