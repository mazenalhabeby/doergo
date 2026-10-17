/** Message contracts for auth-service `search` handlers (types only — the wire is the cmd string). */
import { rpc } from '../contract';

export const searchPeopleAndCustomers = rpc<{ organizationId: string; query: string; limit?: number }>(
  'search_people_and_customers',
);
