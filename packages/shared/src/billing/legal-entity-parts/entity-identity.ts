/** Moved here unchanged from legal-entity.ts. */

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
export function issuerSnapshotOf(
  entity: LegalEntityIdentity,
  bank: BankAccountDetails | null,
  at = new Date(),
): IssuerSnapshot {
  const { id, ...rest } = entity;
  return { ...rest, legalEntityId: id, bank, frozenAt: at.toISOString() };
}

/** Address lines as printed: street, street 2, "postal city", "state", country. */
export function issuerAddressLines(
  e: Pick<LegalEntityIdentity, 'addressLine1' | 'addressLine2' | 'postalCode' | 'city' | 'state' | 'country'>,
): string[] {
  const cityLine = [e.postalCode, e.city].filter(Boolean).join(' ');
  return [e.addressLine1, e.addressLine2, [cityLine, e.state].filter(Boolean).join(', '), e.country].filter(
    (x): x is string => !!x && x.trim().length > 0,
  );
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
