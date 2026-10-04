import {
  parseCurrency, resolveInvoiceCurrency, workspaceCurrency, crossRate,
  parseExchangeRate, toOrganizationCurrency,
} from '@hbcfield/shared';

/** Which currency an amount is in — the rules in packages/shared/src/billing/currency.ts. */
describe('currency', () => {
  it('a currency is chosen from the list; anything else is refused, not dropped', () => {
    expect(parseCurrency(' usd ')).toEqual({ ok: true, currency: 'USD' });
    expect(parseCurrency('XXX')).toEqual({ ok: false });
    expect(parseCurrency(12)).toEqual({ ok: false });
  });

  it('"" clears a workspace or client currency, but never the organization\'s', () => {
    expect(parseCurrency('', { optional: true })).toEqual({ ok: true, currency: null });
    expect(parseCurrency(null, { optional: true })).toEqual({ ok: true, currency: null });
    expect(parseCurrency('')).toEqual({ ok: false });
  });

  it('an invoice takes the workspace, then the client, then the organization', () => {
    const org = { currency: 'EUR' };
    expect(resolveInvoiceCurrency({ space: { currency: 'USD' }, customer: { currency: 'CHF' }, organization: org }))
      .toEqual({ currency: 'USD', source: 'workspace' });
    expect(resolveInvoiceCurrency({ space: { currency: null }, customer: { currency: 'CHF' }, organization: org }))
      .toEqual({ currency: 'CHF', source: 'client' });
    expect(resolveInvoiceCurrency({ space: null, customer: null, organization: org }))
      .toEqual({ currency: 'EUR', source: 'organization' });
    expect(resolveInvoiceCurrency({})).toEqual({ currency: 'EUR', source: 'organization' });
  });

  it('a workspace with no currency uses the organization\'s', () => {
    expect(workspaceCurrency({ currency: null }, { currency: 'GBP' })).toBe('GBP');
    expect(workspaceCurrency({ currency: 'USD' }, { currency: 'GBP' })).toBe('USD');
  });

  it('cross rates come from the euro reference rates', () => {
    const ecb = { USD: 1.1355, CHF: 0.9327 };
    expect(crossRate(ecb, 'USD', 'EUR')).toBe(0.880669);   // 1 / 1.1355
    expect(crossRate(ecb, 'EUR', 'USD')).toBe(1.1355);
    expect(crossRate(ecb, 'USD', 'CHF')).toBe(0.821400);   // 0.9327 / 1.1355
    expect(crossRate(ecb, 'EUR', 'EUR')).toBe(1);
    expect(crossRate(ecb, 'JPY', 'EUR')).toBeNull();        // no rate that day: no guess
  });

  it('an exchange rate is a positive number, or nothing', () => {
    expect(parseExchangeRate('0,9183')).toEqual({ ok: true, rate: 0.9183 });
    expect(parseExchangeRate('')).toEqual({ ok: true, rate: null });
    expect(parseExchangeRate(0)).toEqual({ ok: false });
    expect(parseExchangeRate(-1)).toEqual({ ok: false });
    expect(parseExchangeRate('abc')).toEqual({ ok: false });
  });

  it('converting needs a rate when the currencies differ — never a wrong figure', () => {
    expect(toOrganizationCurrency(8000, 'EUR', 'EUR', null)).toBe(8000);
    expect(toOrganizationCurrency(8000, 'USD', 'EUR', null)).toBeNull();
    expect(toOrganizationCurrency(8000, 'USD', 'EUR', 0.9183)).toBeCloseTo(7346.4);
  });
});
