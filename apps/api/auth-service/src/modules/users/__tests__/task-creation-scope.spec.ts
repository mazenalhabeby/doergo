import { resolveTaskCreationScope } from '@hbcfield/shared';

/**
 * `taskCreationScope` (a column) and `canCreateTasks` (a permission) are two
 * mechanisms for one decision, and they disagreed: a member granted "create
 * tasks" by a SPACE role was refused with "You do not have permission to create
 * tasks", because the column still held the NONE their invitation defaulted to.
 *
 * The permission decides WHETHER. The column decides HOW WIDELY.
 */
describe('resolveTaskCreationScope', () => {
  const inSpace = { org: {}, perSpace: { s1: { canCreateTasks: true } } } as never;
  const orgWide = { org: { canCreateTasks: true }, perSpace: {} } as never;
  const nothing = { org: {}, perSpace: {} } as never;

  it('resolves an unset column to SPACE when the grant comes from a space', () => {
    // The bug, pinned: NONE + a space grant used to mean "refused".
    expect(resolveTaskCreationScope('NONE', inSpace)).toBe('SPACE');
    expect(resolveTaskCreationScope(null, inSpace)).toBe('SPACE');
    expect(resolveTaskCreationScope(undefined, inSpace)).toBe('SPACE');
  });

  it('resolves to SPACE for an org-wide grant with no column set', () => {
    expect(resolveTaskCreationScope('NONE', orgWide)).toBe('SPACE');
  });

  it('stays NONE when the permission is not held at all', () => {
    // Taking the permission away is how you stop somebody creating tasks.
    expect(resolveTaskCreationScope('NONE', nothing)).toBe('NONE');
    expect(resolveTaskCreationScope(null, null)).toBe('NONE');
  });

  it('honours an explicit choice, which is a real decision about breadth', () => {
    expect(resolveTaskCreationScope('SELF', inSpace)).toBe('SELF');
    expect(resolveTaskCreationScope('ORG', inSpace)).toBe('ORG');
    expect(resolveTaskCreationScope('SPACE', nothing)).toBe('SPACE');
  });

  it('is case-insensitive about the stored value', () => {
    expect(resolveTaskCreationScope('org', inSpace)).toBe('ORG');
  });
});
