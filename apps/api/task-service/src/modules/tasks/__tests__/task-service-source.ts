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
  'task-support.service.ts',
  'task-records.service.ts',
  'task-update.service.ts',
  'workflow-resync.service.ts',
  'task-portal.service.ts',
  'task-query.service.ts',
  'task-detail.service.ts',
  'task-status.service.ts',
  'task-status-gates.ts',
  'task-status-checks.ts',
  'task-status-write.ts',
  'task-status-after.ts',
  'task-status-crm.ts',
  'task-assignment.service.ts',
  'task-assignment.base.ts',
  'task-decline.service.ts',
  'task-crew-members.service.ts',
  'task-checklist.service.ts',
  'task-activity.service.ts',
  'technician-suggestion.service.ts',
  'task-hierarchy.service.ts',
  'task-scope.ts',
  'technician-scoring.ts',
  'tasks.service.ts',
];

export function readTaskServiceSource(): string {
  return TASK_SERVICE_FILES.map((f) => readFileSync(join(__dirname, '..', f), 'utf8')).join('\n');
}
