import { readShiftState } from '../../components/home/shift-state/read';

/*
  "Your shift starts in N minutes" never appeared: the card read the RUNNING
  entry's expected start, which does not exist before clock-in. It now reads
  the planned shift the server sends with the status — for a rota worker
  whatever their declared schedule (most are declared NONE).
*/
const now = new Date('2026-10-18T05:40:00.000Z');
const status = (nextShift: unknown) =>
  ({ isClockedIn: false, currentEntry: null, assignedLocations: [], nextShift }) as never;

describe('the card before clock-in counts down to the planned shift', () => {
  it('starts in 20 minutes, at the planned workspace', () => {
    const st = readShiftState({
      status: status({
        startAt: '2026-10-18T06:00:00.000Z',
        endAt: '2026-10-18T14:30:00.000Z',
        spaceId: 'w',
        spaceName: 'Warehouse',
      }),
      breaks: null,
      declaredSchedule: 'NONE',
      now,
    });
    expect(st.kind).toBe('before');
    expect(st.startsInMinutes).toBe(20);
    expect(st.workspace).toBe('Warehouse');
    expect(st.at?.toISOString()).toBe('2026-10-18T06:00:00.000Z');
  });

  it('nothing planned → no countdown', () => {
    const st = readShiftState({ status: status(null), breaks: null, declaredSchedule: 'FIXED', now });
    expect(st.startsInMinutes).toBeNull();
  });
});
