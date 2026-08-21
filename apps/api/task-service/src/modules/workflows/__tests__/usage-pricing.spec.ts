import {
  MODULE_USAGE_PRICING,
  BILLABLE_ASSET_WHERE,
  usagePriceFor,
  billsByUsage,
  usageCost,
  marginalUnitCents,
  nextUsageBreak,
  orgMonthlyCost,
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
  it('excludes sub-assets and retired ones — written once, shared by both services', () => {
    expect(BILLABLE_ASSET_WHERE).toEqual({ parentId: null, status: { not: 'RETIRED' } });
  });
});

describe('the usage ladder on the whole bill', () => {
  const withAssets = [{ spaceId: 'a', spaceName: 'Depot', enabledModules: ['assets', 'tracking'] }];

  it('adds the ladder to the seats and the spaces', () => {
    // 3 users × €9.99 = 29.97 | assets €9 + tracking €19 = €28 | 17 assets = €8.40
    const bill = orgMonthlyCost({ seatCount: 3, spaces: withAssets, usage: { assets: 17 } });
    expect(bill.seatMonthlyCents).toBe(2997);
    expect(bill.spacesMonthlyCents).toBe(2800);
    expect(bill.usageMonthlyCents).toBe(840);
    expect(bill.monthlyCents).toBe(6637);
    expect(bill.annualCents).toBe(6637 * 10);
  });

  it('does not charge for a count when nobody has the module switched on', () => {
    const noAssets = [{ spaceId: 'a', spaceName: 'Depot', enabledModules: ['tracking'] }];
    const bill = orgMonthlyCost({ seatCount: 0, spaces: noAssets, usage: { assets: 500 } });
    expect(bill.usageMonthlyCents).toBe(0);
    expect(bill.usage).toEqual([]);
  });

  it('counts ORG-WIDE, so splitting sites does not cost the volume break', () => {
    const fiveSites = Array.from({ length: 5 }, (_, i) => ({
      spaceId: `s${i}`,
      spaceName: `Site ${i}`,
      enabledModules: ['assets'],
    }));
    // 500 assets priced once as 500, not five times as 100
    const together = orgMonthlyCost({ seatCount: 0, spaces: fiveSites, usage: { assets: 500 } });
    const asFiveSmallCustomers = usageCost('assets', 100).monthlyCents * 5;
    expect(together.usageMonthlyCents).toBe(usageCost('assets', 500).monthlyCents);
    expect(together.usageMonthlyCents).toBeLessThan(asFiveSmallCustomers);
  });

  it('ignores a count for a module that has no ladder', () => {
    const bill = orgMonthlyCost({ seatCount: 0, spaces: withAssets, usage: { tracking: 900 } });
    expect(bill.usageMonthlyCents).toBe(0);
  });

  it('stays exactly as it was for an org with no usage at all', () => {
    const bill = orgMonthlyCost({ seatCount: 3, spaces: withAssets });
    expect(bill.usageMonthlyCents).toBe(0);
    expect(bill.monthlyCents).toBe(2997 + 2800);
  });
});
