/** Message contracts for auth-service `customers` handlers (types only — the wire is the cmd string). */
import { rpc } from '../contract';

/** Who is making the request — used to resolve & enforce CRM abilities. */
export interface CrmCaller {
  userId?: string;
  role?: string;
}

export interface CustomerInput {
  /** Made on the phone when creating; ignored on update. */
  id?: string;
  name?: string;
  contactName?: string | null;
  email?: string | null;
  phone?: string | null;
  address?: string | null;
  notes?: string | null;
  isActive?: boolean;
  isPortalResident?: boolean;
  portalId?: string | null;
  spaceId?: string | null;
  ownerId?: string | null;
  managerIds?: string[] | null;
  status?: string;
  type?: string;
  legalName?: string | null;
  website?: string | null;
  industry?: string | null;
  vatId?: string | null;
  regNumber?: string | null;
  /** The language email to this client is written in; null / "" = not set. */
  locale?: string | null;
  /** Invoice currency outside a workspace; null / "" = the organization's. */
  currency?: string | null;
  /** The company that invoices this client outside a workspace; null / "" = the main one. */
  legalEntityId?: string | null;
  details?: CustomerDetail[] | null;
}

export interface CustomerDetail {
  label: string;
  value: string;
}

export const customerMatchKeys = rpc<{ organizationId: string; caller?: CrmCaller }>('customer_match_keys');
export const importCustomerContacts = rpc<{ organizationId: string; body: unknown; caller?: CrmCaller }>(
  'import_customer_contacts',
);
export const listCustomers = rpc<{
  organizationId: string;
  search?: string;
  status?: 'active' | 'inactive' | 'all';
  portalResident?: boolean;
  portalId?: string;
  spaceId?: string;
  /** …plus clients belonging to no workspace. */
  includeUnfiled?: boolean;
  /** Contact people: excluded by default, 'only' = the Contacts segment, 'all' = search. */
  contacts?: 'exclude' | 'only' | 'all';
  /** PERSON | COMPANY. */
  type?: string;
  page?: number;
  limit?: number;
  caller?: CrmCaller;
}>('list_customers');
export const getCustomer = rpc<{ id: string; organizationId: string; caller?: CrmCaller }>('get_customer');
export const createCustomer = rpc<{ organizationId: string; dto: CustomerInput; caller?: CrmCaller }>(
  'create_customer',
);
export const updateCustomer = rpc<{
  id: string;
  organizationId: string;
  dto: CustomerInput;
  actorId?: string;
  caller?: CrmCaller;
}>('update_customer');
export const deleteCustomer = rpc<{ id: string; organizationId: string; caller?: CrmCaller }>('delete_customer');
export const listCustomerContacts = rpc<{ companyId: string; organizationId: string; caller?: CrmCaller }>(
  'list_customer_contacts',
);
export const listCustomerContactCompanies = rpc<{ personId: string; organizationId: string; caller?: CrmCaller }>(
  'list_customer_contact_companies',
);
export const addCustomerContact = rpc<{
  companyId: string;
  organizationId: string;
  personId?: string;
  person?: { name?: string; email?: string | null; phone?: string | null };
  role?: string | null;
  isPrimary?: boolean;
  caller?: CrmCaller;
}>('add_customer_contact');
export const updateCustomerContact = rpc<{
  linkId: string;
  organizationId: string;
  role?: string | null;
  isPrimary?: boolean;
  caller?: CrmCaller;
}>('update_customer_contact');
export const removeCustomerContact = rpc<{ linkId: string; organizationId: string; caller?: CrmCaller }>(
  'remove_customer_contact',
);
export const promoteCustomerContact = rpc<{ personId: string; organizationId: string; caller?: CrmCaller }>(
  'promote_customer_contact',
);
export const customersDue = rpc<{
  organizationId: string;
  caller?: CrmCaller;
  crmOn?: boolean;
  dayStart?: string;
  dayEnd?: string;
  limit?: number;
}>('customers_due');
export const listCustomerActivities = rpc<{ customerId: string; organizationId: string; caller?: CrmCaller }>(
  'list_customer_activities',
);
export const addCustomerActivity = rpc<{
  customerId: string;
  organizationId: string;
  type?: string;
  body?: string;
  dueAt?: string;
  authorId?: string;
  reminderKind?: string;
  remindBeforeMin?: number;
  reminderAssigneeId?: string | null;
  repeat?: string;
  caller?: CrmCaller;
  /** Made on the phone: an activity logged twice is one activity. */
  clientId?: string;
}>('add_customer_activity');
export const updateCustomerActivity = rpc<{
  id: string;
  customerId: string;
  organizationId: string;
  body?: string;
  dueAt?: string | null;
  done?: boolean;
  reminderKind?: string;
  remindBeforeMin?: number;
  reminderAssigneeId?: string | null;
  repeat?: string;
  caller?: CrmCaller;
}>('update_customer_activity');
export const deleteCustomerActivity = rpc<{
  id: string;
  customerId: string;
  organizationId: string;
  caller?: CrmCaller;
}>('delete_customer_activity');
