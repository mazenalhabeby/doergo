/**
 * Telling a company from a person, in one place.
 *
 * The web grew a five-way segmented control and the phone grew nothing — it did
 * not even carry `type`, so every client created on a phone became a PERSON in
 * silence. Two clients asking the same question of the same endpoint is exactly
 * how the two answers drift, so the question is asked once, here, and both read
 * it.
 *
 * ⚠️ A filter is a pair of QUERY PARAMETERS, never a predicate over a fetched
 * page. The list is capped server-side; filtering after the fetch would narrow
 * a page that was already truncated, and "Companies" would quietly mean "the
 * companies among the first hundred clients by name".
 *
 * ⚠️ Contacts are EXCLUDED by default and that is the server's doing, not ours
 * (`contacts: 'exclude'` is the default in customers.service). A contact is a
 * person who works somewhere, not a client, and the CRM ladder bills per
 * client — so a firm with six contacts must never read as six clients. Asking
 * for them is deliberate and is its own filter.
 */

/** The filters a client book can be narrowed by. Order is display order. */
export const CLIENT_FILTERS = ['all', 'companies', 'people', 'contacts'] as const;
export type ClientFilter = (typeof CLIENT_FILTERS)[number];

/** i18n key per filter — the label itself is never written here. */
export const CLIENT_FILTER_KEYS: Record<ClientFilter, string> = {
  all: 'customers.filter.all',
  companies: 'customers.filter.companies',
  people: 'customers.filter.people',
  contacts: 'customers.filter.contacts',
};

export type ClientTypeParam = 'PERSON' | 'COMPANY';
export type ContactsParam = 'exclude' | 'only' | 'all';

/**
 * A filter as the two query parameters the server actually reads.
 *
 * `undefined` means "do not send it", which is not the same as sending a
 * default: an absent `contacts` lets the server keep its own exclusion rule,
 * while sending `'exclude'` pins ours on top of it. Absent is what we want.
 */
export function clientFilterQuery(filter: ClientFilter): {
  type?: ClientTypeParam;
  contacts?: ContactsParam;
} {
  switch (filter) {
    case 'companies':
      return { type: 'COMPANY' };
    case 'people':
      return { type: 'PERSON' };
    case 'contacts':
      return { contacts: 'only' };
    case 'all':
    default:
      return {};
  }
}

export function isClientFilter(value: unknown): value is ClientFilter {
  return typeof value === 'string' && (CLIENT_FILTERS as readonly string[]).includes(value);
}

/* ------------------------------------------------------------------ */

/** What a record is, for anything that has to draw or label it. */
export type ClientKind = 'COMPANY' | 'PERSON';

export function clientKind(customer: { type?: string | null } | null | undefined): ClientKind {
  // PERSON is the column default, so an absent type is a person — matching the
  // server rather than guessing. See `Customer.type` in schema.prisma.
  return customer?.type === 'COMPANY' ? 'COMPANY' : 'PERSON';
}

export function isCompany(customer: { type?: string | null } | null | undefined): boolean {
  return clientKind(customer) === 'COMPANY';
}

/**
 * The fields that exist only on a company.
 *
 * Read two ways on purpose: a form renders them when the type is COMPANY and
 * CLEARS them when it is not, and a record screen hides the whole block. One
 * list means a field added here cannot appear on the form and go missing from
 * the record — which is how `industry` ended up visible in one web surface and
 * absent from the other for a month.
 */
export const COMPANY_ONLY_FIELDS = ['legalName', 'website', 'industry', 'vatId', 'regNumber'] as const;
export type CompanyOnlyField = (typeof COMPANY_ONLY_FIELDS)[number];

export const COMPANY_FIELD_KEYS: Record<CompanyOnlyField, string> = {
  legalName: 'customers.fLegalName',
  website: 'customers.fWebsite',
  industry: 'customers.fIndustry',
  vatId: 'customers.fVatId',
  regNumber: 'customers.fRegNumber',
};

/**
 * Blank every company-only field when the record is a person.
 *
 * ⚠️ Blanked to `''`, never dropped. Dropping a key from a PATCH leaves the old
 * value on a record that is no longer a company — switch a client from company
 * to person and its VAT number would survive, invisible, and reappear the day
 * somebody switched it back.
 */
export function clearCompanyFields<T extends Record<string, unknown>>(input: T, kind: ClientKind): T {
  if (kind === 'COMPANY') return input;
  const out = { ...input };
  for (const field of COMPANY_ONLY_FIELDS) {
    if (field in out) (out as Record<string, unknown>)[field] = '';
  }
  return out;
}
