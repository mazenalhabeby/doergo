/**
 * Document types an organization can start from.
 *
 * A document type is CONFIGURATION, not data: it says what a payslip is, who
 * provides it, whether it expires, and what it gates. Nothing else in the
 * personnel file works until at least one exists — no upload, no contract, no
 * compliance board — so the first screen an administrator meets cannot be an
 * empty form with a field called "cadence" on it.
 *
 * These are that starting point, and every value is a default the customer is
 * expected to change. The retention figures in particular are ORDINARY
 * PRACTICE, not legal advice: how long a payslip must be kept is a question for
 * the customer's accountant, and the editor says so.
 */

import type { DocumentCadence, DocumentDirection, SignatureMode } from './types';

/**
 * The shapes a scanner frame can take, in the documents' real dimensions.
 *
 * One source, because the frame is not decoration: a document held to fit the
 * wrong frame sits further from the lens, and how many pixels the
 * machine-readable zone occupies is what decides whether the OCR can read it.
 * A passport squeezed into a card frame is a smaller zone and a worse read.
 */
export const SCAN_SHAPES = {
  /** ID-1 — driving licences, ID cards, most plastic. */
  CARD: { widthMm: 85.6, heightMm: 54 },
  /** ID-3 — the data page of a passport. */
  PASSPORT: { widthMm: 125, heightMm: 88 },
  /** A4, upright — paper certificates and training records. */
  PAGE: { widthMm: 210, heightMm: 297 },
} as const;

export type ScanShape = keyof typeof SCAN_SHAPES;

/** Width ÷ height. Below 1 the frame is taller than it is wide. */
export function scanAspect(shape: ScanShape): number {
  const s = SCAN_SHAPES[shape] ?? SCAN_SHAPES.CARD;
  return s.widthMm / s.heightMm;
}


export interface StarterDocumentType {
  key: string;
  /** English SOURCE for the picker; the UI translates by key. */
  label: string;
  description: string;
  cadence: DocumentCadence;
  direction: DocumentDirection;
  signatureMode: SignatureMode;
  isCredential: boolean;
  hasExpiry: boolean;
  /**
   * Whether the scanner asks for the back as well.
   *
   * A property of the DOCUMENT, not of what it proves. A European ID card or
   * driving licence carries the machine-readable zone and the categories on the
   * back; a passport carries them on the photo page, so asking somebody to turn
   * one over produces a picture of a blank cover.
   */
  twoSided: boolean;
  /** The frame the scanner draws. A passport is not the shape of a card. */
  scanShape: ScanShape;
  /** Months to keep after issue; null = indefinitely. */
  retentionMonths: number | null;
}

const YEARS = (n: number) => n * 12;

export const STARTER_DOCUMENT_TYPES: StarterDocumentType[] = [
  // ── Things the company issues ─────────────────────────────────────────────
  {
    key: 'payslip',
    label: 'Payslip',
    description: 'One per month, per person. The reason most people open this at all.',
    cadence: 'MONTHLY',
    direction: 'ISSUED',
    signatureMode: 'NONE',
    isCredential: false,
    hasExpiry: false,
    twoSided: false,
    scanShape: 'CARD',
    retentionMonths: YEARS(7),
  },
  {
    key: 'employment_contract',
    label: 'Employment contract',
    description: 'Issued on joining and signed in the app. Kept for a working lifetime.',
    cadence: 'ONE_OFF',
    direction: 'ISSUED',
    signatureMode: 'IN_APP',
    isCredential: false,
    hasExpiry: false,
    twoSided: false,
    scanShape: 'CARD',
    retentionMonths: YEARS(30),
  },
  {
    key: 'annual_statement',
    label: 'Annual pay statement',
    description: 'One per year, for the tax return.',
    cadence: 'ANNUAL',
    direction: 'ISSUED',
    signatureMode: 'NONE',
    isCredential: false,
    hasExpiry: false,
    twoSided: false,
    scanShape: 'CARD',
    retentionMonths: YEARS(7),
  },
  {
    key: 'reference',
    label: 'Reference',
    description: 'Written when somebody leaves. They will ask for it years later.',
    cadence: 'ONE_OFF',
    direction: 'ISSUED',
    signatureMode: 'NONE',
    isCredential: false,
    hasExpiry: false,
    twoSided: false,
    scanShape: 'CARD',
    retentionMonths: YEARS(30),
  },
  {
    key: 'safety_briefing',
    label: 'Safety briefing',
    description: 'Read and confirmed rather than signed. Proof that it was received.',
    cadence: 'ONE_OFF',
    direction: 'ISSUED',
    signatureMode: 'ACKNOWLEDGE',
    isCredential: false,
    hasExpiry: false,
    twoSided: false,
    scanShape: 'CARD',
    retentionMonths: YEARS(3),
  },
  {
    key: 'warning_letter',
    label: 'Written warning',
    description: 'Confirmed as received, which is the part that matters later.',
    cadence: 'ONE_OFF',
    direction: 'ISSUED',
    signatureMode: 'ACKNOWLEDGE',
    isCredential: false,
    hasExpiry: false,
    twoSided: false,
    scanShape: 'CARD',
    retentionMonths: YEARS(7),
  },

  // ── Things the member provides ────────────────────────────────────────────
  {
    key: 'driving_licence',
    label: 'Driving licence',
    description: 'Only they have it, so they upload it. Expires, and can gate driving work.',
    cadence: 'ONE_OFF',
    direction: 'SUPPLIED',
    signatureMode: 'NONE',
    isCredential: true,
    hasExpiry: true,
    // The categories are on the back, and so is the zone.
    twoSided: true,
    scanShape: 'CARD',
    retentionMonths: YEARS(3),
  },
  {
    key: 'trade_certificate',
    label: 'Trade certificate',
    description: 'Gas, electrical, refrigerant. The certificate that lets someone do the work.',
    cadence: 'ONE_OFF',
    direction: 'SUPPLIED',
    signatureMode: 'NONE',
    isCredential: true,
    hasExpiry: true,
    twoSided: false,
    // Paper, not plastic: these arrive as an A4 certificate.
    scanShape: 'PAGE',
    retentionMonths: YEARS(5),
  },
  {
    key: 'first_aid',
    label: 'First-aid certificate',
    description: 'Lapses every few years and is easy to forget until it has.',
    cadence: 'ONE_OFF',
    direction: 'SUPPLIED',
    signatureMode: 'NONE',
    isCredential: true,
    hasExpiry: true,
    twoSided: false,
    // Paper, not plastic: these arrive as an A4 certificate.
    scanShape: 'PAGE',
    retentionMonths: YEARS(3),
  },
  {
    key: 'training_record',
    label: 'Training record',
    description: 'Machine tickets, site inductions, anything with a renewal date.',
    cadence: 'ONE_OFF',
    direction: 'SUPPLIED',
    signatureMode: 'NONE',
    isCredential: true,
    hasExpiry: true,
    twoSided: false,
    // Paper, not plastic: these arrive as an A4 certificate.
    scanShape: 'PAGE',
    retentionMonths: YEARS(3),
  },
  {
    key: 'passport',
    label: 'Passport',
    description: 'Identity and right to work. Expires, and the expiry is worth knowing before a trip.',
    cadence: 'ONE_OFF',
    direction: 'SUPPLIED',
    signatureMode: 'NONE',
    // Tracked for its expiry, which is what `isCredential` actually turns on.
    // It gates no work by default: holding a passport is not a qualification.
    isCredential: true,
    hasExpiry: true,
    // ONE side. Everything is on the photo page — the zone, the name, the
    // expiry — and the back of a passport is a cover.
    twoSided: false,
    // ID-3, not ID-1: a passport page is half as long again as a card.
    scanShape: 'PASSPORT',
    retentionMonths: YEARS(3),
  },
  {
    key: 'id_card',
    label: 'ID card',
    description: 'A national identity card. Identity and right to work, and it expires.',
    cadence: 'ONE_OFF',
    direction: 'SUPPLIED',
    signatureMode: 'NONE',
    isCredential: true,
    hasExpiry: true,
    // The zone is on the back of every European ID card.
    twoSided: true,
    scanShape: 'CARD',
    retentionMonths: YEARS(3),
  },
];

/** A starter type by key. */
export function starterDocumentType(key: string): StarterDocumentType | null {
  return STARTER_DOCUMENT_TYPES.find((t) => t.key === key) ?? null;
}

/**
 * The machine key for a label somebody typed.
 *
 * Mirrors `normaliseKey` on the server, so the key shown while typing is the
 * key that gets stored — a field that silently rewrites itself on save is how
 * somebody ends up with two types they cannot tell apart.
 */
export function documentTypeKey(label: string): string {
  return label
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 60);
}

/**
 * What a type actually does, as a list of consequences rather than of fields.
 *
 * Every flag on this form changes something a person will notice — who can
 * upload, whether a lapse stops dispatch, whether anybody has to sign. Rendering
 * them as checkbox labels leaves the reader to work that out; this is the
 * material the screen explains itself with.
 */
export function typeConsequences(type: {
  direction: DocumentDirection;
  cadence: DocumentCadence;
  isCredential: boolean;
  hasExpiry: boolean;
  signatureMode: SignatureMode;
  requiredForWorkflowIds?: string[];
}): string[] {
  const out: string[] = [];
  out.push(type.direction === 'SUPPLIED' ? 'memberUploads' : 'youIssue');
  if (type.cadence !== 'ONE_OFF') out.push('perPeriod');
  if (type.signatureMode === 'IN_APP') out.push('mustSign');
  if (type.signatureMode === 'ACKNOWLEDGE') out.push('mustAcknowledge');
  if (type.signatureMode === 'WET_INK') out.push('onPaper');
  if (type.isCredential) out.push(type.hasExpiry ? 'expiresTracked' : 'credentialNoExpiry');
  if (type.isCredential && (type.requiredForWorkflowIds?.length ?? 0) > 0) out.push('gatesWork');
  return out;
}

