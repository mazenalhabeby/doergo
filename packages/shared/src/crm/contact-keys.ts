/**
 * Importing clients from a phone's address book — the contract both ends keep.
 *
 * Two things live here because the server and the phone must agree on them to
 * the character:
 *
 *   1. THE MATCH KEY. "Is this contact already a client?" is asked on the phone
 *      while the list is open, and asked again by the server when the import
 *      lands. A phone number written "+43 664 812 3390" on the phone and
 *      "0664 8123390" in the CRM is ONE person; both ends reduce it to the same
 *      key, or the list says "new" and the import makes a second client.
 *
 *   2. THE IMPORT BODY and its limits. The gateway refuses a malformed batch
 *      before a round trip; the service parses it again because it is the
 *      boundary. One parser, so the two refusals cannot disagree.
 *
 * ⚠️ NOTHING IN AN IMPORT NAMES AN EXISTING RECORD. The phone sends what it
 * read (a name, a number, an address) and the server decides what that
 * matches. A body that could say "fill client X" could fill any client.
 */

/** At most this many contacts in one import — one transaction, one screenful of decisions. */
export const CONTACT_IMPORT_MAX = 200;

/** How a client created by an import says where it came from (`CustomerActivity.metadata.source`). */
export const CONTACT_IMPORT_SOURCE = 'PHONE_CONTACTS' as const;

/**
 * The last 9 digits of a phone number.
 *
 * ⚠️ NOT E.164, and on purpose: turning "0664 8123390" into "+43 664…" needs
 * the country, and a phone's address book does not say which one a number was
 * saved in. The trailing digits are the subscriber number in every European
 * plan and survive every way of writing the prefix — "+43", "0043", "0".
 * Nine is the length that keeps an Austrian landline ("07612 44120" → 9) whole
 * while still being long enough that two different people rarely share one.
 *
 * Fewer than 7 digits is not a phone number (an extension, "112"), so no key.
 */
export function phoneMatchKey(phone: unknown): string | null {
  if (typeof phone !== 'string') return null;
  const digits = phone.replace(/\D/g, '');
  if (digits.length < 7) return null;
  return digits.slice(-9);
}

/** An email address, as it is compared: trimmed and lower-cased, or no key at all. */
export function emailMatchKey(email: unknown): string | null {
  if (typeof email !== 'string') return null;
  const e = email.trim().toLowerCase();
  const at = e.indexOf('@');
  if (at < 1 || at === e.length - 1 || e.length > 254) return null;
  return e;
}

/**
 * The two keys a client is stored with.
 *
 * The server writes these on EVERY create and update of a phone or email
 * (`withContactKeys` in the service), so the index the import asks is never
 * staler than the record it describes.
 */
export function contactMatchKeys(v: { email?: unknown; phone?: unknown }): { emailKey: string | null; phoneKey: string | null } {
  return { emailKey: emailMatchKey(v.email), phoneKey: phoneMatchKey(v.phone) };
}

/**
 * What the phone and the server hash, for one key in one organization.
 *
 * The phone is given the HASHES of the organization's client keys, never the
 * numbers and addresses themselves: an importer's phone does not need a copy of
 * every client's contact details to know that one of its contacts is already
 * on the books. The organization id is in the material so the same number
 * hashes differently in two organizations.
 *
 * ⚠️ A hash of a phone number is not a secret — there are only so many phone
 * numbers. This keeps the list from being READ, not from being attacked; the
 * endpoint is gated on the ability to create clients for that reason.
 */
export function matchKeyMaterial(organizationId: string, key: string): string {
  return `hbc-match:${organizationId}:${key}`;
}

/** Hex characters kept from each SHA-256 — 80 bits, far past any collision in one organization. */
export const MATCH_HASH_HEX = 20;

// ─────────────────────────────────────────────────────────────────────────────
// The import body
// ─────────────────────────────────────────────────────────────────────────────

export type ContactImportKind = 'COMPANY' | 'PERSON';

/** One contact, as the phone sends it. */
export interface ContactImportItem {
  /**
   * Made on the phone (UUIDv7) and used as the new client's id, so a retried
   * import is the same import. Never an existing client's id: a ref that
   * already names a client in this organization reports that client; one that
   * names a client ELSEWHERE is skipped.
   */
  ref: string;
  kind: ContactImportKind;
  name: string;
  email?: string | null;
  phone?: string | null;
  /** Their job, when they are a person at a company. */
  role?: string | null;
  /** A COMPANY in this same batch that this person works at. */
  companyRef?: string | null;
  /**
   * When this contact turns out to be a client already: add the phone or
   * email the client does not have yet. Never overwrites a value.
   */
  fillMissing?: boolean;
}

export interface ContactImportBody {
  spaceId: string;
  items: ContactImportItem[];
}

export type ContactImportOutcome =
  /** A new client (or contact person) was made. */
  | 'created'
  /** It was a client already; nothing changed. */
  | 'existing'
  /** It was a client already; a missing phone or email was added. */
  | 'filled'
  /** Not imported — the reason says why. */
  | 'skipped';

export interface ContactImportResult {
  ref: string;
  outcome: ContactImportOutcome;
  /** The client it became or matched — only when the caller may open it. */
  id?: string;
  name: string;
  /** Linked as a contact person of this company. */
  companyId?: string;
  reason?: 'DUPLICATE_IN_BATCH' | 'NOT_YOURS' | 'APP_USER';
}

export interface ContactImportSummary {
  created: number;
  existing: number;
  filled: number;
  skipped: number;
  results: ContactImportResult[];
}

const REF = /^[A-Za-z0-9_-]{16,64}$/;
const LIMITS = { name: 200, email: 200, phone: 40, role: 120 } as const;

export type ContactImportProblem =
  | 'NO_SPACE'
  | 'NO_ITEMS'
  | 'TOO_MANY'
  | 'BAD_ITEM'
  | 'DUPLICATE_REF'
  | 'BAD_COMPANY_REF';

export const CONTACT_IMPORT_MESSAGES: Record<ContactImportProblem, string> = {
  NO_SPACE: 'Choose the workspace the clients go into.',
  NO_ITEMS: 'Pick at least one contact.',
  TOO_MANY: `Import at most ${CONTACT_IMPORT_MAX} contacts at a time.`,
  BAD_ITEM: 'One of the contacts could not be read. Pick it again.',
  DUPLICATE_REF: 'The same contact was sent twice.',
  BAD_COMPANY_REF: 'A person was attached to a company that is not in this import.',
};

const text = (v: unknown, max: number): string | null => {
  if (v === undefined || v === null) return null;
  if (typeof v !== 'string') return null;
  // Control characters have no business in a name, and a NUL breaks Postgres.
  const s = v.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim();
  return s ? s.slice(0, max) : null;
};

/**
 * Read an import body, or say exactly what is wrong with it.
 *
 * Everything is re-made rather than passed through: unknown keys are dropped,
 * text is trimmed and capped, and a person's company must be a COMPANY in the
 * same batch. A contact with nothing to match or reach (no phone, no email) is
 * still allowed — a name alone is a client somebody can fill in later.
 */
export function parseContactImport(
  body: unknown,
): { ok: true; value: ContactImportBody } | { ok: false; problem: ContactImportProblem } {
  const b = (body ?? {}) as Record<string, unknown>;
  const spaceId = typeof b.spaceId === 'string' ? b.spaceId.trim() : '';
  if (!spaceId) return { ok: false, problem: 'NO_SPACE' };
  if (!Array.isArray(b.items) || !b.items.length) return { ok: false, problem: 'NO_ITEMS' };
  if (b.items.length > CONTACT_IMPORT_MAX) return { ok: false, problem: 'TOO_MANY' };

  const items: ContactImportItem[] = [];
  const refs = new Set<string>();
  for (const raw of b.items as unknown[]) {
    const r = (raw ?? {}) as Record<string, unknown>;
    const ref = typeof r.ref === 'string' ? r.ref : '';
    const kind = r.kind === 'COMPANY' ? 'COMPANY' : r.kind === 'PERSON' ? 'PERSON' : null;
    const name = text(r.name, LIMITS.name);
    if (!REF.test(ref) || !kind || !name) return { ok: false, problem: 'BAD_ITEM' };
    if (refs.has(ref)) return { ok: false, problem: 'DUPLICATE_REF' };
    refs.add(ref);
    const email = text(r.email, LIMITS.email);
    items.push({
      ref,
      kind,
      name,
      // An address that cannot be one is dropped, not stored to bounce later.
      email: email && emailMatchKey(email) ? email : null,
      phone: text(r.phone, LIMITS.phone),
      role: kind === 'PERSON' ? text(r.role, LIMITS.role) : null,
      companyRef: kind === 'PERSON' && typeof r.companyRef === 'string' && r.companyRef ? r.companyRef : null,
      fillMissing: r.fillMissing === true,
    });
  }

  const companies = new Set(items.filter((i) => i.kind === 'COMPANY').map((i) => i.ref));
  if (items.some((i) => i.companyRef && !companies.has(i.companyRef))) {
    return { ok: false, problem: 'BAD_COMPANY_REF' };
  }
  return { ok: true, value: { spaceId, items } };
}
