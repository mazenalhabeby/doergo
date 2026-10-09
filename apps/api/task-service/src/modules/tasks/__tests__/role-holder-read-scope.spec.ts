import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * A holder of a task's OPEN role who has not taken it may read THE TASK — enough
 * to decide whether to take it. Not what the crew already did on it.
 *
 * `roleHolderMayRead` was passed by the step submissions and the comments too,
 * so anybody holding "Mechanic" in the workspace could read a customer's
 * signature and the signed photo links of a job they never took, and the
 * conversation on it. The scan pins which reads opt in; a new read that wants
 * the exemption must be added here, with a reason.
 */
describe('the open-role read exemption covers the task, not its work', () => {
  const src = readFileSync(join(__dirname, '..', 'tasks.service.ts'), 'utf8');

  /** The body of one `async name(` method, up to the next method. */
  const body = (name: string): string => {
    const start = src.indexOf(`async ${name}(`);
    expect(start).toBeGreaterThan(-1);
    const next = src.slice(start + 1).search(/\n  (?:async |private |public |protected )?[a-zA-Z]+\([^)]*\)?[^;\n]*\{\s*\n/);
    return next === -1 ? src.slice(start) : src.slice(start, start + 1 + next);
  };

  it.each(['getSubmissions', 'getComments'])('%s does not open to a role holder', (name) => {
    const code = body(name);
    expect(code).toMatch(/taskAccess\.assert\(task, data\)/);
    expect(code).not.toMatch(/roleHolderMayRead/);
  });

  it('the task read itself still does', () => {
    // Removing it everywhere would hide the very job they are offered.
    expect(body('getJobTime')).toMatch(/roleHolderMayRead:\s*true/);
  });
});
