/**
 * Published reads of auth-service's client tables (`Customer` and its relatives) — see db.ts.
 * Owner: auth-service.
 */
import type { On } from './db';

/** Is this client the organization's? */
export async function clientInOrg(db: On<'customer', 'findFirst'>, customerId: string, organizationId: string) {
  return !!(await db.customer.findFirst({ where: { id: customerId, organizationId }, select: { id: true } }));
}

/** A member's open client reminders due in a window (assigned to them, or unassigned and theirs) — ≤ 300. */
export function dueClientReminders(
  db: On<'customerActivity', 'findMany'>,
  input: { organizationId: string; userId: string; from: Date; to: Date },
) {
  return db.customerActivity.findMany({
    where: {
      organizationId: input.organizationId,
      type: 'REMINDER',
      doneAt: null,
      dueAt: { gte: input.from, lt: input.to },
      OR: [{ reminderAssigneeId: input.userId }, { reminderAssigneeId: null, authorId: input.userId }],
    },
    select: { id: true, body: true, dueAt: true, reminderKind: true, customer: { select: { id: true, name: true } } },
    take: 300,
  });
}

/** The `{ id }` rows of these clients of the organization — in one workspace when given (`null` = none). */
export function clientIds(
  db: On<'customer', 'findMany'>,
  ids: string[],
  organizationId: string,
  inWorkspace?: string | null,
) {
  return db.customer.findMany({
    where: {
      id: { in: ids },
      organizationId,
      ...(inWorkspace === undefined ? {} : { spaceId: inWorkspace ?? '__none__' }),
    },
    select: { id: true },
  });
}

/** Name and contact details of these clients of the organization. */
export function clientContacts(db: On<'customer', 'findMany'>, ids: string[], organizationId: string) {
  return db.customer.findMany({
    where: { id: { in: ids }, organizationId },
    select: { id: true, name: true, email: true, phone: true },
  });
}
