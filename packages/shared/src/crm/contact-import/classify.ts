/** Sorting one address-book entry: a likely client, a colleague, family — with the reason. */
import { foldText } from '../../utils/fold';
import { emailMatchKey, phoneMatchKey } from '../contact-keys';
import { companyDomainFromEmail, companyNameFromDomain, hasLegalForm } from '../business-card';

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

const fold = foldText;

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

export { fold };
