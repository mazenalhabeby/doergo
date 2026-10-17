/**
 * Permissions from what the session holds — never from retired role strings.
 */
import * as fs from 'fs';
import * as path from 'path';
import { mayReadTeamAvailability } from '../permissions';
import { approverCandidates } from '../overtime-approvers';
import { readSource } from '../../test-utils/read-source';

const ROOT = path.resolve(__dirname, '../../..');

describe('team availability on the Time off tab', () => {
  it('follows canViewAllTasks — org-wide or in any workspace — like the route that answers it', () => {
    expect(mayReadTeamAvailability({ role: 'ADMIN' })).toBe(true);
    expect(mayReadTeamAvailability({ role: 'MANAGER', access: { org: { canViewAllTasks: true } } } as never)).toBe(true);
    expect(mayReadTeamAvailability({ role: 'EMPLOYEE', access: { perSpace: { s1: { canViewAllTasks: true } } } } as never)).toBe(true);
    // A retired role string grants nothing by itself.
    expect(mayReadTeamAvailability({ role: 'DISPATCHER' })).toBe(false);
    expect(mayReadTeamAvailability({ role: 'EMPLOYEE' })).toBe(false);
    expect(mayReadTeamAvailability(null)).toBe(false);
  });
});

describe('who can be asked to sign overtime', () => {
  const c = (id: string, extra: Record<string, unknown> = {}) => ({ id, firstName: id, lastName: 'X', ...extra });
  it('management first, then colleagues; never the member themselves; no duplicates', () => {
    const list = approverCandidates({ managers: [c('anna', { position: 'Ops' }), c('mike')], team: [c('anna'), c('karim', { spaceName: 'Warehouse' })] }, 'mike');
    expect(list.map((l) => l.id)).toEqual(['anna', 'karim']);
    expect(list.map((l) => l.subtitle)).toEqual(['Ops', 'Warehouse']);
  });
});

describe('no screen decides by a retired role string, or reads an admin-only list it cannot use', () => {
  it('time-off and the overtime signature screen', () => {
    const timeOff = readSource(path.join(ROOT, 'app/(app)/(tabs)/time-off.tsx'), 'utf8');
    const sign = readSource(path.join(ROOT, 'app/(app)/overtime/sign/[id].tsx'), 'utf8');
    for (const src of [timeOff, sign]) expect(src).not.toMatch(/role\s*===\s*'(?:CLIENT|DISPATCHER)'/);
    expect(timeOff).toMatch(/mayReadTeamAvailability\(user\)/);
    // `/organizations/members` needs canManageUsers — a field worker gets a 403 and an empty list.
    expect(sign).not.toMatch(/membersApi\.list\(/);
  });
});
