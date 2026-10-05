import { labourCost } from '@hbcfield/shared/client';

/** What a person's days cost you — hours × hourly cost + days × day cost (billing/labour-cost.ts). */
describe('labour cost', () => {
  const days = ['2026-09-01', '2026-09-02'];
  const base = { days, minutesOn: () => 480, withHourly: true, withDaily: true };

  it('adds both parts when the person has both rates', () => {
    const c = labourCost({ ...base, hourCostOn: () => 3000, dayCostOn: () => 16000 });
    expect(c).toEqual({ cents: 2 * (8 * 3000 + 16000), hourRateCents: 3000, dayRateCents: 16000 });
  });
  it('one rate is enough — paid by the day is not "missing" an hourly cost', () => {
    expect(labourCost({ ...base, hourCostOn: () => null, dayCostOn: () => 16000 }).cents).toBe(32000);
    expect(labourCost({ ...base, hourCostOn: () => 3000, dayCostOn: () => null }).cents).toBe(48000);
  });
  it('null only with no cost rate at all', () => {
    expect(labourCost({ ...base, hourCostOn: () => null, dayCostOn: () => null }).cents).toBeNull();
  });
  it('a line leaves out the part another line carries — never charged twice', () => {
    expect(labourCost({ ...base, withDaily: false, hourCostOn: () => 3000, dayCostOn: () => 16000 }).cents).toBe(48000);
    expect(labourCost({ ...base, withHourly: false, hourCostOn: () => 3000, dayCostOn: () => 16000 }).cents).toBe(32000);
  });
  it('reads each rate on its own day', () => {
    const c = labourCost({ ...base, hourCostOn: (d) => (d === days[0] ? 3000 : 3600), dayCostOn: () => null });
    expect(c.cents).toBe(8 * 3000 + 8 * 3600);
    expect(c.hourRateCents).toBe(3600);
  });
});
