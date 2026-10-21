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
/**
 * Writes the owner agreed to keep where they are, each with its reason (docs/data-ownership.md).
 * Joining = the account, the spent invitation code and the placement in ONE transaction: behind a
 * message, a task-service outage would leave an account in no workspace with its code already used.
 */
const ALLOWED = [
  // The calendar's own Organization columns (weekend, holiday country/region, feeds switch), read only
  // by task-service; switching feeds off goes with the feed-token wipe. Pinned by auth-owned-writes.spec.
  { file: 'apps/api/task-service/src/modules/calendar/holidays.service.ts', models: ['Organization'] },
  // The day leave tracking started commits with the first starting balances (one transaction).
  { file: 'apps/api/task-service/src/modules/technicians/leave-opening.service.ts', models: ['Organization'] },
  // Sign-up creates the organization AND its default task type in one transaction: an organization
  // without a workflow cannot create a task, and sign-up must not depend on task-service being up.
  { file: 'apps/api/auth-service/src/common/seed-default-workflow.ts', models: ['StatusWorkflow'] },
  // Deleting/merging a workspace role moves its holders and deletes it in ONE transaction.
  { file: 'apps/api/task-service/src/modules/space-roles/role-admin.service.ts', models: ['AccessRole'] },
  { file: 'apps/api/task-service/src/modules/space-roles/space-roles.base.ts', models: ['AccessRole'] },
  {
    file: 'apps/api/auth-service/src/modules/invitations/invitation-apply/placement.ts',
    models: ['SpaceAssignment', 'TechnicianSchedule'],
  },
];
// `\s*` around the dots: `this.prisma.user\n  .updateMany(...)` is a write too.
const WRITE =
  /\b(?:prisma|tx|db|client|this\.prisma)\s*\.\s*([a-z]\w*)\s*\.\s*(create|createMany|createManyAndReturn|update|updateMany|upsert|delete|deleteMany)\b/g;

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
      if (ALLOWED.some((a) => a.file === f && a.models.includes(model))) continue;
      out.add(`${f} → ${model}.${m[2]} (owned by ${owner})`);
    }
  }
  return [...out].sort();
}

/*
  Phase 3.4: READS of a table another service owns. Counted per "file → Model" so a file may only
  read less. What the count cannot see: reads through a relation of the service's own table
  (`include: { user: … }`) and raw SQL — those are the next layer, reviewed by hand.
  Reads through the owner's published readers (`packages/shared/src/data/`) are not in any service's
  src, so they do not count: that is the way out.
*/
const READ =
  /\b(?:prisma|tx|db|client|this\.prisma)\s*\.\s*([a-z]\w*)\s*\.\s*(findUnique|findUniqueOrThrow|findFirst|findFirstOrThrow|findMany|count|aggregate|groupBy)\b/g;

/** { "file → Model (owner)": number of direct reads } for every read of a table another service owns. */
export function foreignReads() {
  const own = owners();
  const out = {};
  for (const f of sourceFiles()) {
    const svc = SERVICES.find((s) => f.startsWith(`apps/api/${s}/src/`));
    if (!svc || f.includes('/__tests__/')) continue;
    for (const m of readFileSync(join(REPO, f), 'utf8').matchAll(READ)) {
      const model = m[1][0].toUpperCase() + m[1].slice(1);
      const owner = own[model];
      if (!owner || owner === svc) continue;
      const k = `${f} → ${model} (owned by ${owner})`;
      out[k] = (out[k] ?? 0) + 1;
    }
  }
  return Object.fromEntries(Object.entries(out).sort(([a], [b]) => a.localeCompare(b)));
}
