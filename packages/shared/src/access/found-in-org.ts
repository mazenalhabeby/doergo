import { NotFoundException } from '@nestjs/common';

/**
 * "Does this record exist FOR THIS CALLER?" — the one answer to both halves.
 *
 * A record that does not exist and a record that belongs to ANOTHER
 * organization must be refused identically: `404 {What} not found`. Answering
 * the second with a 403 ("does not belong to your organization") confirms that
 * the id is a real record somewhere — an existence oracle. Production did
 * exactly that for tasks and assets until 2026-10-10 (found by probing it).
 *
 * This was written out by hand ~45 times in task-service, in two shapes
 * (`if (!x || x.organizationId !== org)` and a missing-check followed by a
 * separate org-check), and the two-step shape is where the 403s crept in. One
 * function means one message format and one place to be wrong.
 *
 * An assertion function: after the call TypeScript knows `record` is non-null.
 *
 *   const sprint = await prisma.sprint.findUnique(...);
 *   assertFoundInOrg(sprint, data.organizationId, 'Sprint');
 *   sprint.name; // narrowed
 *
 * ⚠️ Only for records whose WHOLE boundary is the organization. A record that a
 * shared workspace's guest may legitimately see (tasks in a shared space) needs
 * the task gate (`TaskAccessService` / `isWithinTaskBoundary`), not this.
 */
export function assertFoundInOrg<T extends { organizationId?: string | null }>(
  record: T | null | undefined,
  organizationId: string,
  what: string,
): asserts record is T {
  if (!record || record.organizationId !== organizationId) {
    throw new NotFoundException(`${what} not found`);
  }
}
