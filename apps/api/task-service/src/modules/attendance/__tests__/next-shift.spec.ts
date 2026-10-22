import { pickNextShift } from '../clock-in/next-shift';

const d = (s: string) => new Date(s);
const now = d('2026-10-18T05:40:00Z');

describe('pickNextShift', () => {
  it('the earliest window still to finish, across workspaces', () => {
    const windows = new Map([
      [
        'a',
        [
          {
            dateStr: '2026-10-18',
            expectedClockInAt: d('2026-10-18T10:00:00Z'),
            expectedClockOutAt: d('2026-10-18T14:00:00Z'),
          },
        ],
      ],
      [
        'b',
        [
          {
            dateStr: '2026-10-18',
            expectedClockInAt: d('2026-10-18T06:00:00Z'),
            expectedClockOutAt: d('2026-10-18T09:00:00Z'),
          },
        ],
      ],
    ]);
    expect(pickNextShift(windows, new Map([['b', 'Warehouse']]), now)).toEqual({
      startAt: '2026-10-18T06:00:00.000Z',
      endAt: '2026-10-18T09:00:00.000Z',
      spaceId: 'b',
      spaceName: 'Warehouse',
    });
  });
  it('a night shift still running counts; a finished one does not', () => {
    const windows = new Map([
      [
        'a',
        [
          {
            dateStr: '2026-10-17',
            expectedClockInAt: d('2026-10-17T20:00:00Z'),
            expectedClockOutAt: d('2026-10-18T06:00:00Z'),
          },
          {
            dateStr: '2026-10-16',
            expectedClockInAt: d('2026-10-16T20:00:00Z'),
            expectedClockOutAt: d('2026-10-17T04:00:00Z'),
          },
        ],
      ],
    ]);
    expect(pickNextShift(windows, new Map(), now)?.startAt).toBe('2026-10-17T20:00:00.000Z');
  });
  it('nothing planned → null', () => {
    expect(pickNextShift(new Map(), new Map(), now)).toBeNull();
  });
});
