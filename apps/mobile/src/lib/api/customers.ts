import { fetchWithAuth } from './client';
import { buildUrlWithQuery, type ClientTypeParam, type ContactsParam } from '@hbcfield/shared/client';

/** One custom fact about a client — the shape `Customer.details` holds. */
export interface CustomerDetail {
  label: string;
  value: string;
}

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
  /**
   * The company this person already contacts, if any — primary first.
   *
   * ⚠️ Already on the wire: `decorateContacts` in customers.service adds it to
   * every row the LIST returns, so nothing was added to the response to make
   * the contact picker able to say "already a contact at Siemens". That line is
   * the whole reason the picker prevents duplicates rather than merely allowing
   * them: a member who can see where somebody already is does not re-type them.
   *
   * Null on a COMPANY row — the server only fills it for a person.
   */
  contactOf?: { id: string; name: string; role?: string | null } | null;
  spaceId?: string | null;
  /**
   * The members who look after this client — ids only, no names.
   *
   * ⚠️ Already on the wire: `customerSelect` in auth-service has selected it
   * since long before this type mentioned it, so nothing was added to the
   * response to make the reminder composer able to say "remind ME". It decides
   * who a reminder with no assignee reaches, which is why the composer only
   * offers to name somebody who is ON this list.
   */
  managerIds?: string[] | null;
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
   * Anything about this client the eight columns have no room for.
   *
   * ⚠️ Already on the wire and already stored: `Customer.details` is a JSON
   * `[{label, value}]` list the web has written since the client record was
   * built, and `customerSelect` has always returned it. Nothing was added to
   * the API to let the card scanner keep a Facebook page or an IBAN — only this
   * type, which had never mentioned it.
   *
   * The server sanitises: a row needs a non-empty string label and value, the
   * label is capped at 80 characters and the value at 2000, and at most 30 rows
   * survive. Anything else is dropped rather than refused.
   */
  details?: CustomerDetail[] | null;
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

  /*
    What a REMINDER is for, and how it fires. Null on every other kind.

    ⚠️ `reminderKind: 'CALL'` is an INTENT — remind me to ring them — and is not
    the same thing as `type: 'CALL'`, which is the RECORD of a call that
    happened. Same word, opposite direction in time; see `crm/reminder.ts` in
    shared. A reminder row must print its reason for exactly this reason.

    ⚠️ Already returned: `listActivities` takes the whole row with no `select`,
    so these arrived with every timeline read long before the phone read them.
  */
  reminderKind?: string | null;
  /** Fire this many minutes BEFORE `dueAt`. 0 = at the time. */
  remindBeforeMin?: number | null;
  /** NONE | DAILY | WEEKLY | MONTHLY. */
  repeat?: string | null;
  /** Null = every manager of this client. */
  reminderAssigneeId?: string | null;
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
    /**
     * `false` = B2B clients only, `true` = portal residents only, omitted = all.
     *
     * The contact picker sends `false`: a resident is somebody's tenant with an
     * app login, not a person you name as the contact at a firm, and offering
     * them is how one gets linked by mistake.
     */
    portalResident?: boolean;
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
    /** What the record has no column for — see `CustomerDetail`. */
    details?: CustomerDetail[];
  }): Promise<MobileCustomer> =>
    fetchWithAuth<MobileCustomer>('/customers', { method: 'POST', body: JSON.stringify(input) }),

  get: (id: string): Promise<MobileCustomer> =>
    fetchWithAuth<MobileCustomer>(`/customers/${id}`),
  update: (id: string, dto: Partial<MobileCustomer>): Promise<MobileCustomer> =>
    fetchWithAuth<MobileCustomer>(`/customers/${id}`, { method: 'PATCH', body: JSON.stringify(dto) }),
  activities: (id: string): Promise<MobileCustomerActivity[]> =>
    fetchWithAuth<MobileCustomerActivity[]>(`/customers/${id}/activities`),
  /**
   * Log a note, a call that happened, or a reminder.
   *
   * ⚠️ The phone no longer AUTHORS a `CALL` — the composer offers Note and
   * Reminder only, because `type: 'CALL'` sat three rows above
   * `reminderKind: 'CALL'` and the two mean opposite things. The endpoint still
   * accepts one (the web and the server both produce them, and there is
   * history), so nothing here narrowed.
   *
   * ⚠️ The four reminder fields have been accepted by the gateway since the
   * feature was built; the phone simply never sent them. Build them with
   * `reminderPayload()` from shared rather than by hand — it drops a value the
   * server does not recognise instead of letting it persist as a string nothing
   * will ever schedule.
   */
  addActivity: (
    id: string,
    input: {
      type?: string; body?: string; dueAt?: string;
      reminderKind?: string; remindBeforeMin?: number;
      reminderAssigneeId?: string | null; repeat?: string;
    },
  ): Promise<MobileCustomerActivity> =>
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
