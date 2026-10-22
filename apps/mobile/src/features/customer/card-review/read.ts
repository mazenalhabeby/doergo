/** Reading a card: the extras, the candidates per field, the read itself (moved here unchanged) */
import {
  cardExtras,
  isSocialLink,
  socialOf,
  type CardCandidate,
  type CardExtra,
  type CardField,
  type ParsedCard,
} from '@hbcfield/shared/client';
import { CARD_FIELDS, cardValues, type CardCertainty, type CardFieldKey, type CardKind, type CardValues } from './kind';

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
interface CardRead {
  values: CardValues;
  extras: CardExtraRow[];
}

/** The candidates for one field, best first — the winner, then its runners-up. */
function cardCandidates(card: ParsedCard, key: CardFieldKey): CardCandidate[] {
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

export { cardCandidates };
