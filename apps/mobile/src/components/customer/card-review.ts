import {
  cardExtras, isSocialLink, socialOf,
  type CardCandidate, type CardExtra, type CardField, type ParsedCard,
} from '@hbcfield/shared/client';

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
export type CardKindReason = 'personTitled' | 'personNamed' | 'companyNoPerson' | 'unsure';

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
  const fold = (s: string) =>
    s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]/g, '');
  const x = fold(a);
  const y = fold(b);
  if (x.length < 4 || y.length < 4) return false;
  return x === y || x.includes(y) || y.includes(x);
}

/**
 * What to ASK the server when looking for a duplicate.
 *
 * The first word, not the whole name: the server matches a substring, so
 * searching "BILLA AG" cannot find the "BILLA" already in the book — which is
 * precisely the duplicate worth catching. `looksLikeSameClient` then does the
 * narrowing on the shortlist that comes back.
 */
export function duplicateSearchTerm(name: string): string {
  const trimmed = name.trim();
  const first = trimmed.split(/\s+/)[0] ?? '';
  return first.length >= 3 ? first : trimmed;
}

/**
 * The client body a scanned card creates — the extras only.
 *
 * The name, contact, email, phone, workspace and email language are built by
 * `newClientInput`, the SAME builder the typed form uses. What is added here is
 * what the form has no box for and the reader alone supplies.
 *
 * ⚠️ Returned per KIND, not per field: sending `website` or `vatId` with
 * `type: 'PERSON'` is not an error the server reports, it is a value silently
 * cleared (`clearCompanyFields`), which would put this screen straight back
 * into the habit it is being rebuilt to break.
 */
export function cardClientExtras(
  kind: CardKind,
  values: CardValues,
): { address?: string; website?: string; vatId?: string } {
  const extras: { address?: string; website?: string; vatId?: string } = {};
  const address = values.address.trim();
  if (address) extras.address = address;
  if (kind === 'COMPANY') {
    const website = values.website.trim();
    const vat = values.vat.trim();
    /*
      ⚠️ A SOCIAL LINK IS NEVER THE WEBSITE, and this is the last door it could
      slip through. `readCard` keeps one out of the field in the first place, but
      the field is editable and its line list offers every line on the card — so
      a member one tap away from `facebook.com/stadt.gmunden` could still put the
      client's record on a Facebook page instead of the company, on a card that
      printed `gmunden.at` two characters earlier. Refused here, kept as an
      extra by the screen: nothing the card said is lost, it is merely filed
      where it belongs.
    */
    if (website && !isSocialLink(website)) extras.website = website;
    if (vat) extras.vatId = vat;
  }
  return extras;
}

/* ------------------------------------------------------------------ */
/* Everything read that no field claimed — the "custom fields" half.    */

/**
 * A row under "Keep as extra", as the screen holds it.
 *
 * ⚠️ `labelKey` and `label` are NOT interchangeable and must not be flattened
 * into one string here. `labelKey` is a translation key — the thing was
 * recognised, so it is named in the member's own language — while `label` is
 * the word the CARD printed ("Notruf:", "Skype:") and is shown verbatim,
 * because translating a company's own word for something invents a fact.
 * `rename` is the member's own word and wins over both.
 */
export interface CardExtraRow extends CardExtra {
  /** Stable across renders and edits, so a row keeps its keyboard while typed in. */
  id: string;
  /** What the member renamed it to, if they did. */
  rename?: string;
}

/** What the reader found and what it could not place, in one pass. */
export interface CardRead {
  values: CardValues;
  extras: CardExtraRow[];
}

/** The candidates for one field, best first — the winner, then its runners-up. */
export function cardCandidates(card: ParsedCard, key: CardFieldKey): CardCandidate[] {
  const field = card[key] as CardField | undefined;
  if (!field) return [];
  return [
    { sourceIndex: field.sourceIndex, value: field.value, score: field.score },
    ...field.alternatives,
  ];
}

/** The runners-up alone — what "did you mean…" offers ahead of the full list. */
export function cardAlternatives(card: ParsedCard, key: CardFieldKey): CardCandidate[] {
  return (card[key] as CardField | undefined)?.alternatives ?? [];
}

/** Which line each field is currently holding. A field with nothing holds nothing. */
export function cardHolding(card: ParsedCard): Partial<Record<CardFieldKey, number>> {
  const out: Partial<Record<CardFieldKey, number>> = {};
  for (const key of CARD_FIELDS) {
    const field = card[key] as CardField | undefined;
    if (field) out[key] = field.sourceIndex;
  }
  return out;
}

/**
 * THE READER IS GUESSING BETWEEN TWO LINES — ask, do not pick.
 *
 * A card with two unlabelled phone numbers has no right answer, and the reader
 * saying so is worth more than it choosing. Folded into the same amber as an
 * inferred field rather than given a colour of its own: one mark on this screen
 * means "look at this", and a second would only teach people to ignore both.
 */
export function cardContested(card: ParsedCard): CardCertainty {
  const out: CardCertainty = {};
  for (const key of CARD_FIELDS) out[key] = (card[key] as CardField | undefined)?.contested === true;
  return out;
}

/**
 * WHAT THE CARD SAID, split into what has a field and what does not.
 *
 * ⚠️ A line the reader UNDERSTOOD is never discarded. Before this, anything
 * outside the eight known fields was dropped in silence — a Facebook page, an
 * IBAN, opening hours, a second office. The member had photographed it and the
 * phone had read it, and the app threw it away without saying so.
 *
 * ⚠️ The website is checked for a social host FIRST, because that one is not a
 * leftover at all: the reader legitimately claimed it as `website` and it is
 * the one wrong answer that looks completely right on the record.
 */
export function readCard(card: ParsedCard): CardRead {
  const values = cardValues(card);

  /*
    A line is "leftover" when no field is standing on it. Two tests, because
    one is not enough: the SOURCE INDEX catches the line a field won outright,
    and the TEXT catches the lines a winner swallowed — an address block is
    three lines and the parse records only the first of them, so without the
    second test half an address would be offered back as a custom field.
  */
  const claimed = new Set(Object.values(cardHolding(card)));
  const inAValue = (line: string) => {
    const text = line.trim();
    if (!text) return true;
    return CARD_FIELDS.some((key) => {
      const value = values[key].trim();
      return !!value && (value === text || value.includes(text));
    });
  };

  const leftovers: string[] = [];
  const social = socialOf(values.website.trim());
  if (social) {
    // Out of the field and into the list, before anything else claims the slot.
    leftovers.push(values.website.trim());
    values.website = '';
  }
  card.lines.forEach((line, i) => {
    if (claimed.has(i) || inAValue(line)) return;
    leftovers.push(line);
  });

  return {
    values,
    // `cardExtras` decides what is worth keeping and dedupes by VALUE — a card
    // that prints the same handle as a URL and again as `@name` is one row.
    extras: cardExtras(leftovers).map((extra, i) => ({ ...extra, id: `x${i}-${extra.value}` })),
  };
}

/**
 * Can this destination keep the extras?
 *
 * ⚠️ A CONTACT PERSON CANNOT. `POST /customers/:id/contacts` carries a name, an
 * email and a direct line — there is no `details` on it, and the company it
 * hangs off already exists and is not this screen's to rewrite. So the rows are
 * still shown and still say what was read, with one sentence admitting they
 * will not be kept. That is the same rule `homelessFields` follows, for the same
 * reason: asking somebody to check something and then binning it is worse than
 * never asking.
 */
export function cardExtrasKept(destination: CardDestination): boolean {
  return destination !== 'contact';
}

/** The extras as `Customer.details` holds them — `[{label, value}]`, resolved. */
export function cardDetails(
  rows: readonly CardExtraRow[],
  translate: (key: string) => string,
): { label: string; value: string }[] {
  return rows
    .map((row) => ({
      // The member's own word, then the card's, then ours. A row with no name
      // at all is dropped by the server's own sanitiser, so it is dropped here
      // too rather than saved as a blank label somebody has to go and fix.
      label: (row.rename ?? row.label ?? (row.labelKey ? translate(row.labelKey) : '')).trim(),
      value: row.value.trim(),
    }))
    .filter((row) => !!row.label && !!row.value);
}

/* ------------------------------------------------------------------ */

/**
 * A CORRECTION RE-RANKS THE REST.
 *
 * The reader assigns lines by strength, each line to at most one field — so the
 * moment a member says "no, THAT line is the company", the field that was
 * holding it is holding a line that is spoken for. Leaving it there is the
 * screen showing one fact twice and inviting the member to save it that way.
 *
 * ⚠️ A FIELD THE MEMBER ANSWERED IS NEVER TOUCHED. That is the whole contract:
 * correcting the company must not quietly rewrite the name they typed a moment
 * ago, or corrections become a thing people undo rather than make. `answered`
 * is every field they have typed in or picked for, and it only ever grows.
 *
 * ⚠️ A field left with no candidate is EMPTIED, not left standing. Its line
 * genuinely belongs to somebody else now; keeping the old text would be the
 * duplicate this function exists to remove, and an empty field colours amber and
 * says so.
 *
 * The auction below is the parser's own, deliberately: by score, ties broken by
 * declared order and then by position, so the same card and the same correction
 * always give the same answer.
 */
export function reRankGuesses(
  card: ParsedCard,
  values: CardValues,
  answered: ReadonlySet<CardFieldKey>,
  holding: Readonly<Partial<Record<CardFieldKey, number>>>,
): { values: CardValues; holding: Partial<Record<CardFieldKey, number>> } {
  // Only an ANSWERED field owns its line. A guess does not get to reserve one
  // against a better guess — that is what the auction is for.
  const taken = new Set<number>();
  for (const key of CARD_FIELDS) {
    if (answered.has(key) && holding[key] !== undefined) taken.add(holding[key]!);
  }

  const open = CARD_FIELDS.filter((key) => !answered.has(key));
  const pairs: { key: CardFieldKey; index: number; value: string; score: number }[] = [];
  for (const key of open) {
    for (const c of cardCandidates(card, key)) {
      if (taken.has(c.sourceIndex)) continue;
      pairs.push({ key, index: c.sourceIndex, value: c.value, score: c.score });
    }
  }
  pairs.sort((a, b) =>
    b.score - a.score ||
    CARD_FIELDS.indexOf(a.key) - CARD_FIELDS.indexOf(b.key) ||
    a.index - b.index);

  const nextValues: CardValues = { ...values };
  const nextHolding: Partial<Record<CardFieldKey, number>> = {};
  for (const key of CARD_FIELDS) {
    if (answered.has(key)) {
      if (holding[key] !== undefined) nextHolding[key] = holding[key];
    } else {
      // Cleared first: a field that wins nothing below must end up empty, and
      // an else-branch per field is how one gets forgotten.
      nextValues[key] = '';
    }
  }

  const filled = new Set<CardFieldKey>();
  for (const p of pairs) {
    if (filled.has(p.key) || taken.has(p.index)) continue;
    nextValues[p.key] = p.value;
    nextHolding[p.key] = p.index;
    filled.add(p.key);
    taken.add(p.index);
  }

  return { values: nextValues, holding: nextHolding };
}

/**
 * The person, as a CONTACT PERSON at a company.
 *
 * ⚠️ The email and the direct line on a person's card are THEIRS, and they
 * travel with the person — not onto the firm that is created alongside them.
 * Putting `jasmin.walther@…` on the Stadtamt's record makes one person's inbox
 * the organisation's address, and the next member to email that client writes
 * to her by accident.
 *
 * ⚠️ The job title — or the DEPARTMENT read off a line like "Stadtamt Gmunden ~
 * Liegenschaftsverwaltung" — becomes `CustomerContact.role`. That is the home
 * it never had, and the reason the screen used to read a title, badge it, ask
 * for a correction and then drop it on the floor.
 *
 * ⚠️ One builder for BOTH contact roads (a company already in the book, and one
 * created from this card), because they differ only in where the company's id
 * came from. Written twice, the newer copy forgets the role.
 */
export function cardContactInput(values: CardValues): {
  person: { name: string; email?: string; phone?: string };
  role?: string;
} {
  const role = values.title.trim();
  return {
    person: {
      name: values.name.trim(),
      email: values.email.trim() || undefined,
      phone: values.phone.trim() || undefined,
    },
    ...(role ? { role } : {}),
  };
}

/**
 * The client's NAME and its contact person, for the kind chosen.
 *
 * On a company card the firm is the client and the person on it is the contact;
 * on a person card the person is the client and there is no contact. The
 * fallback to the person's name on a company card with no firm read is kept
 * from the screen this replaces — a card that would otherwise save nothing.
 */
export function cardClientNames(kind: CardKind, values: CardValues): { name: string; contactName: string } {
  if (kind === 'COMPANY') {
    const company = values.company.trim();
    return company ? { name: company, contactName: values.name.trim() } : { name: values.name.trim(), contactName: '' };
  }
  return { name: values.name.trim(), contactName: '' };
}
