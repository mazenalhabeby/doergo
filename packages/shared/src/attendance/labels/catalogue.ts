import { INFORMATIONAL_FLAGS } from '../../sync/occurrence';
import { LABEL_CODES, isLabelCode, type LabelCode } from './contract';
import { labelWordsFor } from './words';

/**
 * The label catalogue — how every attendance label is shown, in ONE place.
 *
 * Attendance Management, the member page, the worker's own pages, the phone's
 * review screen and the push to a leader all read this: the order chips stand
 * in, their colour, whether a label sends the day to review, and the WORDS —
 * in five languages, from `words/` (one copy for web, phone and push).
 *
 * Review or info is NOT decided here: it is the server's own rule
 * (`INFORMATIONAL_FLAGS`, sync/occurrence.ts), read so the two cannot disagree.
 */

/** The five colours a label can carry. Each app maps them to its own palette. */
export type LabelTone = 'red' | 'amber' | 'orange' | 'purple' | 'muted';

export interface LabelEntry {
  code: string;
  /** `review` sends the day to a person; `info` only explains how the entry was made. */
  kind: 'review' | 'info';
  tone: LabelTone;
  /** Lower first. A row's chips are always in this order, never in the order the server stored them. */
  order: number;
}

type Spec = [code: LabelCode, tone: LabelTone];

/** Most urgent first — this order IS the sort order. */
const SPECS: Spec[] = [
  ['CLOCK_OUT_PROVISIONAL', 'amber'],
  ['MISSED_CLOCK_OUT', 'red'],
  ['OUTSIDE_GEOFENCE_IN', 'amber'],
  ['OUTSIDE_GEOFENCE_OUT', 'amber'],
  ['LATE_ARRIVAL', 'amber'],
  ['LATE_FROM_REST', 'amber'],
  ['REMOTE_WITH_WORKSPACE', 'amber'],
  ['MISSED_BREAK', 'amber'],
  ['EARLY_DEPARTURE', 'amber'],
  ['OVERTIME', 'orange'],
  ['PAST_DAILY_LIMIT', 'orange'],
  ['UNSCHEDULED_DAY', 'purple'],
  ['FIX_MOCKED', 'red'],
  ['CLOCK_SUSPECT', 'red'],
  ['BOUNDARY_CHANGED', 'amber'],
  ['HOURS_CHANGED', 'amber'],
  ['STALE', 'amber'],
  ['RECORDED_OFFLINE', 'muted'],
  ['UNANCHORED', 'muted'],
  ['APPROVED_REMOTE', 'muted'],
  ['AUTO_CLOCK_IN', 'muted'],
  ['AUTO_CLOCK_OUT', 'muted'],
  ['AUTO_REST', 'muted'],
];

export const LABEL_CATALOGUE: Readonly<Record<LabelCode, LabelEntry>> = Object.fromEntries(
  SPECS.map(([code, tone], order) => [
    code,
    { code, kind: INFORMATIONAL_FLAGS.has(code) ? 'info' : 'review', tone, order },
  ]),
) as Record<LabelCode, LabelEntry>;

/** Humanised raw code for a label the catalogue does not know yet: OUTSIDE_X → "Outside x". */
function humanise(code: string): string {
  return code.charAt(0) + code.slice(1).toLowerCase().replace(/_/g, ' ');
}

/**
 * One label, as shown. A code this build does not know still renders — after
 * every known one, muted, under its own name — so a new server label is visible
 * rather than silently dropped.
 */
export function labelEntry(code: string): LabelEntry {
  if (isLabelCode(code)) return LABEL_CATALOGUE[code];
  return { code, kind: 'review', tone: 'muted', order: LABEL_CODES.length };
}

/** A label's words in the reader's language; an unknown code reads as itself, humanised. */
export function labelWord(code: string, locale: string | null | undefined): string {
  return isLabelCode(code) ? labelWordsFor(locale).label[code] : humanise(code);
}

/** An entry's labels in catalogue order, duplicates removed. Stable whatever order they were stored in. */
export function sortedLabels(codes: readonly string[] | null | undefined): LabelEntry[] {
  return [...new Set(codes ?? [])].map(labelEntry).sort((a, b) => a.order - b.order);
}

/** The labels on an entry that send the day to review. */
export function reviewLabels(codes: readonly string[] | null | undefined): LabelEntry[] {
  return sortedLabels(codes).filter((l) => l.kind === 'review');
}

/** Where an entry stands with a person — the same words on every surface. */
export type ApprovalWord = 'active' | 'needsReview' | 'approved' | 'autoApproved' | 'rejected';

/** An open shift is Active; a closed one says where it stands. AUTO (or anything unknown) = auto-approved. */
export function approvalWord(entry: { status?: string | null; approvalStatus?: string | null }): ApprovalWord {
  if (entry.status === 'CLOCKED_IN') return 'active';
  if (entry.approvalStatus === 'PENDING') return 'needsReview';
  if (entry.approvalStatus === 'APPROVED') return 'approved';
  if (entry.approvalStatus === 'REJECTED') return 'rejected';
  return 'autoApproved';
}

/** Where an entry stands, in the reader's language. */
export function approvalText(
  entry: { status?: string | null; approvalStatus?: string | null },
  locale: string | null | undefined,
): string {
  return labelWordsFor(locale).approval[approvalWord(entry)];
}
