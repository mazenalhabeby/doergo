import { canReceiveTasks } from '@hbcfield/shared';

/**
 * The rule the assignment paths now enforce. The assignee pickers already used
 * canReceiveTasks to hide clock-only members, but nothing checked on the way in,
 * so a task assigned through the API landed on someone whose app has no Tasks
 * tab: assigned, invisible, never worked.
 */
describe('canReceiveTasks — who a task may be assigned to', () => {
  it('refuses a clock-only member', () => {
    expect(canReceiveTasks({ role: 'EMPLOYEE', enabledModules: { modules: ['clock'] } })).toBe(false);
  });

  it('accepts a member with the Tasks surface', () => {
    expect(canReceiveTasks({ role: 'EMPLOYEE', enabledModules: { modules: ['tasks', 'clock'] } })).toBe(true);
  });

  // Permissive paths — these must never block an assignment that works today.
  it('accepts an admin', () => {
    expect(canReceiveTasks({ role: 'ADMIN', enabledModules: { modules: [] } })).toBe(true);
  });

  it('accepts a member with no profile stored', () => {
    expect(canReceiveTasks({ role: 'EMPLOYEE' })).toBe(true);
  });

  it('accepts the legacy array storage form', () => {
    expect(canReceiveTasks({ role: 'EMPLOYEE', enabledModules: ['clock'] })).toBe(true);
  });
});
