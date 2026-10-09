import { companyDomainFromEmail, companyNameFromDomain, hasLegalForm } from './business-card';
import {
  CONTACT_IMPORT_MAX,
  emailMatchKey,
  phoneMatchKey,
  type ContactImportItem,
} from './contact-keys';

/**
 * Picking clients out of a phone's address book — the rules, without a phone.
 *
 * An address book is mostly NOT clients: family, the doctor, a plumber from
 * three years ago. Shown flat, 1,284 names is a list nobody reads and a
 * company's CRM fills with somebody's mother. So the list is sorted before it
 * is shown — what looks like work comes first, what looks private is put away,
 * and what is already a client says so — and every verdict carries the reason
 * it was reached, because a suggestion nobody can question is one nobody
 * trusts.
 *
 * Pure: the screen renders `pickModel`, a test runs it on a fixture, and the
 * same import body comes out of `buildContactImport` either way.
 */

/** One contact as the phone read it — four kinds of fact, nothing else. */
export interface PhoneContact {
  id: string;
  name: string;
  firstName?: string | null;
  lastName?: string | null;
  company?: string | null;
  jobTitle?: string | null;
  /** The address book says this entry IS a company. */
  savedAsCompany?: boolean;
  emails: string[];
  phones: string[];
}

export type ContactSignal = 'business' | 'private' | 'other';

/** Why a contact was sorted where it was — shown under its name. */
export type ContactReason =
  | 'SAVED_AS_COMPANY'
  | 'LEGAL_FORM'
  | 'COMPANY_FIELD'
  | 'WORK_EMAIL'
  | 'FAMILY'
  | 'PRIVATE_EMAIL'
  | 'PHONE_ONLY'
  | 'NO_DETAILS';

export interface ClassifiedContact {
  id: string;
  name: string;
  kind: 'COMPANY' | 'PERSON';
  /** The company this PERSON works at, as written or as the email says. */
  company: string | null;
  role: string | null;
  /** The address and number an import would carry — the first of each. */
  email: string | null;
  phone: string | null;
  signal: ContactSignal;
  reason: ContactReason;
  /** People and the company they work at share this — a domain, or the company's name. */
  groupKey: string | null;
  /** Every match key this contact has — any one of them already on the books makes it a client. */
  keys: string[];
  /** Lower-cased, accent-free text the search runs against. */
  haystack: string;
}

/**
 * Names that are a relationship rather than a person.
 *
 * Whole words only, compared without accents and case: "Mama", "Oma Gerti",
 * "Schatz ❤". Five languages because the app ships in five. A doctor or a
 * hairdresser is NOT on this list — those are businesses, and somebody who
 * cleans offices may well invoice the dentist.
 */
const FAMILY = new Set([
  'mama', 'papa', 'mami', 'papi', 'mum', 'mom', 'mommy', 'dad', 'daddy', 'mutti', 'vati',
  'oma', 'opa', 'omi', 'opi', 'grandma', 'grandpa', 'granny', 'nana',
  'schatz', 'schatzi', 'liebling', 'baby', 'babe', 'honey', 'love', 'darling',
  'bruder', 'schwester', 'brother', 'sister', 'bro', 'sis', 'tante', 'onkel', 'aunt', 'uncle',
  'cousin', 'cousine', 'sohn', 'tochter', 'son', 'daughter', 'ehefrau', 'ehemann', 'wife', 'husband',
  'zuhause', 'daheim', 'home',
  'mamma', 'babbo', 'nonna', 'nonno', 'zia', 'zio', 'fratello', 'sorella',
  'maman', 'mamie', 'papy', 'tata', 'tonton', 'frere', 'soeur',
  'mama', 'abuela', 'abuelo', 'tia', 'tio', 'hermano', 'hermana', 'hijo', 'hija',
]);

const fold = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const words = (s: string) => fold(s).split(/[^a-z0-9]+/).filter(Boolean);
const clean = (s: string | null | undefined) => (s ?? '').replace(/\s+/g, ' ').trim();

/** A company name reduced to what two spellings of it share: "Bauer Elektrotechnik GmbH" ≈ "bauer elektrotechnik". */
function companyKey(name: string): string | null {
  const k = words(name)
    .filter((w) => !/^(gmbh|ag|kg|og|eu|ltd|limited|inc|llc|plc|co|und|and|the|der|die|das)$/.test(w))
    .join(' ');
  return k.length >= 2 ? `n:${k}` : null;
}

/** Sort one address-book entry. Every branch names its reason. */
export function classifyContact(c: PhoneContact): ClassifiedContact {
  const name = clean(c.name) || clean([c.firstName, c.lastName].filter(Boolean).join(' ')) || clean(c.company);
  const company = clean(c.company) || null;
  const emails = c.emails.map(clean).filter((e) => emailMatchKey(e));
  const phones = c.phones.map(clean).filter((p) => phoneMatchKey(p));
  const domain = emails.map((e) => companyDomainFromEmail(e)).find(Boolean) ?? null;
  const hasPersonName = !!(clean(c.firstName) || clean(c.lastName));

  const isCompany =
    !!c.savedAsCompany ||
    (!hasPersonName && !!company) ||
    hasLegalForm(name);

  let signal: ContactSignal;
  let reason: ContactReason;
  if (!emails.length && !phones.length) {
    signal = 'other';
    reason = 'NO_DETAILS';
  } else if (!isCompany && words(name).some((w) => FAMILY.has(w))) {
    signal = 'private';
    reason = 'FAMILY';
  } else if (c.savedAsCompany) {
    signal = 'business';
    reason = 'SAVED_AS_COMPANY';
  } else if (hasLegalForm(name) || (company && hasLegalForm(company))) {
    signal = 'business';
    reason = 'LEGAL_FORM';
  } else if (domain) {
    signal = 'business';
    reason = 'WORK_EMAIL';
  } else if (company) {
    signal = 'business';
    reason = 'COMPANY_FIELD';
  } else if (emails.length) {
    // Only free-mail addresses: gmail, gmx, icloud — a person, not an employer.
    signal = 'private';
    reason = 'PRIVATE_EMAIL';
  } else {
    signal = 'other';
    reason = 'PHONE_ONLY';
  }

  const groupKey = domain ? `d:${domain}` : isCompany ? companyKey(name) : company ? companyKey(company) : null;
  const keys = [...emails.map(emailMatchKey), ...phones.map(phoneMatchKey)].filter((k): k is string => !!k);

  return {
    id: c.id,
    name,
    kind: isCompany ? 'COMPANY' : 'PERSON',
    company: isCompany ? null : company ?? (domain ? companyNameFromDomain(domain) ?? null : null),
    role: isCompany ? null : clean(c.jobTitle) || null,
    email: emails[0] ?? null,
    phone: phones[0] ?? null,
    signal,
    reason,
    groupKey,
    keys: Array.from(new Set(keys)),
    haystack: fold([name, company, c.jobTitle, ...emails, ...phones, domain].filter(Boolean).join(' ')),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// The list the screen draws
// ─────────────────────────────────────────────────────────────────────────────

export type PickFilter = 'suggested' | 'all' | 'clients';

export type PickSection = 'suggested' | 'clients' | 'other' | 'private';

/**
 * A company the address book never saved as an entry, made from the people
 * who work there: two contacts at `bauer-elektro.at` imply the firm, and
 * ticking it imports the firm with them as its contact people.
 */
export interface ImpliedCompany {
  id: string;
  name: string;
  groupKey: string;
}

export type PickRow =
  | { type: 'header'; section: PickSection; count: number; key: string }
  | {
      type: 'contact';
      key: string;
      contact: ClassifiedContact;
      section: PickSection;
      /** Drawn under its company. */
      nested: boolean;
      /** The company row that owns these people, when this IS a company. */
      members?: string[];
    }
  | { type: 'hidden'; key: string; privateCount: number; clientCount: number; otherCount: number };

export interface PickModel {
  rows: PickRow[];
  counts: { suggested: number; all: number; clients: number };
}

/**
 * Companies implied by people who share a domain or a company name, where the
 * address book has no entry for the firm itself. Two people make a firm; one
 * person's company field is just their job.
 */
export function impliedCompanies(contacts: ClassifiedContact[]): ImpliedCompany[] {
  const byKey = new Map<string, ClassifiedContact[]>();
  const saved = new Set<string>();
  for (const c of contacts) {
    if (!c.groupKey || c.signal !== 'business') continue;
    if (c.kind === 'COMPANY') saved.add(c.groupKey);
    else byKey.set(c.groupKey, [...(byKey.get(c.groupKey) ?? []), c]);
  }
  const out: ImpliedCompany[] = [];
  for (const [key, people] of byKey) {
    if (saved.has(key) || people.length < 2) continue;
    const named = people.map((p) => p.company).find(Boolean);
    const name = named ?? (key.startsWith('d:') ? companyNameFromDomain(key.slice(2)) : null);
    if (name) out.push({ id: `company:${key}`, name, groupKey: key });
  }
  return out;
}

/** An implied company as a contact row, so the list and the import treat it like any other. */
export function impliedAsContact(i: ImpliedCompany, people: ClassifiedContact[]): ClassifiedContact {
  const first = people.find((p) => p.groupKey === i.groupKey);
  return {
    id: i.id,
    name: i.name,
    kind: 'COMPANY',
    company: null,
    role: null,
    email: null,
    phone: null,
    signal: 'business',
    reason: first?.reason === 'WORK_EMAIL' ? 'WORK_EMAIL' : 'COMPANY_FIELD',
    groupKey: i.groupKey,
    keys: [],
    haystack: fold(i.name),
  };
}

/**
 * The address book, sorted once: every entry classified, the implied companies
 * added, alphabetical. Run when the contacts are read — never per keystroke.
 */
export function prepareContacts(raw: PhoneContact[]): ClassifiedContact[] {
  const classified = raw.map(classifyContact).filter((c) => c.name);
  const implied = impliedCompanies(classified).map((i) => impliedAsContact(i, classified));
  const all = implied.length ? [...classified, ...implied] : classified;
  const collator = new Intl.Collator(undefined, { sensitivity: 'base' });
  return all.sort((a, b) => collator.compare(a.name, b.name));
}

/**
 * The rows to draw, for one filter and one search.
 *
 * Linear in the address book and allocation-light: this runs on every
 * keystroke over a few thousand contacts, so it is one pass to bucket and one
 * to emit, with no sorting beyond the alphabetical order the phone already
 * returned the contacts in.
 *
 * @param isClient    Is this contact already a client? Answered from the
 *                    hashed keys the server sent — see `matchKeyMaterial`.
 */
export function pickModel(
  contacts: ClassifiedContact[],
  opts: { filter: PickFilter; query: string; isClient: (c: ClassifiedContact) => boolean },
): PickModel {
  const q = fold(opts.query.trim());
  const sectionOf = (c: ClassifiedContact): PickSection =>
    opts.isClient(c) ? 'clients' : c.signal === 'business' ? 'suggested' : c.signal === 'private' ? 'private' : 'other';

  const buckets: Record<PickSection, ClassifiedContact[]> = { suggested: [], clients: [], other: [], private: [] };
  for (const c of contacts) {
    if (q && !c.haystack.includes(q)) continue;
    buckets[sectionOf(c)].push(c);
  }
  // The counts on the tabs ignore the search: they describe the address book.
  let sAll = 0, sSug = 0, sCli = 0;
  for (const c of contacts) {
    sAll++;
    const s = sectionOf(c);
    if (s === 'suggested') sSug++;
    else if (s === 'clients') sCli++;
  }

  const rows: PickRow[] = [];
  const emit = (section: PickSection) => {
    const list = buckets[section];
    if (!list.length) return;
    rows.push({ type: 'header', section, count: list.length, key: `h:${section}` });
    if (section !== 'suggested') {
      for (const c of list) rows.push({ type: 'contact', key: c.id, contact: c, section, nested: false });
      return;
    }
    // Suggested: a company first, then the people who work there, under it.
    const companyKeys = new Set(list.filter((c) => c.kind === 'COMPANY' && c.groupKey).map((c) => c.groupKey!));
    const membersOf = new Map<string, ClassifiedContact[]>();
    for (const c of list) {
      if (c.kind === 'PERSON' && c.groupKey && companyKeys.has(c.groupKey)) {
        membersOf.set(c.groupKey, [...(membersOf.get(c.groupKey) ?? []), c]);
      }
    }
    for (const c of list) {
      if (c.kind === 'PERSON' && c.groupKey && companyKeys.has(c.groupKey)) continue; // drawn under its company
      const members = c.kind === 'COMPANY' && c.groupKey ? membersOf.get(c.groupKey) ?? [] : [];
      rows.push({ type: 'contact', key: c.id, contact: c, section, nested: false, members: members.map((m) => m.id) });
      for (const m of members) rows.push({ type: 'contact', key: m.id, contact: m, section, nested: true });
    }
  };

  if (opts.filter === 'clients') {
    emit('clients');
  } else {
    emit('suggested');
    if (opts.filter === 'all') {
      emit('clients');
      emit('other');
      emit('private');
    } else if (!q) {
      const hidden = { privateCount: buckets.private.length, clientCount: buckets.clients.length, otherCount: buckets.other.length };
      if (hidden.privateCount + hidden.clientCount + hidden.otherCount) rows.push({ type: 'hidden', key: 'hidden', ...hidden });
    } else {
      // A search is looking for somebody in particular: never hide the answer.
      emit('clients');
      emit('other');
      emit('private');
    }
  }
  return { rows, counts: { suggested: sSug, all: sAll, clients: sCli } };
}

// ─────────────────────────────────────────────────────────────────────────────
// What the import sends
// ─────────────────────────────────────────────────────────────────────────────

/**
 * The picked contacts as an import body.
 *
 * A person whose company is also picked travels as that company's contact
 * person; a person picked alone is a client of their own. Only the fields the
 * member left switched on are carried — the rest of the entry stays on the
 * phone. A contact that is already a client goes too, marked `fillMissing`
 * only when the member asked for its missing details to be added: the SERVER
 * decides what it matches, never this list.
 */
export function buildContactImport(
  picked: ClassifiedContact[],
  opts: {
    newRef: () => string;
    fields: { email: boolean; phone: boolean; role: boolean };
    fillMissing: (c: ClassifiedContact) => boolean;
  },
): ContactImportItem[] {
  const refOf = new Map<string, string>();
  for (const c of picked) refOf.set(c.id, opts.newRef());
  const companyRefByKey = new Map<string, string>();
  for (const c of picked) if (c.kind === 'COMPANY' && c.groupKey) companyRefByKey.set(c.groupKey, refOf.get(c.id)!);

  // Companies first, so a reader of the body meets a company before its people.
  const ordered = [...picked].sort((a, b) => (a.kind === b.kind ? 0 : a.kind === 'COMPANY' ? -1 : 1));
  return ordered.slice(0, CONTACT_IMPORT_MAX).map((c) => ({
    ref: refOf.get(c.id)!,
    kind: c.kind,
    name: c.name,
    email: opts.fields.email ? c.email : null,
    phone: opts.fields.phone ? c.phone : null,
    role: c.kind === 'PERSON' && opts.fields.role ? c.role : null,
    companyRef: c.kind === 'PERSON' && c.groupKey ? companyRefByKey.get(c.groupKey) ?? null : null,
    fillMissing: opts.fillMissing(c),
  }));
}
