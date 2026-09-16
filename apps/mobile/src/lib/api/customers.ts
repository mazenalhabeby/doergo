import { fetchWithAuth } from './client';
import { buildUrlWithQuery, type ClientTypeParam, type ContactsParam } from '@hbcfield/shared/client';

export interface MobileCustomer {
  id: string;
  name: string;
  /** PERSON | COMPANY. Absent reads as PERSON — the column's own default. */
  type?: 'PERSON' | 'COMPANY' | null;
  contactName?: string | null;
  email?: string | null;
  phone?: string | null;
  status?: string;
  isPortalResident?: boolean;
  /** A person who works at a company — NOT a client, and never billed as one. */
  isContact?: boolean;
  spaceId?: string | null;
  notes?: string | null;
  /** Company-only. Blank on a person; see COMPANY_ONLY_FIELDS in shared. */
  legalName?: string | null;
  website?: string | null;
  industry?: string | null;
  vatId?: string | null;
  regNumber?: string | null;
  /** Language for emails (en|de|es|fr|it); null = same as the organization. */
  locale?: string | null;
  /**
   * The caller's CRM abilities on THIS record, returned by the single-client
   * read. The screen hides what may not be done; the server refuses it anyway.
   */
  crmCaps?: { view?: 'none' | 'own' | 'all'; work?: boolean; editInfo?: boolean; manage?: boolean } | null;
  createdAt?: string;
}

export interface MobileCustomerActivity {
  id: string;
  type: 'NOTE' | 'CALL' | 'EMAIL' | 'MEETING' | 'REMINDER' | 'STATUS' | 'SYSTEM';
  body?: string | null;
  dueAt?: string | null;
  doneAt?: string | null;
  metadata?: { from?: string; to?: string } | null;
  createdAt: string;
  author?: { id: string; firstName: string; lastName: string | null } | null;
}

export const customersApi = {
  /**
   * The client book, optionally narrowed to one workspace.
   *
   * `includeUnfiled` matters whenever a workspace is named: a client filed in
   * NO workspace is invisible to a strict space filter, and in a real book most
   * of them are. The server does that as one indexed OR — filtering here would
   * page-truncate before it filtered.
   */
  list: (params?: {
    spaceId?: string;
    includeUnfiled?: boolean;
    search?: string;
    limit?: number;
    /** 1-based. The list pages rather than capping — see PAGE_SIZE on the screen. */
    page?: number;
    /** From `clientFilterQuery()` in shared. Never hand-written at a call site. */
    type?: ClientTypeParam;
    contacts?: ContactsParam;
  }): Promise<MobileCustomer[]> =>
    fetchWithAuth<MobileCustomer[]>(buildUrlWithQuery('/customers', { ...params, limit: params?.limit ?? 100 })),
  /**
   * Add a client.
   *
   * `spaceId` is sent whenever one is chosen: a client filed in no workspace is
   * invisible in every workspace tab, and the gateway also uses it to default
   * the owner to the creator — which is what lets a rep see the client they
   * just added under their own "view own" scope.
   */
  create: (input: {
    name: string; type?: 'PERSON' | 'COMPANY';
    contactName?: string; email?: string; phone?: string;
    address?: string; notes?: string; spaceId?: string | null;
    /** null = same as the organization. */
    locale?: string | null;
    /** Company-only; blanked by `clearCompanyFields()` when the type is PERSON. */
    legalName?: string; website?: string; industry?: string; vatId?: string; regNumber?: string;
  }): Promise<MobileCustomer> =>
    fetchWithAuth<MobileCustomer>('/customers', { method: 'POST', body: JSON.stringify(input) }),

  get: (id: string): Promise<MobileCustomer> =>
    fetchWithAuth<MobileCustomer>(`/customers/${id}`),
  update: (id: string, dto: Partial<MobileCustomer>): Promise<MobileCustomer> =>
    fetchWithAuth<MobileCustomer>(`/customers/${id}`, { method: 'PATCH', body: JSON.stringify(dto) }),
  activities: (id: string): Promise<MobileCustomerActivity[]> =>
    fetchWithAuth<MobileCustomerActivity[]>(`/customers/${id}/activities`),
  addActivity: (id: string, input: { type?: string; body?: string; dueAt?: string }): Promise<MobileCustomerActivity> =>
    fetchWithAuth<MobileCustomerActivity>(`/customers/${id}/activities`, { method: 'POST', body: JSON.stringify(input) }),
  updateActivity: (id: string, activityId: string, input: { done?: boolean }): Promise<MobileCustomerActivity> =>
    fetchWithAuth<MobileCustomerActivity>(`/customers/${id}/activities/${activityId}`, { method: 'PATCH', body: JSON.stringify(input) }),

  /*
    Contact people — a person who works at a company.

    ⚠️ Read from BOTH ends by design: `contacts(companyId)` answers "who works
    here", `companies(personId)` answers "where does this person work". They are
    one row (`CustomerContact`) asked two ways, which is why neither screen
    needs to know how the link is stored.

    ⚠️ Detaching keeps the PERSON. `DELETE /customers/contacts/:linkId` removes
    the link, never the record — the person may work somewhere else tomorrow,
    and deleting them would take their history with them.
  */
  contacts: (companyId: string): Promise<MobileCustomerContact[]> =>
    fetchWithAuth<MobileCustomerContact[]>(`/customers/${companyId}/contacts`),
  companies: (personId: string): Promise<MobileCustomerContact[]> =>
    fetchWithAuth<MobileCustomerContact[]>(`/customers/${personId}/companies`),
  addContact: (
    companyId: string,
    input: { personId?: string; person?: { name: string; email?: string; phone?: string }; role?: string; isPrimary?: boolean },
  ): Promise<MobileCustomerContact> =>
    fetchWithAuth<MobileCustomerContact>(`/customers/${companyId}/contacts`, { method: 'POST', body: JSON.stringify(input) }),
  updateContact: (linkId: string, input: { role?: string; isPrimary?: boolean }): Promise<MobileCustomerContact> =>
    fetchWithAuth<MobileCustomerContact>(`/customers/contacts/${linkId}`, { method: 'PATCH', body: JSON.stringify(input) }),
  removeContact: (linkId: string): Promise<void> =>
    fetchWithAuth<void>(`/customers/contacts/${linkId}`, { method: 'DELETE' }),

  /** Where the work happens. One is primary; the rest are sites. */
  addresses: (id: string): Promise<MobileCustomerAddress[]> =>
    fetchWithAuth<MobileCustomerAddress[]>(`/customers/${id}/addresses`),
};

export interface MobileCustomerContact {
  /** The LINK's id — what detach and make-primary address, not the person's id. */
  id: string;
  role?: string | null;
  isPrimary?: boolean;
  /** The other end of the link, whichever end was asked. */
  person?: { id: string; name: string; email?: string | null; phone?: string | null } | null;
  company?: { id: string; name: string } | null;
}

export interface MobileCustomerAddress {
  id: string;
  label?: string | null;
  address?: string | null;
  isPrimary?: boolean;
  contactName?: string | null;
  contactPhone?: string | null;
}
