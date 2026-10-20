import { spawnSync } from 'child_process';
import { join } from 'path';

/*
  The structure ratchet (tools/structure-check.mjs, docs/plans/code-structure-fix.md Phase 0):
  split-looking file names, import loops, server code reachable from @hbcfield/shared/client and
  translation keys nobody reads may only shrink. Run here so a change that adds one fails the suite,
  exactly like the size ratchet beside it. Locked in after an improvement with `pnpm structure:update`.
*/
describe('structure ratchet', () => {
  it('adds no split name, import loop, client leak or unused translation key', () => {
    const repo = join(__dirname, '..', '..', '..', '..', '..', '..');
    const run = spawnSync(process.execPath, [join(repo, 'tools', 'structure-check.mjs')], {
      cwd: repo,
      encoding: 'utf8',
    });
    expect(run.stderr).toBe('');
    expect(run.status).toBe(0);
  });
});
