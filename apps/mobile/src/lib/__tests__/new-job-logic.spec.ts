/**
 * New job's rules — `docs/design/job-flow.html`, `renderCreate()`.
 * Pure: `src/features/new-job/new-job-logic.ts` decides, the screen draws.
 */
import {
  adoptClient, buildCreateInput, canCreate, defaultSpace, dueDateFor, isPastDay, isUntouched, monthGrid,
} from '../../features/new-job/new-job-logic';

const base = {
  title: 'Replace valve', description: '', priority: 'MEDIUM' as const, day: null, time: '',
  address: '', lat: null, lng: null, spaceId: 'sp1', clientId: null, assigneeId: null, canAssign: false,
};

describe('the title is required', () => {
  it('Create job waits for a title, and for the send in flight', () => {
    expect(canCreate('')).toBe(false);
    expect(canCreate('   ')).toBe(false);
    expect(canCreate('Replace valve')).toBe(true);
    expect(canCreate('Replace valve', true)).toBe(false);
  });

  it('the title and details go trimmed; empty details are not sent', () => {
    const input = buildCreateInput({ ...base, title: '  Replace valve ', description: '  ' });
    expect(input.title).toBe('Replace valve');
    expect(input.description).toBeUndefined();
  });
});

describe('when — midnight means no hour', () => {
  const day = new Date(2026, 8, 30, 15, 42);

  it('a day alone is stored at local midnight', () => {
    const d = new Date(dueDateFor(day, '')!);
    expect([d.getFullYear(), d.getMonth(), d.getDate(), d.getHours(), d.getMinutes()]).toEqual([2026, 8, 30, 0, 0]);
  });

  it('an hour is folded into the day', () => {
    const d = new Date(dueDateFor(day, '14:30')!);
    expect([d.getDate(), d.getHours(), d.getMinutes()]).toEqual([30, 14, 30]);
  });

  it('no day, no date — whatever the hour says', () => {
    expect(dueDateFor(null, '14:30')).toBeUndefined();
    expect(buildCreateInput({ ...base, time: '09:00' }).dueDate).toBeUndefined();
  });

  it('days before today cannot be picked; today can', () => {
    const now = new Date(2026, 8, 27, 18, 0);
    expect(isPastDay(new Date(2026, 8, 26), now)).toBe(true);
    expect(isPastDay(new Date(2026, 8, 27, 0, 0), now)).toBe(false);
  });

  it('the month is Monday first, padded to whole weeks', () => {
    const weeks = monthGrid(2026, 8); // September 2026 starts on a Tuesday
    expect(weeks[0]![0]).toBeNull();
    expect(weeks[0]![1]!.getDate()).toBe(1);
    expect(weeks.every((w) => w.length === 7)).toBe(true);
    expect(weeks.flat().filter(Boolean)).toHaveLength(30);
  });
});

describe('raised from a client record — adopted once, dropped when left untouched', () => {
  it('adopts the client and its workspace from the route', () => {
    expect(adoptClient({ customerId: 'c1', customerName: 'BILLA AG', spaceId: 'sp9' })).toEqual({ client: { id: 'c1', name: 'BILLA AG' }, spaceId: 'sp9' });
    expect(adoptClient({ customerId: ['c1'], customerName: ['BILLA'] })).toEqual({ client: { id: 'c1', name: 'BILLA' }, spaceId: null });
  });

  it('adopts nothing once the params were cleared — which is what keeps it from looping', () => {
    expect(adoptClient({ customerId: '', spaceId: '', customerName: '' })).toBeNull();
    expect(adoptClient({})).toBeNull();
  });

  it('only an untouched form lets the client go', () => {
    expect(isUntouched({ title: '', description: '', day: null, photoCount: 0 })).toBe(true);
    expect(isUntouched({ title: 'x', description: '', day: null, photoCount: 0 })).toBe(false);
    expect(isUntouched({ title: '', description: '', day: new Date(), photoCount: 0 })).toBe(false);
    expect(isUntouched({ title: '', description: '', day: null, photoCount: 1 })).toBe(false);
  });

  it('the client is sent as a visit', () => {
    expect(buildCreateInput({ ...base, clientId: 'c1' }).customerId).toBe('c1');
    expect(buildCreateInput(base)).not.toHaveProperty('customerId');
  });
});

describe('who does it — only with canAssign', () => {
  it('the assignee goes only for somebody who may assign', () => {
    expect(buildCreateInput({ ...base, assigneeId: 'u2', canAssign: true }).assignedToId).toBe('u2');
    expect(buildCreateInput({ ...base, assigneeId: 'u2', canAssign: false })).not.toHaveProperty('assignedToId');
  });
});

describe('the workspace', () => {
  it('defaults to the org default, else General, else the first', () => {
    expect(defaultSpace([{ id: 'a', name: 'A' }, { id: 'b', name: 'B', isDefault: true }])).toBe('b');
    expect(defaultSpace([{ id: 'a', name: 'A' }, { id: 'g', name: 'General' }])).toBe('g');
    expect(defaultSpace([{ id: 'a', name: 'A' }])).toBe('a');
    expect(defaultSpace([])).toBeNull();
  });
});
