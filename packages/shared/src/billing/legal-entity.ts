/**
 * COMPANIES — several legal entities inside one organization (docs/plans/companies-legal-entities.md).
 *
 * An organization is where people work; a legal entity is whose name goes on the paper. HBC GmbH
 * and HBC USA Inc. share people, clients and workspaces, and differ only in the identity an
 * invoice or a contract carries. These rules are read by the server AND the web, so who issues an
 * invoice, how it is numbered and what is frozen on it cannot drift between them.
 */
import { parseCurrency } from './currency';

export const LEGAL_ENTITY_LABEL_MAX = 60;
export const LEGAL_NAME_MAX = 160;
export const MAX_BANK_ACCOUNTS = 5;
export const DEFAULT_INVOICE_PREFIX = 'INV';

export interface LegalEntityIdentity {
  id: string;
  legalName: string;
  label: string | null;
  addressLine1: string | null;
  addressLine2: string | null;
  postalCode: string | null;
  city: string | null;
  state: string | null;
  country: string | null;
  vatId: string | null;
  taxId: string | null;
  registerNumber: string | null;
  email: string | null;
  phone: string | null;
  website: string | null;
  logoUrl: string | null;
  currency: string | null;
  invoicePrefix: string;
}

export interface BankAccountDetails {
  label: string | null;
  holder: string | null;
  bankName: string | null;
  iban: string | null;
  bic: string | null;
  accountNumber: string | null;
  routingNumber: string | null;
  currency: string | null;
}

/** What an issued invoice keeps of its issuer — frozen, so a later edit never rewrites a filed document. */
export interface IssuerSnapshot extends Omit<LegalEntityIdentity, 'id'> {
  legalEntityId: string;
  bank: BankAccountDetails | null;
  frozenAt: string;
}

/**
 * Who issues an invoice: its own choice → the workspace's → the client's → the main entity.
 * `active` is the set of this organization's ACTIVE entity ids — a foreign, deleted or switched-off
 * id never resolves, it falls through to the next level.
 */
export function resolveIssuerEntityId(
  levels: { invoice?: string | null; workspace?: string | null; client?: string | null },
  main: string | null,
  active: ReadonlySet<string>,
): string | null {
  for (const id of [levels.invoice, levels.workspace, levels.client]) {
    if (id && active.has(id)) return id;
  }
  return main && active.has(main) ? main : null;
}

/** `INV-2026-0042`, `AT-2026-0042` — one series per entity per year. */
export function invoiceNumberPrefix(prefix: string | null | undefined, year: number): string {
  return `${(prefix || DEFAULT_INVOICE_PREFIX).toUpperCase()}-${year}-`;
}

export function nextInvoiceNumber(prefix: string | null | undefined, year: number, lastNumber: string | null): string {
  const head = invoiceNumberPrefix(prefix, year);
  let seq = 1;
  if (lastNumber && lastNumber.startsWith(head)) {
    const n = parseInt(lastNumber.slice(head.length), 10);
    if (Number.isFinite(n) && n > 0) seq = n + 1;
  }
  return `${head}${String(seq).padStart(4, '0')}`;
}

/** The snapshot an issued invoice keeps. */
export function issuerSnapshotOf(entity: LegalEntityIdentity, bank: BankAccountDetails | null, at = new Date()): IssuerSnapshot {
  const { id, ...rest } = entity;
  return { ...rest, legalEntityId: id, bank, frozenAt: at.toISOString() };
}

/** Address lines as printed: street, street 2, "postal city", "state", country. */
export function issuerAddressLines(e: Pick<LegalEntityIdentity, 'addressLine1' | 'addressLine2' | 'postalCode' | 'city' | 'state' | 'country'>): string[] {
  const cityLine = [e.postalCode, e.city].filter(Boolean).join(' ');
  return [e.addressLine1, e.addressLine2, [cityLine, e.state].filter(Boolean).join(', '), e.country].filter((x): x is string => !!x && x.trim().length > 0);
}

// ─── validation ─────────────────────────────────────────────────────────────

/** IBAN: 2 letters, 2 digits, up to 30 alphanumerics, mod-97 = 1. Returned compact and upper-case. */
export function cleanIban(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  const s = v.replace(/\s+/g, '').toUpperCase();
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]{11,30}$/.test(s)) return null;
  const moved = s.slice(4) + s.slice(0, 4);
  let rem = 0;
  for (const ch of moved) {
    const code = ch >= 'A' && ch <= 'Z' ? String(ch.charCodeAt(0) - 55) : ch;
    for (const d of code) rem = (rem * 10 + Number(d)) % 97;
  }
  return rem === 1 ? s : null;
}

/** BIC / SWIFT: 8 or 11 characters. */
export function cleanBic(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  const s = v.replace(/\s+/g, '').toUpperCase();
  return /^[A-Z]{4}[A-Z]{2}[A-Z0-9]{2}([A-Z0-9]{3})?$/.test(s) ? s : null;
}

/** US ABA routing number: 9 digits with the 3-7-1 checksum. */
export function cleanRoutingNumber(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  const s = v.replace(/\D/g, '');
  if (s.length !== 9) return null;
  const d = s.split('').map(Number);
  const sum = 3 * (d[0]! + d[3]! + d[6]!) + 7 * (d[1]! + d[4]! + d[7]!) + (d[2]! + d[5]! + d[8]!);
  return sum % 10 === 0 ? s : null;
}

/** Invoice prefix: 1–8 of A–Z / 0–9. */
export function cleanInvoicePrefix(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  const s = v.trim().toUpperCase();
  return /^[A-Z0-9]{1,8}$/.test(s) ? s : null;
}

const text = (v: unknown, max: number): string | null => {
  if (typeof v !== 'string') return null;
  const s = v.trim().replace(/\s+/g, ' ');
  return s ? s.slice(0, max) : null;
};

export type LegalEntityProblem =
  | 'LEGAL_NAME_REQUIRED' | 'COUNTRY_INVALID' | 'CURRENCY_INVALID' | 'PREFIX_INVALID'
  | 'EMAIL_INVALID' | 'WEBSITE_INVALID' | 'IBAN_INVALID' | 'BIC_INVALID' | 'ROUTING_INVALID'
  | 'BANK_ACCOUNT_EMPTY' | 'TOO_MANY_BANK_ACCOUNTS';

export type LegalEntityFields = Omit<LegalEntityIdentity, 'id'>;

/**
 * A company's details as they may be saved — every field cleaned, refused with a code when wrong
 * (never silently dropped: a mistyped IBAN on an invoice is money sent to nobody).
 */
export function parseLegalEntity(input: Record<string, unknown>, partial = false): { ok: true; value: Partial<LegalEntityFields> } | { ok: false; problem: LegalEntityProblem } {
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
    if (w && !/^(https?:\/\/)?[a-z0-9.-]+\.[a-z]{2,}(\/\S*)?$/i.test(w)) return { ok: false, problem: 'WEBSITE_INVALID' };
    out.website = w;
  }
  return { ok: true, value: out };
}

/** Bank accounts as they may be saved: at most five, each with an IBAN or an account number. */
export function parseBankAccounts(input: unknown): { ok: true; value: (BankAccountDetails & { isDefault: boolean })[] } | { ok: false; problem: LegalEntityProblem } {
  if (!Array.isArray(input)) return { ok: true, value: [] };
  if (input.length > MAX_BANK_ACCOUNTS) return { ok: false, problem: 'TOO_MANY_BANK_ACCOUNTS' };
  const out: (BankAccountDetails & { isDefault: boolean })[] = [];
  for (const raw of input) {
    const a = (raw ?? {}) as Record<string, unknown>;
    const ibanRaw = text(a.iban, 50), bicRaw = text(a.bic, 15), routingRaw = text(a.routingNumber, 15);
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
      label: text(a.label, 60), holder: text(a.holder, 160), bankName: text(a.bankName, 120),
      iban, bic, accountNumber, routingNumber: routing, currency: cur.ok ? cur.currency : null,
      isDefault: a.isDefault === true,
    });
  }
  // Exactly one default when there is any account: the first marked, else the first.
  const first = out.findIndex((x) => x.isDefault);
  out.forEach((x, i) => { x.isDefault = i === (first >= 0 ? first : 0); });
  return { ok: true, value: out };
}

/** The account printed on an invoice: the one in the invoice's currency, else the default. */
export function bankForInvoice<T extends BankAccountDetails & { isDefault: boolean }>(accounts: readonly T[], currency: string | null): T | null {
  if (!accounts.length) return null;
  return accounts.find((a) => currency && a.currency === currency) ?? accounts.find((a) => a.isDefault) ?? accounts[0]!;
}

// ─── a link to a company, as a workspace / client / member stores it ────────

interface LegalEntityLookup {
  legalEntity: { findFirst(args: { where: { id: string; organizationId: string; isActive: boolean }; select: { id: true } }): Promise<{ id: string } | null> };
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
  const row = await db.legalEntity.findFirst({ where: { id: value, organizationId, isActive: true }, select: { id: true } });
  return row ? { ok: true, id: row.id } : { ok: false };
}
