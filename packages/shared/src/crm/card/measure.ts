/** Reading the card: every line measured, segments resolved. */
import { cardColumns, kindFromFacts } from './columns-kind';
import {
  SOCIAL_HOST,
  companyDomainFromEmail,
  domainWord,
  isPersonShape,
  isWordmark,
  localWords,
  type LineFacts,
} from './facts';
import { EMAIL, SEGMENT_SIZE_SHARE, TLD_ANYWHERE, VAT, WEBSITE, WWW_PREFIX } from './patterns-contact';
import {
  AUTHORITY,
  COUNTRY,
  DEPARTMENT_STEM,
  FREE_MAIL_LABEL,
  HOUSE_NUMBER,
  LEGAL_FORM,
  POSTCODE,
  STREET,
  clean,
  fold,
  isRole,
  num,
} from './patterns-words';
import { ROLE_ORDER } from './role-specs';
import { dialable, readCardPhones, segmentCardLine } from './segment';
import type { CardCandidate, CardKindVerdict, CardLine, CardRole } from './types';

/** The kind detector, callable on its own — it is the part most worth arguing with. */
export function detectCardKind(raw: CardLine[]): CardKindVerdict {
  const { facts, generic, personal } = measure(raw);
  return kindFromFacts(facts, generic, personal);
}

// ── Reading the card ────────────────────────────────────────────────────────

/** Normalise, order into columns, and measure every line exactly once. */
function measure(raw: CardLine[]): { facts: LineFacts[]; generic: boolean; personal: boolean; domain?: string; columns: number } {
  const input = (Array.isArray(raw) ? raw : [])
    .filter((l) => l && typeof l.text === 'string')
    .map((l) => ({
      text: clean(l.text),
      /*
        ⚠️ The text as the reader gave it, NOT the cleaned form. `clean`
        collapses runs of whitespace, and a run of two or more spaces is one of
        the separators a card uses — collapsing first destroys the evidence that
        a line held two facts.
      */
      segments: segmentCardLine(l.text),
      y: num(l.y),
      height: num(l.height),
      x: typeof l.x === 'number' && Number.isFinite(l.x) ? l.x : undefined,
      width: typeof l.width === 'number' && Number.isFinite(l.width) ? l.width : undefined,
    }))
    .filter((l) => l.text.length > 1);

  /*
    ⚠️ Columns are clustered over the LINES, never the segments. A segment has
    no geometry of its own — it inherits its line's box, and feeding several
    facts with identical `x` into the clusterer would say nothing it does not
    already know while making the "at least two lines a side" test meaningless.
  */
  const columns = cardColumns(input);
  const order: { index: number; column: number; row: number }[] = [];
  columns.forEach((col, c) => col.forEach((idx, row) => order.push({ index: idx, column: c, row })));

  /*
    A line that split becomes SEVERAL entries: the whole line first, then its
    pieces. Both are measured and scored; `resolveSegments` decides which of
    them was the fact and suppresses the other. A line that did not split
    produces exactly one entry, as before.
  */
  const ordered: (typeof input[number] & {
    column: number; rowInColumn: number; sizeShare: number; pieceOfPrevious?: number;
  })[] = [];
  for (const o of order) {
    const line = input[o.index]!;
    const at = ordered.length;
    ordered.push({ ...line, column: o.column, rowInColumn: o.row, sizeShare: 1 });
    if (line.segments.length < 2) continue;
    for (const piece of line.segments) {
      ordered.push({
        ...line,
        text: piece,
        segments: [piece],
        column: o.column,
        rowInColumn: o.row,
        sizeShare: SEGMENT_SIZE_SHARE,
        pieceOfPrevious: at,
      });
    }
  }

  // The email is needed to measure every other line, so it is found first —
  // as a FACT about the card, not as a claim on a line.
  let email: string | undefined;
  let genericMailbox = false;
  for (const l of ordered) {
    const m = l.text.match(EMAIL);
    if (m) { email = m[0]; break; }
  }
  /*
    The card's domain, from the email — or from the WEB ADDRESS when there is no
    usable email.

    ⚠️ The fallback is not a nicety. The domain is what tells an organisation
    from its department ("which half echoes `gmunden`"), and on a real read of
    the Gmunden card the `@` came back as an `a`, so there was no email, no
    domain, and no company — the department was captured and the authority that
    employs her was not.

    A card almost always prints both, and they almost always agree. Taking the
    web address when the email is missing costs nothing when the email is fine
    and rescues the card when it is not.

    ⚠️ A SOCIAL LINK IS NOT THE CARD'S DOMAIN. `facebook.com` would make every
    company on earth echo "facebook", so the first non-social web address wins.
  */
  let domain = companyDomainFromEmail(email);
  if (!domain) {
    /*
      ⚠️ The FEWEST labels wins, not the first found.

      An email whose `@` was misread is still website-shaped, and on this very
      card it is printed above the web address — so taking the first match made
      `jasmin.waltheragmunden.ooe.gv.at` the card's domain, which echoes nothing
      and left the company empty all over again.

      A company's own web address is the shortest domain on its card:
      `gmunden.at` is two labels, the ruined email is five. Counting labels
      needs no knowledge of the person's name, which `measure` does not have
      yet.
    */
    let fewest = Infinity;
    for (const l of ordered) {
      /*
        ⚠️ Never read the EMAIL line as a web address. An address contains a
        hostname, so `office@gmx.at` offered `gmx.at` as the card's domain —
        a free provider, and the one thing `companyDomainFromEmail` had just
        refused to answer with. Caught by its own test.
      */
      if (EMAIL.test(l.text)) continue;
      const m = l.text.match(WEBSITE);
      if (!m) continue;
      // ⚠️ `m[0]`: WEBSITE is built entirely from non-capturing groups.
      const host = m[0].toLowerCase().replace(/^[a-z]+:\/\//, '').replace(/^www\./, '').split(/[/?#]/)[0];
      if (!host) continue;
      // Keyed on the first label, exactly as `companyDomainFromEmail` reads it.
      const first = host.split('.')[0]!;
      // A free provider names no company, however it reached the card.
      if (SOCIAL_HOST.has(first) || FREE_MAIL_LABEL.has(first)) continue;
      const labels = host.split('.').length;
      if (labels < fewest) { fewest = labels; domain = host; }
    }
  }
  const word = domainWord(domain);
  const { words: locals, personal } = localWords(email);
  if (email && !personal) genericMailbox = true;

  let maxHeight = 0;
  for (const l of ordered) maxHeight = Math.max(maxHeight, l.height);
  const denom = maxHeight > 0 ? maxHeight : 1;

  const facts: LineFacts[] = ordered.map((l, i) => {
    const folded = fold(l.text);
    const squashed = folded.toLowerCase().replace(/[^a-z0-9]/g, '');
    const email$ = l.text.match(EMAIL)?.[0];
    const website$ = email$ ? undefined : l.text.match(WEBSITE)?.[0];
    const vat$ = l.text.match(VAT)?.[1];
    const phones = readCardPhones(l.text);
    const phone$ = phones[0]?.value;

    const street = STREET.test(folded);
    const postcode = POSTCODE.test(l.text);
    const country = COUNTRY.test(folded);
    const house = HOUSE_NUMBER.test(l.text);
    const addressSignal = email$ || phone$ || website$ || vat$
      ? 0
      : Math.min(0.95, (street ? 0.45 : 0) + (postcode ? 0.45 : 0) + (country ? 0.3 : 0) + (street && house ? 0.1 : 0));

    const legalForm = LEGAL_FORM.test(l.text);
    const authority = AUTHORITY.test(folded.toLowerCase());
    const domainMatch = !!word && word.length >= 3 && !email$ && !website$ && squashed.includes(word);

    return {
      i,
      text: l.text,
      folded,
      squashed,
      pieces: undefined,
      partOf: l.pieceOfPrevious,
      suppressed: false,
      y: l.y,
      height: l.height,
      x: l.x,
      width: l.width,
      column: l.column,
      rowInColumn: l.rowInColumn,
      // See SEGMENT_SIZE_SHARE: `sizeShare` is 1 for a whole line.
      relSize: (l.height / denom) * l.sizeShare,
      email: email$,
      website: website$,
      vat: vat$ ? clean(vat$) : undefined,
      phone: phone$,
      phones,
      dial: dialable(phones),
      hasDigits: /\d/.test(l.text),
      words: l.text.split(' ').length,
      legalForm,
      role: isRole(l.text),
      /*
        ⚠️ THE DISCRIMINATOR, and the one thing on this card that actually
        works. "Stadtamt Gmunden" and "Liegenschaftsverwaltung" are the same
        shape to a computer; what tells them apart is that one of them echoes
        the domain the email and the website both point at. A legal form or an
        authority word says the same thing by another route.
      */
      department: DEPARTMENT_STEM.test(folded) && !domainMatch && !legalForm && !authority,
      authority,
      urlish: !!website$ || WWW_PREFIX.test(l.text) || TLD_ANYWHERE.test(l.text) || l.text.includes('://'),
      personShape: isPersonShape(l.text),
      wordmark: isWordmark(l.text),
      addressSignal,
      domainMatch: !!word && word.length >= 3 && !email$ && !website$ && squashed.includes(word),
      localMatch: locals.length > 0 && !email$ && locals.some((w) => squashed.includes(w)),
    };
  });

  // The pieces point at their line; the line is told which pieces are its own.
  for (const f of facts) {
    if (f.partOf === undefined) continue;
    const parent = facts[f.partOf];
    if (!parent) continue;
    (parent.pieces ??= []).push(f.i);
  }

  return { facts, generic: genericMailbox, personal, domain, columns: columns.length };
}

/**
 * WAS THE SEPARATOR DECORATION, OR PART OF THE VALUE?
 *
 * Answered once, from the scores, because it cannot be answered from the text.
 * "Stadtamt Gmunden ~ Liegenschaftsverwaltung" and "Müller | Söhne GmbH" are
 * the same shape; what differs is that the first has TWO halves that mean
 * something on their own and the second has one.
 *
 * So: a line is suppressed in favour of its pieces when at least two of those
 * pieces cleared a role's floor. Otherwise the pieces are suppressed and the
 * whole line stands — which is the promise that splitting never loses a value,
 * enforced here rather than hoped for.
 *
 * Mutates `suppressed` on the facts (the address block reads it) and returns
 * the set so the candidate lists can be filtered with it.
 */
function resolveSegments(facts: LineFacts[], perRole: Record<CardRole, CardCandidate[]>): Set<number> {
  const claiming = new Set<number>();
  for (const role of ROLE_ORDER) for (const c of perRole[role]!) claiming.add(c.sourceIndex);

  const suppressed = new Set<number>();
  for (const f of facts) {
    if (!f.pieces?.length) continue;
    const meaningful = f.pieces.filter((i) => claiming.has(i));
    const losers = meaningful.length >= 2 ? [f.i] : f.pieces;
    for (const i of losers) {
      suppressed.add(i);
      facts[i]!.suppressed = true;
    }
  }
  return suppressed;
}

const withoutSuppressed = (
  perRole: Record<CardRole, CardCandidate[]>,
  suppressed: Set<number>,
): Record<CardRole, CardCandidate[]> => {
  if (suppressed.size === 0) return perRole;
  const out = {} as Record<CardRole, CardCandidate[]>;
  for (const role of ROLE_ORDER) out[role] = perRole[role]!.filter((c) => !suppressed.has(c.sourceIndex));
  return out;
};

export { measure, resolveSegments, withoutSuppressed };
