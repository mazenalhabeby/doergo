/** What is kept, the details, re-ranking guesses, and the client a card becomes (moved here unchanged) */
import type { ParsedCard } from '@hbcfield/shared/client';
import { CARD_FIELDS, type CardDestination, type CardFieldKey, type CardKind, type CardValues } from './kind';
import { cardCandidates, type CardExtraRow } from './read';

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
