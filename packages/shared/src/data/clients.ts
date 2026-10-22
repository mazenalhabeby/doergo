/**
 * Published reads of auth-service's client tables (`Customer` and its relatives) — see db.ts.
 * Owner: auth-service.
 */
import type { On } from './db';

/** Is this client the organization's? */
export async function clientInOrg(db: On<'customer', 'findFirst'>, customerId: string, organizationId: string) {
  return !!(await db.customer.findFirst({ where: { id: customerId, organizationId }, select: { id: true } }));
}
