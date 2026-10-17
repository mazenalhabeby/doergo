/** The whole card → a ParsedCard. */
import { kindFromFacts } from './columns-kind';
import { measure, resolveSegments, withoutSuppressed } from './measure';
import { ROLES, ROLE_ORDER } from './role-specs';
import {
  ALTERNATIVE_SHARE,
  CONTESTED_MARGIN,
  MAX_ALTERNATIVES,
  candidatesFor,
  contextFor,
  suggestCompany,
} from './score';
import type { CardCandidate, CardField, CardLine, CardPhone, CardRole, ParsedCard } from './types';

export function parseBusinessCard(raw: CardLine[]): ParsedCard {
  /*
    ⚠️ Nothing in here may throw. It is handed whatever a camera and a text
    recogniser made of a photograph, on a screen the person is waiting on, and
    a half-read card is worth more than a crash. Returning the lines alone is
    still a usable result: the screen lets any field pick from them.
  */
  let lines: string[] = [];
  try {
    const { facts, generic, personal, domain, columns } = measure(raw);
    /*
      ⚠️ EVERY fact, the glued line AND its pieces, whichever of them the
      resolver went on to suppress.

      `lines` is what the review screen offers under "Pick a different line",
      and it is the only way back from a wrong answer. A line the parse decided
      against is exactly the line somebody may want: dropping the pieces hides
      "Liegenschaftsverwaltung" on a card that printed it, and dropping the
      whole line hides "TEC | Anlagenbau GmbH" from the one person who knows
      that is the firm's real name. Nothing the card said stops being pickable.
    */
    lines = facts.map((f) => f.text);
    const kind = kindFromFacts(facts, generic, personal);
    const ctx = contextFor(facts, generic, personal);

    const fields: Partial<Record<CardRole, CardField>> = {};

    // Every (line, role) pair that clears its floor, best first.
    const scored = {} as Record<CardRole, CardCandidate[]>;
    for (const role of ROLE_ORDER) scored[role] = candidatesFor(role, facts, ctx);
    /*
      ⚠️ BEFORE anything is assigned. A line and its pieces are rivals for the
      same fact, and letting both into the auction gives one card two companies
      — the glued line winning `company` while its own half wins nothing, or
      worse, an address block printing the street once as a line and again as a
      piece. Decided here, once, and from the scores, which is the only place
      the evidence exists.
    */
    const perRole = withoutSuppressed(scored, resolveSegments(facts, scored));

    const pairs: { role: CardRole; i: number; score: number }[] = [];
    for (const role of ROLE_ORDER) {
      for (const c of perRole[role]!) pairs.push({ role, i: c.sourceIndex, score: c.score });
    }
    /*
      ⚠️ THE FIX FOR "whichever rule ran first owns the line".

      Assignment is by STRENGTH, not by the order the fields happen to be
      declared in. A line that is obviously a website is spoken for before
      anything is desperate enough to call it a name, and — the half that
      actually bit — a website the capture pattern MISSED still cannot become a
      name, because it never scored as one in the first place.

      Ties fall back to the declared order and then to position, so the same
      card always reads the same way.
    */
    pairs.sort((a, b) => b.score - a.score || ROLE_ORDER.indexOf(a.role) - ROLE_ORDER.indexOf(b.role) || a.i - b.i);

    const claimed = new Set<number>();
    const filled = new Set<CardRole>();
    for (const p of pairs) {
      if (filled.has(p.role) || claimed.has(p.i)) continue;
      const spec = ROLES[p.role];
      const f = facts[p.i]!;
      const { value, also } = spec.claim(f, ctx, facts);
      /*
        ⚠️ A line the winner SWALLOWED is not an alternative to it. The address
        block takes two or three lines, and offering "4020 Linz" as the other
        thing the address might have been invites somebody to replace a whole
        address with half of it.
      */
      const rest = perRole[p.role]!.filter((c) => c.sourceIndex !== p.i && !also.includes(c.sourceIndex));
      const runnerUp = rest[0];
      fields[p.role] = {
        value,
        confidence: spec.proven ? 'certain' : 'likely',
        sourceIndex: p.i,
        score: p.score,
        alternatives: rest.filter((c) => c.score >= p.score * ALTERNATIVE_SHARE).slice(0, MAX_ALTERNATIVES),
        // The epsilon is not fussiness: 0.92 − 0.82 is 0.1000000000000001 in
        // binary floating point, and a margin test that excluded exactly that
        // case would exclude the commonest one.
        contested: !!runnerUp && p.score - runnerUp.score <= CONTESTED_MARGIN + 1e-9,
      };
      filled.add(p.role);
      claimed.add(p.i);
      for (const j of also) claimed.add(j);
    }

    /*
      EVERY number the card printed, in reading order, deduped by its digits —
      a card that prints the switchboard twice is one number, and the two
      spellings of it are not a choice worth offering.
    */
    const phones: CardPhone[] = [];
    const seen = new Set<string>();
    for (const f of facts) {
      if (f.suppressed) continue;
      for (const p of f.phones) {
        const key = p.value.replace(/\D/g, '');
        if (!key || seen.has(key)) continue;
        seen.add(key);
        phones.push({ ...p, sourceIndex: f.i });
      }
    }

    return {
      lines,
      kind,
      columns,
      companyDomain: domain,
      companySuggestion: suggestCompany(
        fields.name ? facts[fields.name.sourceIndex] : undefined,
        kind.kind,
        domain,
        fields.website?.value,
      ),
      ...(phones.length ? { phones } : {}),
      ...fields,
    };
  } catch {
    return { lines, kind: { kind: 'PERSON', confidence: 0, reasons: ['default-person'] }, columns: 1 };
  }
}
