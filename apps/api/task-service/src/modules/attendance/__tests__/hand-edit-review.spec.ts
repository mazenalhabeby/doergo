import { handEditNeedsReview, handHoldAtClose, withHoursChanged } from '../core/hand-edit-review';

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

  it('the close writes it waiting AND labelled — the label is what keeps it waiting through later re-labelling', async () => {
    expect(await handHoldAtClose(rules(true), entry, at(16), ['LATE_ARRIVAL'])).toEqual({
      approvalStatus: 'PENDING',
      flagReasons: ['LATE_ARRIVAL', 'HOURS_CHANGED'],
    });
    expect(await handHoldAtClose(rules(false), entry, at(16), ['LATE_ARRIVAL'])).toEqual({});
  });

  it('the label is added once, and dropped when a change goes back under the rule', () => {
    expect(withHoursChanged(['HOURS_CHANGED', 'LATE_ARRIVAL'], true)).toEqual(['LATE_ARRIVAL', 'HOURS_CHANGED']);
    expect(withHoursChanged(['HOURS_CHANGED', 'LATE_ARRIVAL'], false)).toEqual(['LATE_ARRIVAL']);
  });

  it('HOURS_CHANGED sends the day to review — re-labelling cannot make it automatic again', () => {
    const { approvalFor } = jest.requireActual('../core/attendance-occurrence');
    expect(approvalFor(['HOURS_CHANGED'])).toBe('PENDING');
    expect(approvalFor([])).toBe('AUTO');
  });
});
