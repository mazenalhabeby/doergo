/** What a card says: its fields, person or firm, where each value goes, a likely duplicate (moved here unchanged) */
import { foldText, type ParsedCard } from '@hbcfield/shared/client';

/**
 * WHAT A SCANNED CARD MEANS, decided once and away from the screen.
 *
 * The reader (`crm/business-card.ts` in shared) hands back fields. Everything
 * after that — is this a company's card or a person's, which fields will
 * actually be SAVED, and which were read and have nowhere to go — is product
 * judgement, and it is here so it can be argued with and tested without a
 * camera.
 *
 * ⚠️ THE RULE THIS FILE EXISTS TO ENFORCE: a field is offered for correction
 * ONLY if saving it will keep it. The screen this replaced asked somebody to
 * check a job title and then dropped it on the floor, and it put a WEBSITE in
 * the contact-person box because the reader's `website` had no row of its own.
 * Asking for a correction and discarding it is worse than not asking — so what
 * cannot be kept is named out loud (`homelessFields`) instead of being quietly
 * binned.
 */

/** Everything the reader can extract, in the order a person reads a card. */
export const CARD_FIELDS = ['company', 'name', 'title', 'email', 'phone', 'website', 'address', 'vat'] as const;

export type CardFieldKey = (typeof CARD_FIELDS)[number];

/** A card is somebody's, or a firm's. Mirrors `Customer.type`. */
export type CardKind = 'COMPANY' | 'PERSON';

/**
 * Where a PERSON read off a card is filed.
 *
 * `contact` is the case the scanner could not do at all before: the person
 * works at a company that is already in the book, and belongs ON that company
 * (`CustomerContact`) rather than beside it as a second client.
 *
 * `newCompany` is the same thing when the company is NOT in the book yet — the
 * firm is created from the card and the person is attached to it. It was
 * deliberately refused for a long time, because one line's spelling is how
 * "BILLA" and "BILLA AG" become two clients on a bill that charges per client.
 * What made it safe is not a change of mind about that: it is that the name is
 * EDITABLE before it is saved, that the existing-company chip sits in front of
 * it, and that the near-duplicate check runs on the company's name at save.
 */
export type CardDestination = 'client' | 'contact' | 'newCompany';

export type CardValues = Record<CardFieldKey, string>;

export type CardCertainty = Partial<Record<CardFieldKey, boolean>>;

/** Why the reader thinks what it thinks — an i18n key under `scan.why…`. */
type CardKindReason = 'personTitled' | 'personNamed' | 'companyNoPerson' | 'unsure';

/**
 * COMPANY CARD OR PERSON CARD, and one sentence saying why.
 *
 * ⚠️ The sentence is the point. A guess that does not explain itself does not
 * get corrected — it gets ignored, and then it gets saved. So the reason is
 * built from the same facts the guess is, and never from a friendlier
 * paraphrase of them.
 *
 * The test is simply whether a PERSON'S NAME was read. Most business cards
 * carry both a person and their employer and are the person's card; a card
 * with a firm on it and nobody's name is the firm's. The reader marks both
 * `name` and `company` as inferred (`likely`), so neither is trusted here
 * beyond "was there one" — which is exactly as much as it can prove.
 *
 * ⚠️ GAP, deliberately not invented: the reader knows a line "carries GmbH"
 * (its `LEGAL_FORM` vocabulary) and does not export that signal, so the reason
 * cannot name it. If `parseBusinessCard` ever returns why it chose a company
 * line, this is the one place that has to change.
 */
export function guessCardKind(card: ParsedCard): { kind: CardKind; why: CardKindReason } {
  const hasName = !!card.name?.value;
  const hasCompany = !!card.company?.value;
  const hasTitle = !!card.title?.value;

  if (hasName) return { kind: 'PERSON', why: hasTitle ? 'personTitled' : 'personNamed' };
  if (hasCompany) return { kind: 'COMPANY', why: 'companyNoPerson' };
  // Nothing recognisable either way. COMPANY is the safer default: its form
  // offers every field, so nothing read is hidden while the member decides.
  return { kind: 'COMPANY', why: 'unsure' };
}

/** What the reader read, as the screen holds it. */
export function cardValues(card: ParsedCard): CardValues {
  return {
    company: card.company?.value ?? '',
    name: card.name?.value ?? '',
    title: card.title?.value ?? '',
    email: card.email?.value ?? '',
    phone: card.phone?.value ?? '',
    website: card.website?.value ?? '',
    address: card.address?.value ?? '',
    vat: card.vat?.value ?? '',
  };
}

/**
 * Which of them the reader can PROVE.
 *
 * `certain` is an email, a phone, a website, a VAT number — shapes that match
 * or do not. `likely` is everything it infers from type size and position.
 * Only the second kind is worth colouring.
 */
export function cardCertainty(card: ParsedCard): CardCertainty {
  const out: CardCertainty = {};
  for (const key of CARD_FIELDS) {
    const field = card[key as keyof ParsedCard] as { confidence?: string } | undefined;
    out[key] = field?.confidence === 'certain';
  }
  return out;
}

/**
 * IS THIS ONE WORTH A SECOND LOOK?
 *
 * Either the reader found nothing, or it INFERRED the value from type size and
 * position rather than proving it by shape. Those are the only two cases worth
 * colouring; a proved email asking to be checked is how a screen teaches people
 * to stop checking.
 *
 * ⚠️ Asked TWICE, of two different moments, and that is deliberate. WHICH GROUP
 * a row sits in is frozen when the card is read; whether it is still COLOURED
 * follows what the member has since typed. Re-grouping live would move a row to
 * another heading on the first keystroke into an empty field — which unmounts
 * the box being typed in and takes the keyboard with it.
 */
export function fieldNeedsLook(value: string, certain: boolean | undefined): boolean {
  return !value.trim() || !certain;
}

/**
 * THE FIELDS THAT WILL BE SAVED, for this kind and this destination.
 *
 * Read it as the answer to "what has a home". Anything the reader found that is
 * not on this list is reported by `homelessFields` and shown as read-but-not-
 * saved, never as a box to correct.
 *
 * ⚠️ `title` appears on exactly ONE path — a person filed as a contact, where
 * it becomes `CustomerContact.role`. That is the home it never had, and the
 * reason the job title was removed from this screen entirely before.
 *
 * ⚠️ `website` and `vat` appear on the COMPANY path only, because they are
 * `COMPANY_ONLY_FIELDS` in shared: sent on a person they are cleared, so
 * offering them there would be a box that empties itself on save.
 */
export function cardFieldsFor(kind: CardKind, destination: CardDestination): CardFieldKey[] {
  if (kind === 'COMPANY') return ['company', 'name', 'email', 'phone', 'website', 'address', 'vat'];
  if (destination === 'contact') return ['name', 'title', 'email', 'phone'];
  /*
    ⚠️ The ONE destination that loses nothing, and that is not a coincidence —
    it creates both records the card describes. The firm takes what belongs to a
    firm (its name, its address, its website, its VAT number) and the person
    takes what belongs to a person (their name, their email, their direct line,
    and the department as `CustomerContact.role`). A card read in full and saved
    in full is what the other two exits cannot do.
  */
  if (destination === 'newCompany') return ['company', 'name', 'title', 'email', 'phone', 'address', 'website', 'vat'];
  return ['name', 'email', 'phone', 'address'];
}

/**
 * What was read and cannot be kept — the honest half of the rule above.
 *
 * Empty values are not homeless, they are simply absent; only something the
 * reader actually found and the chosen destination has no column for.
 */
export function homelessFields(kind: CardKind, destination: CardDestination, values: CardValues): CardFieldKey[] {
  const kept = new Set(cardFieldsFor(kind, destination));
  return CARD_FIELDS.filter((key) => !kept.has(key) && !!values[key].trim());
}

/**
 * Does a row in the book look like the card in the member's hand?
 *
 * Folded to letters and digits, so "BILLA AG" and "BILLA" are the same firm and
 * "Müller" matches "Mueller" as far as the accents go. Containment either way
 * is what catches the real duplicate: the book holds the short form and the
 * card carries the legal suffix, or the other way round.
 *
 * ⚠️ Four characters minimum. Below that almost everything contains almost
 * everything, and a warning that fires on every save is a warning nobody reads.
 */
export function looksLikeSameClient(a: string, b: string): boolean {
  const fold = (s: string) => foldText(s).replace(/[^a-z0-9]/g, '');
  const x = fold(a);
  const y = fold(b);
  if (x.length < 4 || y.length < 4) return false;
  return x === y || x.includes(y) || y.includes(x);
}
