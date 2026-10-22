import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * The source of the task service, for the specs that pin what its code says.
 *
 * TasksService is a facade over single-purpose collaborators; the rules those
 * specs guard live in the collaborators now. Reading every file keeps each
 * guard on the same code it always covered. The facade comes LAST, so a
 * search for a method's body finds the implementation, not the hand-over.
 */
export const TASK_SERVICE_FILES = [
  'core/task-support.service.ts',
  'records/task-records.service.ts',
  'records/task-update.service.ts',
  'records/workflow-resync.service.ts',
  'records/task-portal.service.ts',
  'query/task-query.service.ts',
  'query/task-query.base.ts',
  'query/task-detail.service.ts',
  'status/task-status.service.ts',
  'status/task-status-gates.ts',
  'status/task-status-checks.ts',
  'status/task-status-write.ts',
  'status/task-status-after.ts',
  'status/task-status-crm.ts',
  'assignment/task-assignment.service.ts',
  'assignment/task-assignment.base.ts',
  'assignment/task-decline.service.ts',
  'assignment/task-crew-members.service.ts',
  'checklist/task-checklist.service.ts',
  'query/task-activity.service.ts',
  'assignment/technician-suggestion.service.ts',
  'records/task-hierarchy.service.ts',
  'core/task-scope.ts',
  'assignment/technician-scoring.ts',
  'tasks.service.ts',
];

/**
 * The published readers the task service asks for auth-service's tables (code-structure-fix 3.4) — the
 * queries that used to sit in these files, so a guard on a query's text still finds it.
 */
const SHARED_READERS = ['documents.ts', 'people-work.ts'];

export function readTaskServiceSource(): string {
  const own = TASK_SERVICE_FILES.map((f) => readFileSync(join(__dirname, '..', f), 'utf8'));
  const readers = SHARED_READERS.map((f) =>
    readFileSync(join(__dirname, '../../../../../../../packages/shared/src/data', f), 'utf8'),
  );
  return [...readers, ...own].join('\n');
}
