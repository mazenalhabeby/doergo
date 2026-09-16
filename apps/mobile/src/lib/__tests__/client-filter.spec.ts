import {
  CLIENT_FILTERS,
  clientFilterQuery,
  isClientFilter,
  clientKind,
  isCompany,
  COMPANY_ONLY_FIELDS,
  COMPANY_FIELD_KEYS,
  CLIENT_FILTER_KEYS,
  clearCompanyFields,
} from '@hbcfield/shared/client';

describe('a client filter is two query parameters', () => {
  it('asks the server, never the page', () => {
    expect(clientFilterQuery('companies')).toEqual({ type: 'COMPANY' });
    expect(clientFilterQuery('people')).toEqual({ type: 'PERSON' });
    expect(clientFilterQuery('contacts')).toEqual({ contacts: 'only' });
  });

  it('"all" sends NOTHING, so the server keeps its own contact exclusion', () => {
    // Sending contacts:'exclude' here would look identical today and diverge the
    // moment the server's default changes. Absent is not the same as default.
    expect(clientFilterQuery('all')).toEqual({});
    expect(Object.keys(clientFilterQuery('all'))).toHaveLength(0);
  });

  it('never asks for a type and contacts at once', () => {
    // 'contacts' is a person who works somewhere; pairing it with type=COMPANY
    // is a query that can only ever return nothing.
    for (const f of CLIENT_FILTERS) {
      const q = clientFilterQuery(f);
      expect(q.type !== undefined && q.contacts !== undefined).toBe(false);
    }
  });

  it('recognises only its own filters', () => {
    expect(isClientFilter('companies')).toBe(true);
    expect(isClientFilter('app')).toBe(false);
    expect(isClientFilter(undefined)).toBe(false);
  });

  it('every filter carries a translation key', () => {
    for (const f of CLIENT_FILTERS) expect(CLIENT_FILTER_KEYS[f]).toMatch(/^customers\.filter\./);
  });
});

describe('what a record is', () => {
  it('an absent type is a PERSON, matching the column default', () => {
    // The server defaults Customer.type to PERSON. A client that guessed
    // COMPANY here would draw a square avatar for every record the list
    // returned before `type` was added to the payload.
    expect(clientKind(undefined)).toBe('PERSON');
    expect(clientKind(null)).toBe('PERSON');
    expect(clientKind({})).toBe('PERSON');
    expect(clientKind({ type: null })).toBe('PERSON');
    expect(clientKind({ type: 'COMPANY' })).toBe('COMPANY');
    expect(isCompany({ type: 'COMPANY' })).toBe(true);
    expect(isCompany({ type: 'PERSON' })).toBe(false);
  });
});

describe('company-only fields', () => {
  it('every field carries a translation key', () => {
    for (const f of COMPANY_ONLY_FIELDS) expect(COMPANY_FIELD_KEYS[f]).toMatch(/^customers\.f/);
  });

  it('a person BLANKS them rather than dropping them', () => {
    // Dropping the key leaves the old value on a record that is no longer a
    // company: switch company -> person and the VAT number survives unseen.
    const out = clearCompanyFields(
      { name: 'Noor', legalName: 'BILLA AG', vatId: 'ATU123', website: 'billa.at' },
      'PERSON',
    );
    expect(out).toEqual({ name: 'Noor', legalName: '', vatId: '', website: '' });
    expect('vatId' in out).toBe(true);
  });

  it('a company is left exactly as it came', () => {
    const input = { name: 'BILLA AG', legalName: 'BILLA AG', vatId: 'ATU123' };
    expect(clearCompanyFields(input, 'COMPANY')).toEqual(input);
  });

  it('does not invent fields the caller never supplied', () => {
    // A PATCH must carry only what the form actually holds.
    const out = clearCompanyFields({ name: 'Noor' }, 'PERSON');
    expect(out).toEqual({ name: 'Noor' });
    expect('vatId' in out).toBe(false);
  });
});
