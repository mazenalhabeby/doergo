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
// Nothing is shared any more: `health` was, and the gateway could not tell which
// service answered. Each now has `<service>_health`.
const ALLOWED_IN_SEVERAL: Record<string, string> = {};

function* walk(dir: string): Generator<string> {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name !== 'node_modules' && e.name !== '__tests__' && e.name !== 'dist') yield* walk(full);
    } else if (e.name.endsWith('.ts') && !e.name.endsWith('.spec.ts')) yield full;
  }
}

/*
  A handler names its pattern either as a string (`@MessagePattern({ cmd: 'x' })`) or through a
  typed contract (`@MessagePattern(pattern(createX))`, packages/shared/src/microservices/contracts).
  A contract is resolved to its cmd here, so both forms are owned alike.
*/
const CONTRACTS = path.resolve(API, '../../packages/shared/src/microservices/contracts');
const contractCmd = new Map<string, string>();
for (const file of fs.existsSync(CONTRACTS) ? walk(CONTRACTS) : []) {
  const code = fs.readFileSync(file, 'utf8');
  for (const m of code.matchAll(/export const (\w+) = rpc(?:<[\s\S]*?>)?\(\s*['"]([^'"]+)['"]\s*,?\s*\)/g)) {
    contractCmd.set(m[1]!, m[2]!);
  }
}

describe('message patterns', () => {
  const owners = new Map<string, Set<string>>();
  const unresolved: string[] = [];
  const own = (cmd: string, svc: string) => {
    const set = owners.get(cmd) ?? new Set<string>();
    set.add(svc);
    owners.set(cmd, set);
  };
  for (const svc of SERVICES) {
    const src = path.join(API, svc, 'src');
    if (!fs.existsSync(src)) continue;
    for (const file of walk(src)) {
      const code = fs.readFileSync(file, 'utf8');
      for (const m of code.matchAll(/@MessagePattern\(\s*\{\s*cmd:\s*['"]([^'"]+)['"]/g)) own(m[1]!, svc);
      for (const m of code.matchAll(/@MessagePattern\(\s*pattern\(\s*(\w+)\s*\)\s*\)/g)) {
        const cmd = contractCmd.get(m[1]!);
        if (cmd) own(cmd, svc);
        else unresolved.push(`${path.relative(API, file)}: ${m[1]}`);
      }
    }
  }

  it('finds the handlers (an empty scan would pass anything)', () => {
    expect(owners.size).toBeGreaterThan(200);
  });

  it('resolves every contract a handler names', () => {
    expect(unresolved).toEqual([]);
  });

  it('each one is answered by exactly one service', () => {
    const shared = [...owners]
      .filter(([cmd, svcs]) => svcs.size > 1 && !ALLOWED_IN_SEVERAL[cmd])
      .map(([cmd, svcs]) => `${cmd}: ${[...svcs].join(', ')}`);
    expect(shared).toEqual([]);
  });

  it('each service answers its own health pattern, and nobody the old shared one', () => {
    expect([...(owners.get('auth_health') ?? [])]).toEqual(['auth-service']);
    expect([...(owners.get('task_health') ?? [])]).toEqual(['task-service']);
    expect([...(owners.get('tracking_health') ?? [])]).toEqual(['tracking-service']);
    expect(owners.has('health')).toBe(false);
  });
});
