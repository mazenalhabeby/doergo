/** Moved here unchanged from legal-entity.ts. */
import { parseCurrency } from '../currency';
import {
  DEFAULT_INVOICE_PREFIX,
  LEGAL_ENTITY_LABEL_MAX,
  LEGAL_NAME_MAX,
  MAX_BANK_ACCOUNTS,
  cleanBic,
  cleanIban,
  cleanInvoicePrefix,
  cleanRoutingNumber,
  type BankAccountDetails,
  type LegalEntityIdentity,
} from './entity-identity';

const text = (v: unknown, max: number): string | null => {
  if (typeof v !== 'string') return null;
  const s = v.trim().replace(/\s+/g, ' ');
  return s ? s.slice(0, max) : null;
};

export type LegalEntityProblem =
  | 'LEGAL_NAME_REQUIRED'
  | 'COUNTRY_INVALID'
  | 'CURRENCY_INVALID'
  | 'PREFIX_INVALID'
  | 'EMAIL_INVALID'
  | 'WEBSITE_INVALID'
  | 'IBAN_INVALID'
  | 'BIC_INVALID'
  | 'ROUTING_INVALID'
  | 'BANK_ACCOUNT_EMPTY'
  | 'TOO_MANY_BANK_ACCOUNTS';

export type LegalEntityFields = Omit<LegalEntityIdentity, 'id'>;

/**
 * A company's details as they may be saved — every field cleaned, refused with a code when wrong
 * (never silently dropped: a mistyped IBAN on an invoice is money sent to nobody).
 */
export function parseLegalEntity(
  input: Record<string, unknown>,
  partial = false,
): { ok: true; value: Partial<LegalEntityFields> } | { ok: false; problem: LegalEntityProblem } {
  const out: Partial<LegalEntityFields> = {};
  const has = (k: string) => Object.prototype.hasOwnProperty.call(input, k) && input[k] !== undefined;
  if (!partial || has('legalName')) {
    const n = text(input.legalName, LEGAL_NAME_MAX);
    if (!n) return { ok: false, problem: 'LEGAL_NAME_REQUIRED' };
    out.legalName = n;
  }
  if (has('label')) out.label = text(input.label, LEGAL_ENTITY_LABEL_MAX);
  for (const k of ['addressLine1', 'addressLine2', 'city', 'state'] as const) if (has(k)) out[k] = text(input[k], 160);
  if (has('postalCode')) out.postalCode = text(input.postalCode, 20);
  if (has('vatId')) out.vatId = text(input.vatId, 40)?.replace(/\s+/g, '').toUpperCase() ?? null;
  if (has('taxId')) out.taxId = text(input.taxId, 40);
  if (has('registerNumber')) out.registerNumber = text(input.registerNumber, 60);
  if (has('phone')) out.phone = text(input.phone, 40);
  if (has('logoUrl')) out.logoUrl = text(input.logoUrl, 500);
  if (has('country')) {
    // Never truncated: "Austria" cut to two letters is "AU" — Australia.
    const c = text(input.country, 10)?.toUpperCase() ?? null;
    if (c && !/^[A-Z]{2}$/.test(c)) return { ok: false, problem: 'COUNTRY_INVALID' };
    out.country = c;
  }
  if (has('currency')) {
    const r = parseCurrency(input.currency, { optional: true });
    if (!r.ok) return { ok: false, problem: 'CURRENCY_INVALID' };
    out.currency = r.currency;
  }
  if (!partial || has('invoicePrefix')) {
    const raw = input.invoicePrefix;
    if (raw === undefined || raw === null || raw === '') out.invoicePrefix = DEFAULT_INVOICE_PREFIX;
    else {
      const p = cleanInvoicePrefix(raw);
      if (!p) return { ok: false, problem: 'PREFIX_INVALID' };
      out.invoicePrefix = p;
    }
  }
  if (has('email')) {
    const e = text(input.email, 200);
    if (e && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) return { ok: false, problem: 'EMAIL_INVALID' };
    out.email = e;
  }
  if (has('website')) {
    const w = text(input.website, 200);
    if (w && !/^(https?:\/\/)?[a-z0-9.-]+\.[a-z]{2,}(\/\S*)?$/i.test(w))
      return { ok: false, problem: 'WEBSITE_INVALID' };
    out.website = w;
  }
  return { ok: true, value: out };
}

/** Bank accounts as they may be saved: at most five, each with an IBAN or an account number. */
export function parseBankAccounts(
  input: unknown,
): { ok: true; value: (BankAccountDetails & { isDefault: boolean })[] } | { ok: false; problem: LegalEntityProblem } {
  if (!Array.isArray(input)) return { ok: true, value: [] };
  if (input.length > MAX_BANK_ACCOUNTS) return { ok: false, problem: 'TOO_MANY_BANK_ACCOUNTS' };
  const out: (BankAccountDetails & { isDefault: boolean })[] = [];
  for (const raw of input) {
    const a = (raw ?? {}) as Record<string, unknown>;
    const ibanRaw = text(a.iban, 50),
      bicRaw = text(a.bic, 15),
      routingRaw = text(a.routingNumber, 15);
    const iban = ibanRaw ? cleanIban(ibanRaw) : null;
    if (ibanRaw && !iban) return { ok: false, problem: 'IBAN_INVALID' };
    const bic = bicRaw ? cleanBic(bicRaw) : null;
    if (bicRaw && !bic) return { ok: false, problem: 'BIC_INVALID' };
    const routing = routingRaw ? cleanRoutingNumber(routingRaw) : null;
    if (routingRaw && !routing) return { ok: false, problem: 'ROUTING_INVALID' };
    const accountNumber = text(a.accountNumber, 40);
    if (!iban && !accountNumber) return { ok: false, problem: 'BANK_ACCOUNT_EMPTY' };
    const cur = parseCurrency(a.currency, { optional: true });
    out.push({
      label: text(a.label, 60),
      holder: text(a.holder, 160),
      bankName: text(a.bankName, 120),
      iban,
      bic,
      accountNumber,
      routingNumber: routing,
      currency: cur.ok ? cur.currency : null,
      isDefault: a.isDefault === true,
    });
  }
  // Exactly one default when there is any account: the first marked, else the first.
  const first = out.findIndex((x) => x.isDefault);
  out.forEach((x, i) => {
    x.isDefault = i === (first >= 0 ? first : 0);
  });
  return { ok: true, value: out };
}

/** The account printed on an invoice: the one in the invoice's currency, else the default. */
export function bankForInvoice<T extends BankAccountDetails & { isDefault: boolean }>(
  accounts: readonly T[],
  currency: string | null,
): T | null {
  if (!accounts.length) return null;
  return accounts.find((a) => currency && a.currency === currency) ?? accounts.find((a) => a.isDefault) ?? accounts[0]!;
}

// ─── a link to a company, as a workspace / client / member stores it ────────

interface LegalEntityLookup {
  legalEntity: {
    findFirst(args: {
      where: { id: string; organizationId: string; isActive: boolean };
      select: { id: true };
    }): Promise<{ id: string } | null>;
  };
}

export const COMPANY_UNKNOWN_MESSAGE = 'That company is not one of yours, or it is switched off.';

/**
 * A company link as it may be saved on a workspace, client or member: one of THIS organization's
 * active companies, or null ("" / null clear it — the default then applies). `undefined` means
 * "not in this request". Anything else is refused — never stored on trust from a form.
 */
export async function usableLegalEntityId(
  db: LegalEntityLookup,
  organizationId: string,
  value: unknown,
): Promise<{ ok: true; id: string | null | undefined } | { ok: false }> {
  if (value === undefined) return { ok: true, id: undefined };
  if (value === null || value === '') return { ok: true, id: null };
  if (typeof value !== 'string' || value.length > 40) return { ok: false };
  const row = await db.legalEntity.findFirst({
    where: { id: value, organizationId, isActive: true },
    select: { id: true },
  });
  return row ? { ok: true, id: row.id } : { ok: false };
}
