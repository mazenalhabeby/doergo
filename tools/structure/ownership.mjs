/**
 * Data ownership (docs/data-ownership.md, Phase 3.3): each table has ONE service that may write it.
 * Lists every Prisma write (create/update/upsert/delete…) a service makes to a table it does not own.
 * Today's are recorded in the structure baseline and may only disappear; a new one fails.
 *
 * Owners are read from docs/data-ownership.md's "Owns" table, so the map and the check are one list.
 * ActivityLog (insert only) and CronLock (the job lease) are the agreed shared tables.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { REPO, sourceFiles } from './files.mjs';

const SERVICES = ['auth-service', 'task-service', 'gateway', 'notification-service', 'tracking-service'];
const SHORT = {
  auth: 'auth-service',
  task: 'task-service',
  notification: 'notification-service',
  tracking: 'tracking-service',
};
const SHARED = { ActivityLog: /^(create|createMany)$/, CronLock: /.*/ };
const WRITE =
  /\b(?:prisma|tx|db|client|this\.prisma)\.([a-z]\w*)\.(create|createMany|createManyAndReturn|update|updateMany|upsert|delete|deleteMany)\b/g;

function owners() {
  const md = readFileSync(join(REPO, 'docs/data-ownership.md'), 'utf8');
  const map = {};
  for (const m of md.matchAll(/^\| \*\*(auth|task|notification|tracking)\*\* \(\d+\) \| ([^|]+) \|$/gm))
    for (const name of m[2].split(',').map((x) => x.trim())) map[name] = SHORT[m[1]];
  return map;
}

/** "service: Model.op in file" for every write to a table another service owns. */
export function foreignWrites() {
  const own = owners();
  const out = new Set();
  for (const f of sourceFiles()) {
    const svc = SERVICES.find((s) => f.startsWith(`apps/api/${s}/src/`));
    if (!svc) continue;
    const text = readFileSync(join(REPO, f), 'utf8');
    for (const m of text.matchAll(WRITE)) {
      const model = m[1][0].toUpperCase() + m[1].slice(1);
      const owner = own[model];
      if (!owner || owner === svc) continue;
      if (SHARED[model]?.test(m[2])) continue;
      out.add(`${f} → ${model}.${m[2]} (owned by ${owner})`);
    }
  }
  return [...out].sort();
}
