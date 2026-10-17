/** One OCR line → its segments and its phone numbers. */
import {
  CARD_SEPARATOR,
  LABEL_KIND,
  MAX_PHONES_PER_LINE,
  MAX_SEGMENTS,
  PHONE_LABEL,
  PHONE_SCAN,
  SEPARATOR_EDGE,
} from './patterns-contact';
import { MAX_LINE_CHARS, clean, fold } from './patterns-words';
import type { CardPhoneKind } from './types';

/**
 * One line → the facts printed on it.
 *
 * Returns `[whole]` for an ordinary line, so every caller has one shape to
 * handle. A line that splits returns its pieces and NOT the whole — the caller
 * (`measure`) keeps the whole line itself, because deciding whether the split
 * was decoration needs the scores, which do not exist yet.
 *
 * ⚠️ Pure and exported on purpose: the rule about what a separator IS is the
 * argument this change rests on, and it is worth being able to test it without
 * a card around it.
 */
export function segmentCardLine(text: string): string[] {
  // Exported, so it is handed whatever a caller has. Nothing in this file throws.
  if (typeof text !== 'string') return [];
  const whole = clean(text);
  if (!whole) return [];
  // Bounded before anything else: this runs on a photograph's worth of text.
  const raw = text.slice(0, MAX_LINE_CHARS * 2);
  const parts = raw
    .split(CARD_SEPARATOR)
    .map((p) => clean(p.replace(SEPARATOR_EDGE, '')))
    // One character is punctuation, not a fact. Same floor `measure` uses.
    .filter((p) => p.length > 1);
  // Too many pieces means the line was never a list of facts — see MAX_SEGMENTS.
  if (parts.length < 2 || parts.length > MAX_SEGMENTS) return [whole];
  return parts;
}

/**
 * Every number on one piece of text, each typed by the label in FRONT of it.
 *
 * ⚠️ The label window is the text since the previous number ended, which is
 * what makes this work inside a line as well as across lines: on
 * "T: 1234567 ~ F: 7654321" the second number's window is " ~ F: " and nothing
 * else. The old code asked whether the LINE mentioned a mobile anywhere, which
 * is the same answer for all three numbers on a line that carries all three.
 */
export function readCardPhones(text: string): { value: string; kind: CardPhoneKind }[] {
  const out: { value: string; kind: CardPhoneKind }[] = [];
  if (typeof text !== 'string') return out;
  /*
    ⚠️ `lastIndex` is reset here and not trusted from the last call. The loop
    below can stop early on the cap, which leaves the shared pattern pointing
    into the middle of some other card's line — and a global regex that
    remembers where it got to is the classic way a scan silently skips the first
    number on the next thing it is asked about.
  */
  PHONE_SCAN.lastIndex = 0;
  let cursor = 0;
  let found: RegExpExecArray | null;
  while (out.length < MAX_PHONES_PER_LINE && (found = PHONE_SCAN.exec(text)) !== null) {
    // PHONE cannot match empty, so `lastIndex` always advances and this ends.
    out.push({ value: clean(found[0]), kind: labelKind(text.slice(cursor, found.index)) });
    cursor = found.index + found[0].length;
  }
  return out;
}

/** The LAST label in the window describes the number that follows it. */
function labelKind(window: string): CardPhoneKind {
  const folded = fold(window);
  PHONE_LABEL.lastIndex = 0;
  let kind: CardPhoneKind = 'unknown';
  let hit: RegExpExecArray | null;
  while ((hit = PHONE_LABEL.exec(folded)) !== null) {
    kind = LABEL_KIND[hit[1]!.toLowerCase()] ?? kind;
  }
  return kind;
}

/**
 * The number a person actually wants dialled.
 *
 * A labelled mobile first, then anything that is not a fax. A fax alone answers
 * NOTHING — which is what keeps it out of the phone field while the line it
 * sits on stays excluded from being read as somebody's name.
 */
function dialable(phones: { value: string; kind: CardPhoneKind }[]) {
  return phones.find((p) => p.kind === 'mobile')
    ?? phones.find((p) => p.kind === 'landline')
    ?? phones.find((p) => p.kind === 'unknown');
}

export { dialable };
