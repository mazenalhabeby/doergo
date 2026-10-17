import { spawnSync } from 'child_process';
import { join } from 'path';

/*
  Files and lines may get shorter, never longer (tools/size-ratchet.mjs,
  CODE_AUDIT.md §6). Run here so a change that grows an oversized file — or adds
  a new one over 300 lines / a line over 140 characters — fails the suite.
  Locked in after an improvement with `pnpm size:update` (it only ever lowers).
*/
describe('size ratchet', () => {
  it('no file or line grew past its recorded size', () => {
    const repo = join(__dirname, '..', '..', '..', '..', '..', '..');
    const run = spawnSync(process.execPath, [join(repo, 'tools', 'size-ratchet.mjs')], { cwd: repo, encoding: 'utf8' });
    expect(run.stderr).toBe('');
    expect(run.status).toBe(0);
  });
});
