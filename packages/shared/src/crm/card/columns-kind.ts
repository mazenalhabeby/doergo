/** Columns on the card, and whether the card is a company's or a person's. */
import { hasHonorific, type LineFacts } from './facts';
import type { CardKindReason, CardKindVerdict, CardLine } from './types';

// ── Columns ─────────────────────────────────────────────────────────────────

const GUTTER = 0.04;

const COLUMN_OVERLAP = 0.35;

/**
 * Group lines into columns, left to right, and order each one top to bottom.
 *
 * ⚠️ Conservative by design: it answers "one column" unless the card is
 * unmistakably two. A false split is worse than a missed one, because it
 * scrambles the reading order of a perfectly ordinary card — so a candidate
 * split must survive all three tests (a real gutter with no horizontal
 * overlap, at least two lines a side, and columns that run ALONGSIDE each
 * other rather than one below the next) or the whole thing collapses back to a
 * single column sorted by y.
 *
 * Returns indices into the input array. With no `x`/`width` it returns the
 * input order untouched — an engine that cannot report geometry still works.
 */
export function cardColumns(lines: CardLine[]): number[][] {
  const single = lines.map((_, i) => i);
  if (lines.length < 4) return [single];
  if (lines.some((l) => typeof l.x !== 'number' || typeof l.width !== 'number')) return [single];

  const byLeft = single.slice().sort((a, b) => lines[a]!.x! - lines[b]!.x! || lines[a]!.y - lines[b]!.y);

  const columns: number[][] = [];
  let current: number[] = [];
  let maxRight = -Infinity;
  for (const i of byLeft) {
    const l = lines[i]!;
    if (current.length && l.x! > maxRight + GUTTER) {
      columns.push(current);
      current = [];
      maxRight = -Infinity;
    }
    current.push(i);
    maxRight = Math.max(maxRight, l.x! + Math.max(0, l.width!));
  }
  if (current.length) columns.push(current);
  if (columns.length < 2) return [single];

  // Every column must be a column: at least two lines, and running beside its
  // neighbour rather than stacked above it.
  const span = (col: number[]) => {
    const top = Math.min(...col.map((i) => lines[i]!.y));
    const bottom = Math.max(...col.map((i) => lines[i]!.y + Math.max(0, lines[i]!.height)));
    return { top, bottom, size: Math.max(1e-6, bottom - top) };
  };
  if (columns.some((c) => c.length < 2)) return [single];
  for (let k = 1; k < columns.length; k++) {
    const a = span(columns[k - 1]!);
    const b = span(columns[k]!);
    const overlap = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
    if (overlap / Math.min(a.size, b.size) < COLUMN_OVERLAP) return [single];
  }

  return columns.map((c) => c.slice().sort((p, q) => lines[p]!.y - lines[q]!.y));
}

// ── Which way round is this card? ───────────────────────────────────────────

function kindFromFacts(facts: LineFacts[], hasGenericMailbox: boolean, hasPersonalMailbox: boolean): CardKindVerdict {
  const reasons: CardKindReason[] = [];
  if (facts.length === 0) return { kind: 'PERSON', confidence: 0, reasons: ['default-person'] };

  /*
    The argument is about ONE line: the biggest thing the designer set. That is
    the line the old rule handed to the name field unconditionally, and it is
    the only line whose identity actually changes the ranking.
  */
  let largest = facts[0]!;
  for (const f of facts) if (f.height > largest.height) largest = f;

  // Positive is the company's card; negative is the person's.
  let score = 0;
  const add = (v: number, why: CardKindReason) => { score += v; reasons.push(why); };

  if (largest.legalForm) add(0.6, 'legal-form-is-largest');
  if (largest.domainMatch) add(0.5, 'largest-matches-email-domain');
  if (largest.localMatch) add(-0.6, 'email-names-the-largest-line');
  if (largest.personShape && !largest.legalForm) add(-0.45, 'largest-is-person-shaped');
  if (hasHonorific(largest.text)) add(-0.4, 'largest-carries-an-honorific');
  /*
    ⚠️ The condition is "and somebody ELSE on this card looks like a person".
    A wordmark with nobody beneath it is a card with one name on it, and that
    name is as likely to be the person's set in capitals.
  */
  if (largest.wordmark && facts.some((f) => f !== largest && f.personShape)) {
    add(0.45, 'largest-is-a-wordmark');
  }
  // A job title is printed because a PERSON holds it.
  if (facts.some((f) => f.role)) add(-0.2, 'role-line-present');
  if (hasGenericMailbox) add(0.2, 'generic-mailbox');
  if (hasPersonalMailbox) add(-0.15, 'personal-mailbox');

  if (Math.abs(score) < 0.05) {
    // What the file assumed for years, now stated as a default with a low
    // confidence rather than as a fact.
    return { kind: 'PERSON', confidence: 0, reasons: reasons.length ? reasons : ['default-person'] };
  }
  return {
    kind: score > 0 ? 'COMPANY' : 'PERSON',
    confidence: Math.min(1, Math.round(Math.abs(score) * 100) / 100),
    reasons,
  };
}

export { kindFromFacts };
