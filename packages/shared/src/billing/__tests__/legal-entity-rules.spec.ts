import {
  resolveIssuerEntityId, nextInvoiceNumber, invoiceNumberPrefix, cleanIban, cleanBic, cleanRoutingNumber,
  parseLegalEntity, parseBankAccounts, bankForInvoice, issuerSnapshotOf, issuerAddressLines,
} from '@hbcfield/shared';

describe('legal-entity rules (shared)', () => {
  const active = new Set(['main', 'us', 'ws']);
  it('who issues: invoice → workspace → client → main; unusable ids fall through', () => {
    expect(resolveIssuerEntityId({ invoice: 'us', workspace: 'ws' }, 'main', active)).toBe('us');
    expect(resolveIssuerEntityId({ workspace: 'ws', client: 'us' }, 'main', active)).toBe('ws');
    expect(resolveIssuerEntityId({ invoice: 'foreign', client: 'us' }, 'main', active)).toBe('us');
    expect(resolveIssuerEntityId({}, 'main', active)).toBe('main');
    expect(resolveIssuerEntityId({}, 'gone', active)).toBeNull();
  });

  it('numbers: one series per prefix per year; the main keeps INV', () => {
    expect(nextInvoiceNumber('INV', 2026, null)).toBe('INV-2026-0001');
    expect(nextInvoiceNumber('US', 2026, 'US-2026-0041')).toBe('US-2026-0042');
    expect(nextInvoiceNumber('US', 2027, 'US-2026-0041')).toBe('US-2027-0001');
    expect(nextInvoiceNumber(null, 2026, 'INV-2026-0009')).toBe('INV-2026-0010');
    expect(invoiceNumberPrefix('at', 2026)).toBe('AT-2026-');
  });

  it('IBAN mod-97, BIC shape, ABA checksum', () => {
    expect(cleanIban('AT61 1904 3002 3457 3201')).toBe('AT611904300234573201');
    expect(cleanIban('AT61 1904 3002 3457 3202')).toBeNull();
    expect(cleanBic('bkauatww')).toBe('BKAUATWW');
    expect(cleanBic('BKAU')).toBeNull();
    expect(cleanRoutingNumber('021000021')).toBe('021000021');
    expect(cleanRoutingNumber('021000022')).toBeNull();
  });

  it('company details: refused with a code, never dropped', () => {
    expect(parseLegalEntity({})).toEqual({ ok: false, problem: 'LEGAL_NAME_REQUIRED' });
    expect(parseLegalEntity({ legalName: 'X', country: 'Austria' })).toEqual({ ok: false, problem: 'COUNTRY_INVALID' });
    expect(parseLegalEntity({ legalName: 'X', invoicePrefix: 'US-1' })).toEqual({ ok: false, problem: 'PREFIX_INVALID' });
    expect(parseLegalEntity({ legalName: 'X', email: 'nope' })).toEqual({ ok: false, problem: 'EMAIL_INVALID' });
    const ok = parseLegalEntity({ legalName: '  HBC   GmbH ', country: 'at', vatId: 'atu 123', invoicePrefix: '' });
    expect(ok).toEqual({ ok: true, value: { legalName: 'HBC GmbH', country: 'AT', vatId: 'ATU123', invoicePrefix: 'INV' } });
    // A partial update touches only what it names.
    expect(parseLegalEntity({ phone: '+1 555' }, true)).toEqual({ ok: true, value: { phone: '+1 555' } });
  });

  it('bank accounts: at most five, exactly one default, the invoice currency picks the account', () => {
    expect(parseBankAccounts(new Array(6).fill({ accountNumber: '1' }))).toEqual({ ok: false, problem: 'TOO_MANY_BANK_ACCOUNTS' });
    expect(parseBankAccounts([{ label: 'x' }])).toEqual({ ok: false, problem: 'BANK_ACCOUNT_EMPTY' });
    const r = parseBankAccounts([
      { accountNumber: '111', routingNumber: '021000021', currency: 'USD' },
      { iban: 'AT611904300234573201', currency: 'EUR', isDefault: true },
      { accountNumber: '333', isDefault: true },
    ]);
    if (!r.ok) throw new Error('expected ok');
    expect(r.value.map((a) => a.isDefault)).toEqual([false, true, false]);
    expect(bankForInvoice(r.value, 'USD')?.accountNumber).toBe('111');
    expect(bankForInvoice(r.value, 'GBP')?.iban).toBe('AT611904300234573201');
    expect(bankForInvoice([], 'EUR')).toBeNull();
  });

  it('snapshot keeps the id as legalEntityId and the moment it froze', () => {
    const at = new Date('2026-10-07T10:00:00Z');
    const snap = issuerSnapshotOf({ id: 'le1', legalName: 'HBC USA Inc.', invoicePrefix: 'US' } as any, null, at);
    expect(snap).toMatchObject({ legalEntityId: 'le1', legalName: 'HBC USA Inc.', bank: null, frozenAt: at.toISOString() });
    expect((snap as any).id).toBeUndefined();
    expect(issuerAddressLines({ addressLine1: '1 Main St', addressLine2: null, postalCode: '10001', city: 'New York', state: 'NY', country: 'US' }))
      .toEqual(['1 Main St', '10001 New York, NY', 'US']);
  });
});
