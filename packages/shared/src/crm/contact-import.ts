
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
export {
  type PhoneContact,
  type ContactSignal,
  type ContactReason,
  type ClassifiedContact,
  classifyContact,
} from './contact-import/classify';
export {
  type PickFilter,
  type PickSection,
  type ImpliedCompany,
  type PickRow,
  type PickModel,
  impliedCompanies,
  impliedAsContact,
  prepareContacts,
  pickModel,
  buildContactImport,
} from './contact-import/pick';
