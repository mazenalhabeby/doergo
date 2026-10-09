import * as fs from 'fs';
import * as path from 'path';

/*
  ONE service answers each message pattern.

  Every service listens on the same Redis bus. When two register the same
  `{ cmd }`, BOTH answer and the gateway takes whichever reply lands first —
  so the behaviour depends on timing. That is not a theory: `get_technician_
  performance` was handled by auth-service and task-service, the copies had
  diverged (only one narrowed to the caller's workspaces), and a supervisor was
  sometimes handed the whole organization's figures.

  The allow-list is for patterns that are deliberately the same question asked
  of every service, where any answer is a correct answer.
*/
const API = path.resolve(__dirname, '../../../..');
const SERVICES = ['auth-service', 'task-service', 'notification-service', 'tracking-service'];
const ALLOWED_IN_SEVERAL: Record<string, string> = {
  health: 'each service reports its own liveness; the gateway only asks "is anything up"',
};

function* walk(dir: string): Generator<string> {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name !== 'node_modules' && e.name !== '__tests__' && e.name !== 'dist') yield* walk(full);
    } else if (e.name.endsWith('.ts') && !e.name.endsWith('.spec.ts')) yield full;
  }
}

describe('message patterns', () => {
  const owners = new Map<string, Set<string>>();
  for (const svc of SERVICES) {
    const src = path.join(API, svc, 'src');
    if (!fs.existsSync(src)) continue;
    for (const file of walk(src)) {
      const code = fs.readFileSync(file, 'utf8');
      for (const m of code.matchAll(/@MessagePattern\(\s*\{\s*cmd:\s*['"]([^'"]+)['"]/g)) {
        const set = owners.get(m[1]!) ?? new Set<string>();
        set.add(svc);
        owners.set(m[1]!, set);
      }
    }
  }

  it('finds the handlers (an empty scan would pass anything)', () => {
    expect(owners.size).toBeGreaterThan(200);
  });

  it('each one is answered by exactly one service', () => {
    const shared = [...owners]
      .filter(([cmd, svcs]) => svcs.size > 1 && !ALLOWED_IN_SEVERAL[cmd])
      .map(([cmd, svcs]) => `${cmd}: ${[...svcs].join(', ')}`);
    expect(shared).toEqual([]);
  });
});
