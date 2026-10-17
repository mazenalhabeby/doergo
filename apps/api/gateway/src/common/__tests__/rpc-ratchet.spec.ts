import { spawnSync } from 'child_process';
import { join } from 'path';

/*
  Message patterns written as strings ({ cmd: 'x' }) may only disappear
  (tools/rpc-ratchet.mjs). A string pattern carries no types — the payload is
  `any` at both ends; a contract in packages/shared/src/microservices/contracts
  types both. Locked in after an improvement with `node tools/rpc-ratchet.mjs --update`.
*/
describe('rpc ratchet', () => {
  it('no file gained a string message pattern', () => {
    const repo = join(__dirname, '..', '..', '..', '..', '..', '..');
    const run = spawnSync(process.execPath, [join(repo, 'tools', 'rpc-ratchet.mjs')], { cwd: repo, encoding: 'utf8' });
    expect(run.stderr).toBe('');
    expect(run.status).toBe(0);
  });
});
