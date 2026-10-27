import { forgottenEnd, handHoldAtClose, originalTimes, withHoursChanged } from '../core/hand-edit-review';

/*
  A shift the office changed BY HAND is measured from the times before any hand change. A running shift has no
  clock-out yet: its original end is filled at the close (or is the moment the office closed it) — never left as
  "none", or every later change of the clock-out would count as nothing. Past a rule it waits, labelled.
*/
describe('changed by hand — the hours rule', () => {
  const at = (h: number) => new Date(Date.UTC(2026, 9, 27, h));
  const running = {
    organizationId: 'o',
    locationId: 's1',
    isEdited: true,
    originalClockIn: at(12),
    originalClockOut: null,
    clockInAt: at(8),
  };
  const rules = (needs: boolean) =>
    ({ needsMoreFor: jest.fn(async (_o: string, _k: string, f: unknown[]) => f.map(() => needs)) }) as any;

  it('a clock-in moved four hours on a running shift: judged on those four hours at the close', async () => {
    const r = rules(true);
    const hold = await handHoldAtClose(r, running, at(16), ['LATE_ARRIVAL']);
    expect(r.needsMoreFor).toHaveBeenCalledWith('o', 'hours', [{ spaceIds: ['s1'], minutes: 240 }]);
    expect(hold).toEqual({
      originalClockOut: at(16),
      approvalStatus: 'PENDING',
      flagReasons: ['LATE_ARRIVAL', 'HOURS_CHANGED'],
    });
  });

  it('…its original end is written at the close even when no rule asks — a later clock-out edit is measured from it', async () => {
    expect(await handHoldAtClose(rules(false), running, at(16), [])).toEqual({ originalClockOut: at(16) });
  });

  it('never edited: nothing written, no question asked', async () => {
    const r = rules(true);
    expect(await handHoldAtClose(r, { ...running, isEdited: false }, at(16), [])).toEqual({});
    expect(r.needsMoreFor).not.toHaveBeenCalled();
  });

  it('the office closing a running shift: its original end is where it should have ended (given)', () => {
    const now = at(15);
    expect(originalTimes({ isEdited: false, clockInAt: at(8), clockOutAt: null }, now)).toEqual({
      originalClockIn: at(8),
      originalClockOut: now,
    });
    // Moved while running, not closed: no end yet — the close fills it.
    expect(originalTimes({ isEdited: false, clockInAt: at(8), clockOutAt: null })).toEqual({
      originalClockIn: at(8),
      originalClockOut: null,
    });
    // Already edited: the first edit's baseline stands.
    expect(
      originalTimes({
        isEdited: true,
        originalClockIn: at(7),
        originalClockOut: at(17),
        clockInAt: at(8),
        clockOutAt: at(23),
      }),
    ).toEqual({ originalClockIn: at(7), originalClockOut: at(17) });
  });

  it('a day TYPED IN by the office stays typed in — no original clock-in, by hand from start to end', async () => {
    const typed = {
      isEdited: true,
      originalClockIn: null,
      originalClockOut: null,
      clockInAt: at(8),
      clockOutAt: at(18),
    };
    expect(originalTimes(typed, at(19))).toEqual({ originalClockIn: null, originalClockOut: null });
    // …and its close writes no original end either.
    expect(await handHoldAtClose(rules(false), { ...typed, organizationId: 'o' }, at(18), [])).toEqual({});
  });

  it('a provisional close never saves its guess as the original end — the real clock-out does, later', async () => {
    expect(await handHoldAtClose(rules(false), { ...running, clockOutProvisional: true }, at(19), [])).toEqual({});
  });

  it('a shift edited while running and closed BEFORE the end was kept: its next edit takes the clock-out as it', () => {
    const legacy = {
      isEdited: true,
      originalClockIn: at(8),
      originalClockOut: null,
      clockInAt: at(9),
      clockOutAt: at(17),
    };
    expect(originalTimes(legacy)).toEqual({ originalClockIn: at(8), originalClockOut: at(17) });
  });

  it('a forgotten shift the office closes ended at its planned end — not when the office got round to it', () => {
    expect(forgottenEnd({ expectedClockOutAt: at(17), lastSeenAt: at(16) }, at(30))).toEqual(at(17));
    expect(forgottenEnd({ expectedClockOutAt: null, lastSeenAt: at(16) }, at(30))).toEqual(at(16));
    expect(forgottenEnd({}, at(30))).toEqual(at(30));
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
