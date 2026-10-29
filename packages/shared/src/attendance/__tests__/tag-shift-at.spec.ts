import { noShiftAllowanceNow, tagShiftAt, type NoShiftTag } from '../no-shift-limit';

/*
  "Is there a shift now" judged at the TAP from the planned windows on the tag — not `hasShiftNow`, which was the
  answer when the list was read (perhaps yesterday, before the rota was set).
*/
const at = (iso: string) => new Date(`2026-10-29T${iso}:00Z`);
const tag = (over: Partial<NoShiftTag> = {}): NoShiftTag => ({
  policy: 'SHIFT_ONLY',
  dailyMinutes: 480,
  hasShiftNow: false,
  workedTodayMinutes: 0,
  dayEndsAt: '2026-10-29T23:00:00.000Z',
  shiftWindows: [{ dayFrom: '2026-10-29T00:00:00.000Z', end: '2026-10-29T17:00:00.000Z', toleranceMin: 10 }],
  shiftWindowsUntil: '2026-10-31T00:00:00.000Z',
  ...over,
});

describe('tagShiftAt', () => {
  it('a shift later today covers the morning (the clock-in binds from its start day)', () => {
    expect(tagShiftAt(tag(), at('06:00'))).toBe(true);
  });
  it('until its end + tolerance, not after', () => {
    expect(tagShiftAt(tag(), at('17:09'))).toBe(true);
    expect(tagShiftAt(tag(), at('17:11'))).toBe(false);
  });
  it('not before its start day', () => {
    expect(tagShiftAt(tag(), new Date('2026-10-28T23:30:00Z'))).toBe(false);
  });
  it('cannot say without windows, or past them', () => {
    expect(tagShiftAt(tag({ shiftWindows: undefined }), at('06:00'))).toBeNull();
    expect(tagShiftAt(tag(), new Date('2026-10-31T01:00:00Z'))).toBeNull();
  });
});

describe('noShiftAllowanceNow reads the windows first', () => {
  it('a stale hasShiftNow=false does not refuse when a shift is planned now', () => {
    expect(noShiftAllowanceNow(tag(), at('09:00'))).toEqual({ kind: 'free' });
  });
  it('a stale hasShiftNow=true does not let in after the shift ended', () => {
    expect(noShiftAllowanceNow(tag({ hasShiftNow: true }), at('20:00'))).toMatchObject({ kind: 'refused' });
  });
  it('no windows: as before', () => {
    expect(noShiftAllowanceNow(tag({ shiftWindows: undefined, hasShiftNow: true }), at('20:00'))).toEqual({
      kind: 'free',
    });
  });
});
