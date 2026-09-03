import { Role } from '@hbcfield/shared';

/**
 * Who may put somebody on a job — and take them off it.
 *
 * The three assignee routes were `@RequirePermission('canAssignTasks')`, the
 * flat ORG column, so a supervisor who runs a site could not add a second
 * person to a job AT that site while the job sat on their own task list. The
 * guard now accepts a grant held in any space, which moves the real decision
 * into the service, where the task's own space is known.
 *
 * That move is only safe if the service actually decides. The route takes a
 * task id straight from the caller: without this rule, a member granted
 * "assign" in one space could name any task in the organization and staff it.
 */
describe('assigning work, against the task’s own space', () => {
  /** `assertMayAssign` as the service applies it. */
  const mayAssign = (
    task: { spaceId: string | null },
    caller: { userRole?: string; canAssignTasks?: boolean; assignSpaceIds?: string[] },
  ) => {
    if (caller.userRole === Role.ADMIN) return true;
    if (caller.canAssignTasks === true) return true;
    return !!(task.spaceId && caller.assignSpaceIds?.includes(task.spaceId));
  };

  const inSpace = { spaceId: 's1' };
  const elsewhere = { spaceId: 's2' };
  const spaceless = { spaceId: null };

  it('lets an admin assign anywhere', () => {
    expect(mayAssign(elsewhere, { userRole: Role.ADMIN })).toBe(true);
    expect(mayAssign(spaceless, { userRole: Role.ADMIN })).toBe(true);
  });

  it('lets an org-wide holder assign anywhere', () => {
    expect(mayAssign(elsewhere, { canAssignTasks: true })).toBe(true);
  });

  it('lets a space-granted supervisor assign IN THEIR SPACE — the case that was refused', () => {
    expect(mayAssign(inSpace, { assignSpaceIds: ['s1'] })).toBe(true);
  });

  it('and refuses them on a task in another space', () => {
    expect(mayAssign(elsewhere, { assignSpaceIds: ['s1'] })).toBe(false);
  });

  it('refuses them on a task that belongs to no space', () => {
    // Nothing to match against; a space grant cannot cover a space-less task.
    expect(mayAssign(spaceless, { assignSpaceIds: ['s1'] })).toBe(false);
  });

  it('refuses somebody with no grant at all', () => {
    expect(mayAssign(inSpace, {})).toBe(false);
    expect(mayAssign(inSpace, { assignSpaceIds: [] })).toBe(false);
  });

  /*
    Whose name may be typed in.

    The suggestion list is narrowed to the site's roster, but the route accepts
    a user id directly — so the narrowing has to be a boundary rather than a
    hint, or a client's supervisor could staff their job with anybody in the
    organization by id.
  */
  describe('and whom they may add', () => {
    const targetAllowed = (
      task: { spaceId: string | null },
      caller: { userRole?: string; canAssignTasks?: boolean },
      rosteredSpaces: string[],
    ) => {
      if (caller.userRole === Role.ADMIN || caller.canAssignTasks === true) return true;
      return !!(task.spaceId && rosteredSpaces.includes(task.spaceId));
    };

    it('a space-scoped assigner may add somebody rostered on that site', () => {
      expect(targetAllowed(inSpace, {}, ['s1', 's4'])).toBe(true);
    });

    it('and may not add somebody who works elsewhere', () => {
      expect(targetAllowed(inSpace, {}, ['s2'])).toBe(false);
    });

    it('an org-wide assigner is unrestricted, as before', () => {
      expect(targetAllowed(inSpace, { canAssignTasks: true }, ['s2'])).toBe(true);
    });
  });

  /*
    The suggestion endpoint returns names, ratings, workloads and last known
    positions. Unnarrowed, it hands a client's supervisor the whole staff
    directory through a door marked "who should do this job".
  */
  describe('who may be suggested', () => {
    const candidates = (
      caller: { userRole?: string; canAssignTasks?: boolean },
      org: string[],
      roster: string[],
    ) => (caller.userRole === Role.ADMIN || caller.canAssignTasks === true ? org : roster);

    it('org-wide: everybody, unchanged', () => {
      expect(candidates({ canAssignTasks: true }, ['a', 'b', 'c'], ['a'])).toEqual(['a', 'b', 'c']);
    });

    it('space-scoped: the site’s roster only', () => {
      expect(candidates({}, ['a', 'b', 'c'], ['a'])).toEqual(['a']);
    });
  });
});
