import { handEditNeedsReview } from '../core/hand-edit-review';

/*
  A running shift the office moved by hand is judged again at its close: past an hours rule it waits for approval,
  whatever else the close would say. Untouched shifts ask nothing.
*/
describe('handEditNeedsReview', () => {
  const at = (h: number) => new Date(Date.UTC(2026, 9, 27, h));
  const entry = {
    organizationId: 'o',
    locationId: 's1',
    isEdited: true,
    originalClockIn: at(12),
    originalClockOut: null,
    clockInAt: at(8),
  };
  const rules = (needs: boolean) => ({ secondStepFor: jest.fn().mockResolvedValue(needs ? 'HR' : null) }) as any;

  it('a clock-in moved four hours on a running shift: judged on those four hours at the close', async () => {
    const r = rules(true);
    expect(await handEditNeedsReview(r, entry, at(16))).toBe(true);
    expect(r.secondStepFor).toHaveBeenCalledWith('o', 'hours', { spaceIds: ['s1'], minutes: 240 });
  });

  it('no rule asks: closes as it would', async () => {
    expect(await handEditNeedsReview(rules(false), entry, at(16))).toBe(false);
  });

  it('never edited: no question asked at all', async () => {
    const r = rules(true);
    expect(await handEditNeedsReview(r, { ...entry, isEdited: false }, at(16))).toBe(false);
    expect(r.secondStepFor).not.toHaveBeenCalled();
  });
});
