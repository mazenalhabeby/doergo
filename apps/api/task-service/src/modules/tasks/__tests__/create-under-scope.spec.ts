import { Role } from '@hbcfield/shared';

/**
 * Who may add work UNDER an existing task — subtasks, and the dependencies
 * that order them.
 *
 * These three routes were `@RequirePermission('canCreateTasks')`, the flat ORG
 * column, so a supervisor granted "create tasks" by a SPACE role could open a
 * job at their own site and then be refused the moment they broke it into
 * steps. The control was offered and the action was not, which reads as a
 * broken app rather than a permission.
 *
 * The guard now accepts a grant held in any space, which is only safe because
 * the service decides against the real task: every one of these routes takes a
 * task id straight from the caller, so without this rule a member granted in
 * one space could hang a subtask off any task in the organization.
 */
describe('adding work under a task, against that task’s own space', () => {
  /** `assertMayCreateUnder` as the service applies it. */
  const may = (
    task: { spaceId: string | null },
    caller: { userRole?: string; canCreateTasks?: boolean; createSpaceIds?: string[] },
  ) => {
    if (caller.userRole === Role.ADMIN) return true;
    if (caller.canCreateTasks === true) return true;
    return !!(task.spaceId && caller.createSpaceIds?.includes(task.spaceId));
  };

  const mine = { spaceId: 's1' };
  const theirs = { spaceId: 's2' };
  const spaceless = { spaceId: null };
  const supervisor = { userRole: Role.EMPLOYEE, canCreateTasks: false, createSpaceIds: ['s1'] };

  it('lets a space-granted supervisor break down a job at their own site', () => {
    // The reported failure: the whole point of the change.
    expect(may(mine, supervisor)).toBe(true);
  });

  it('refuses the same person on a task in a space they do not hold', () => {
    expect(may(theirs, supervisor)).toBe(false);
  });

  it('refuses a task with no space at all', () => {
    // Nothing to match the grant against — a space grant cannot reach it.
    expect(may(spaceless, supervisor)).toBe(false);
  });

  it('still lets an org-wide holder and an admin work anywhere', () => {
    expect(may(theirs, { userRole: Role.EMPLOYEE, canCreateTasks: true })).toBe(true);
    expect(may(spaceless, { userRole: Role.ADMIN })).toBe(true);
  });

  it('refuses somebody holding the permission nowhere', () => {
    expect(may(mine, { userRole: Role.EMPLOYEE, canCreateTasks: false, createSpaceIds: [] })).toBe(false);
    expect(may(mine, { userRole: Role.EMPLOYEE })).toBe(false);
  });

  it('an empty grant list matches nothing — it is not "unset"', () => {
    // [] means granted nowhere; undefined means the caller did not scope the
    // question. Collapsing the two is how a scoped member gets org-wide reach.
    expect(may(mine, { userRole: Role.EMPLOYEE, canCreateTasks: false, createSpaceIds: [] })).toBe(false);
  });

  describe('a dependency is checked at BOTH ends', () => {
    // "B cannot start until A finishes" constrains A as much as B, so linking
    // is a change to both tasks. Checking only the one named in the route would
    // let a member reach into a space they hold nothing in and order the work.
    const mayLink = (
      a: { spaceId: string | null },
      b: { spaceId: string | null },
      caller: Parameters<typeof may>[1],
    ) => may(a, caller) && may(b, caller);

    it('allows a link wholly inside their space', () => {
      expect(mayLink(mine, mine, supervisor)).toBe(true);
    });

    it('refuses a link that reaches into another space', () => {
      expect(mayLink(mine, theirs, supervisor)).toBe(false);
      expect(mayLink(theirs, mine, supervisor)).toBe(false);
    });
  });
});
