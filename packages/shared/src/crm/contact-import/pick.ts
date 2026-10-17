/** The import picker's model (sections, implied companies, filters) and the import body it sends. */
import { companyNameFromDomain } from '../business-card';
import { CONTACT_IMPORT_MAX, type ContactImportItem } from '../contact-keys';
import { classifyContact, fold, type ClassifiedContact, type PhoneContact } from './classify';

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
