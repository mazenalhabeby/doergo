/** Scores per role, the candidates, the suggested company. */
import { kindFromFacts } from './columns-kind';
import { companyNameFromDomain, domainWord, type Ctx, type LineFacts, websiteHost } from './facts';
import { measure, resolveSegments, withoutSuppressed } from './measure';
import { ROLES, ROLE_ORDER } from './role-specs';
import type { CardCandidate, CardKind, CardLine, CardRole } from './types';

/**
 * Every line scored for every role, best first.
 *
 * Exported because it is the part worth inspecting when a card reads wrong:
 * the answer is always "look at what each line scored", and that should not
 * require re-running the whole parse in your head.
 *
 * ⚠️ Segments are resolved here too, so this and `parseBusinessCard` cannot
 * disagree about what was on offer. An inspector that showed candidates the
 * parse had already ruled out would send somebody looking in the wrong place.
 */
export function scoreCardLines(raw: CardLine[]): Record<CardRole, CardCandidate[]> {
  const { facts, generic, personal } = measure(raw);
  const ctx = contextFor(facts, generic, personal);
  const out = {} as Record<CardRole, CardCandidate[]>;
  for (const role of ROLE_ORDER) out[role] = candidatesFor(role, facts, ctx);
  return withoutSuppressed(out, resolveSegments(facts, out));
}

function contextFor(facts: LineFacts[], generic: boolean, personal: boolean): Ctx {
  const kind = kindFromFacts(facts, generic, personal).kind;
  /*
    A provisional name, used ONLY as context for "the title sits beside the
    name". It is not an assignment and nothing is marked used by it — the real
    choice still happens in the one place, below.
  */
  const base: Ctx = { kind, nameHint: -1 };
  let best = -1;
  let bestScore = 0;
  for (const f of facts) {
    const s = ROLES.name.score(f, base);
    if (s > bestScore) { bestScore = s; best = f.i; }
  }
  return { kind, nameHint: best, nameText: facts.find((f) => f.i === best)?.text };
}

function candidatesFor(role: CardRole, facts: LineFacts[], ctx: Ctx): CardCandidate[] {
  const spec = ROLES[role];
  const found: CardCandidate[] = [];
  for (const f of facts) {
    const s = spec.score(f, ctx);
    if (s >= spec.min) found.push({ sourceIndex: f.i, value: f.text, score: Math.round(s * 100) / 100 });
  }
  return found.sort((a, b) => b.score - a.score || a.sourceIndex - b.sourceIndex);
}

/** The top two are close enough that the reader is choosing, not reading. */
const CONTESTED_MARGIN = 0.1;

/** A runner-up worth offering: near the winner, not merely non-zero. */
const ALTERNATIVE_SHARE = 0.4;

const MAX_ALTERNATIVES = 3;

/**
 * A company name recovered from whichever domain the card points at.
 *
 * The email's domain first — it names an employer — and the website's host
 * second, because a card can print an address and no email at all.
 *
 * ⚠️ Silent when the domain is the PERSON'S OWN NAME. A sole practitioner's
 * site is `nikiforova.at`, and "Nikiforova" offered as the firm she works for
 * is the same mistake `company` already refuses to make (see the `personShape`
 * penalty there) — made again, in a field that exists to be accepted with one
 * tap.
 */
function suggestCompany(
  /** The line the parse settled on as the person's name — nothing else. */
  named: LineFacts | undefined,
  kind: CardKind,
  domain?: string,
  website?: string,
): string | undefined {
  const host = domain ?? websiteHost(website);
  if (!host) return undefined;
  /*
    ⚠️ Asked of the NAME the parse actually chose, not of every person-shaped
    line on the card. "Stadtamt Gmunden" is two capitalised words and therefore
    person-shaped to the same test a person's name passes — asking the question
    of all of them withheld the suggestion on the very card it was built for.

    And asked of the HOST rather than of `domainMatch`, which is derived from
    the email alone: a card can carry a website and no address at all, and that
    is exactly the card a sole practitioner hands over.
  */
  const label = domainWord(host);
  if (kind === 'PERSON' && label && label.length >= 3 && named?.squashed.includes(label)) return undefined;
  return companyNameFromDomain(host);
}

export { contextFor, candidatesFor, CONTESTED_MARGIN, ALTERNATIVE_SHARE, MAX_ALTERNATIVES, suggestCompany };
