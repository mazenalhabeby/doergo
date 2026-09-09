import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * Staffing levels are not "the work".
 *
 * `canViewAllTasks` is held by the **External Observer** seat — €2, external,
 * whose entire purpose is to watch the work and raise a job. The leave list is
 * gated on it and has been since before cover existed. Attaching a cover
 * projection to that list, or opening a staffing endpoint on the same gate,
 * would hand an outsider a daily headcount of the company — the same mistake the
 * asset audit found, where one permission was doing duty for two different
 * things.
 *
 * So the rule, pinned here because it is invisible in a code review: anything
 * that reports HOW MANY PEOPLE are on the floor is gated on attendance.
 */
describe('cover never rides in on the task permission', () => {
  const controller = readFileSync(
    join(__dirname, '..', 'technicians.controller.ts'),
    'utf8',
  );

  /** The source with comments removed — a rule must not be satisfied by prose. */
  const code = controller
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');

  /** The decorators and body of one route, by its @Get path. */
  const route = (path: string): string => {
    const at = code.indexOf(`@Get('${path}')`);
    expect(at).toBeGreaterThan(-1);
    // Back up over this route's own decorators, forward to the next @Get/@Post.
    const from = code.lastIndexOf('\n\n', at);
    const rest = code.slice(at + 1);
    const nextIdx = rest.search(/\n\s*@(Get|Post|Patch|Delete)\(/);
    return code.slice(from, at + 1 + (nextIdx === -1 ? rest.length : nextIdx));
  };

  it('gates the live floor on attendance', () => {
    const r = route('floor-now');
    expect(r).toContain("@RequirePermissionInSpace('canViewSpaceAttendance')");
    expect(r).not.toContain("@RequirePermissionInSpace('canViewAllTasks')");
  });

  it('gates the cover range on attendance, not on tasks', () => {
    const r = route('cover-range');
    expect(r).toContain("@RequirePermissionInSpace('canViewSpaceAttendance')");
    expect(r).not.toContain("@RequirePermissionInSpace('canViewAllTasks')");
  });

  it('scopes both to the spaces attendance was granted in, never to task spaces', () => {
    for (const path of ['floor-now', 'cover-range']) {
      const r = route(path);
      expect(r).toContain("spacesGranting(user?.access as never, 'canViewSpaceAttendance')");
      expect(r).not.toContain("spacesGranting(user?.access as never, 'canViewAllTasks')");
    }
  });

  /*
    The leave list keeps its own, older gate — narrowing it would take the
    register away from people who legitimately read it today. What must not
    happen is the cover projection travelling on it unconditionally.
  */
  /*
    The task-service half of this pair — that an absent flag means NO — is
    asserted in that service's own suite, beside the code it constrains. A spec
    reaching across a service boundary by relative path breaks the first time
    either directory moves.
  */
  it('asks for attendance before attaching a cover projection to the leave list', () => {
    const r = route('time-off');
    expect(r).toContain('withCover');
    expect(r).toContain("spacesGranting(user?.access as never, 'canViewSpaceAttendance')");
  });

});
