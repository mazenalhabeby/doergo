import { PDFDocument, StandardFonts, rgb, type PDFFont } from 'pdf-lib';
import {
  layout,
  parseBlocks,
  unencodableCharacters,
  MARGIN,
  PAGE,
  CONTENT_WIDTH,
  type Measure,
} from '@hbcfield/shared';

/**
 * Rendering a contract, and sealing a signed one.
 *
 * ── Why pdf-lib alone, and not a React renderer ─────────────────────────────
 *
 * A contract is a text document with a known structure, and the bytes it
 * produces are HASHED AND FROZEN at issue. That makes determinism the property
 * that matters most: the same template and the same values must produce the
 * same file, byte for byte, today and in five years. pdf-lib draws exactly what
 * it is told with the PDF standard fonts, which are part of the format itself
 * rather than something resolved from the machine — so there is nothing to
 * drift. It also weighs about a megabyte and pulls no React reconciler into a
 * backend service.
 *
 * ── Determinism, specifically ───────────────────────────────────────────────
 *
 * PDF files normally carry a creation date and a random document id, both of
 * which would change the hash on every render of identical content. Both are
 * pinned below. `issuedAt` is passed IN rather than read from a clock, so a
 * re-render for verification can reproduce the original exactly.
 */

/** A fixed epoch for PDF metadata. Any constant works; it must not be `now`. */
const FIXED_EPOCH = new Date(Date.UTC(2000, 0, 1));

export interface ContractValues {
  title: string;
  body: string;
  /** Rendered into the footer of every page. Passed in, never read from a clock. */
  issuedAt: Date;
  organizationName: string;
  memberName: string;
}

/** Everything captured at signing, for the certificate page. */
export interface SealEvidence {
  documentTitle: string;
  signerName: string;
  signerEmail: string;
  organizationName: string;
  consentText: string;
  consentAt: Date;
  signedAt: Date;
  hashBefore: string;
  sessionAuthenticatedAt?: Date | null;
  ip?: string | null;
  userAgent?: string | null;
  appVersion?: string | null;
  lat?: number | null;
  lng?: number | null;
  /** PNG bytes of the drawn signature. */
  signatureImage: Buffer;
  signatureSha256: string;
}

/**
 * Render a contract to PDF bytes.
 *
 * Throws if the text contains characters the standard fonts cannot encode,
 * rather than substituting them. A contract with black squares where somebody's
 * surname belongs is worse than one that failed to generate, because only the
 * second gets noticed.
 */
export async function renderContractPdf(values: ContractValues): Promise<Buffer> {
  const combined = `${values.title}\n${values.body}\n${values.organizationName}\n${values.memberName}`;
  const bad = unencodableCharacters(combined);
  if (bad.length > 0) {
    throw new Error(
      `This contract contains characters the document font cannot render: ${bad.join(' ')}`,
    );
  }

  const pdf = await PDFDocument.create();
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const measure: Measure = (text, size, isBold) =>
    (isBold ? bold : regular).widthOfTextAtSize(text, size);

  const pages = layout(parseBlocks(values.body, values.title), measure);

  pages.forEach((laid, index) => {
    const page = pdf.addPage([PAGE.width, PAGE.height]);
    for (const line of laid.lines) {
      page.drawText(line.text, {
        x: line.x,
        y: line.y,
        size: line.size,
        font: line.bold ? bold : regular,
        color: rgb(0.06, 0.09, 0.15),
      });
    }
    drawFooter(page, regular, {
      left: `${values.organizationName} · ${values.memberName}`,
      right: `${index + 1} / ${pages.length}`,
    });
  });

  return finalise(pdf, values.title, values.organizationName);
}

/**
 * Append the signature block and the certificate of completion, then freeze.
 *
 * The signature image and the evidence go on their own final page rather than
 * into the body: the body is the document that was AGREED, and the certificate
 * is the record of HOW it was agreed. Keeping them apart is what lets the
 * before-hash describe exactly what the signer read.
 */
export async function sealSignedPdf(
  originalPdf: Buffer,
  evidence: SealEvidence,
): Promise<Buffer> {
  const pdf = await PDFDocument.load(originalPdf);
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);

  const page = pdf.addPage([PAGE.width, PAGE.height]);
  let y = PAGE.height - MARGIN.top;

  const text = (s: string, size: number, isBold = false, indent = 0) => {
    page.drawText(sanitise(s), {
      x: MARGIN.left + indent,
      y,
      size,
      font: isBold ? bold : regular,
      color: rgb(0.06, 0.09, 0.15),
    });
    y -= size + 6;
  };

  const muted = (s: string, size = 8.5, indent = 0) => {
    page.drawText(sanitise(s), {
      x: MARGIN.left + indent,
      y,
      size,
      font: regular,
      color: rgb(0.42, 0.48, 0.58),
    });
    y -= size + 5;
  };

  text('Certificate of completion', 16, true);
  y -= 6;
  muted(evidence.documentTitle);
  y -= 14;

  // ── The signature itself ─────────────────────────────────────────────────
  const png = await pdf.embedPng(evidence.signatureImage);
  // Scale to fit a fixed box, preserving the aspect ratio: a signature squashed
  // to fill a rectangle no longer looks like the mark the person made.
  const box = { w: 200, h: 70 };
  const scale = Math.min(box.w / png.width, box.h / png.height, 1);
  const w = png.width * scale;
  const h = png.height * scale;

  y -= h;
  page.drawImage(png, { x: MARGIN.left, y, width: w, height: h });
  page.drawLine({
    start: { x: MARGIN.left, y: y - 4 },
    end: { x: MARGIN.left + box.w, y: y - 4 },
    thickness: 0.75,
    color: rgb(0.72, 0.76, 0.82),
  });
  y -= 18;
  text(evidence.signerName, 10.5, true);
  muted(evidence.signerEmail);
  y -= 16;

  // ── What happened, and when ──────────────────────────────────────────────
  text('Record', 11, true);
  y -= 2;
  const stamp = (d: Date) => d.toISOString().replace('T', ' ').slice(0, 19) + ' UTC';

  muted(`Consent      ${stamp(evidence.consentAt)}`);
  muted(`"${evidence.consentText}"`, 8.5, 12);
  muted(`Signed       ${stamp(evidence.signedAt)}`);
  if (evidence.sessionAuthenticatedAt) {
    // The strongest single fact on this page. An emailed signing link proves
    // that somebody opened it; this proves the signer had already authenticated
    // as this account, on this device, before signing.
    muted(`Session      authenticated ${stamp(evidence.sessionAuthenticatedAt)}`);
  }
  if (evidence.ip) muted(`IP           ${evidence.ip}`);
  if (evidence.userAgent) muted(`Device       ${evidence.userAgent}`);
  if (evidence.appVersion) muted(`App          ${evidence.appVersion}`);
  if (evidence.lat != null && evidence.lng != null) {
    muted(`Location     ${evidence.lat.toFixed(4)}, ${evidence.lng.toFixed(4)}`);
  }
  y -= 12;

  // ── The integrity chain ──────────────────────────────────────────────────
  text('Integrity', 11, true);
  y -= 2;
  muted('SHA-256 of the document as signed:');
  muted(evidence.hashBefore, 8, 12);
  muted('Signature image SHA-256:');
  muted(evidence.signatureSha256, 8, 12);
  y -= 10;
  for (const line of [
    'This page was appended when the document was signed. If the file still',
    'hashes to the value recorded against it, it has not been altered since.',
  ]) {
    muted(line);
  }

  drawFooter(page, regular, {
    left: `${evidence.organizationName} · certificate`,
    right: `${pdf.getPageCount()} / ${pdf.getPageCount()}`,
  });

  return finalise(pdf, `${evidence.documentTitle} (signed)`, evidence.organizationName);
}

// ── Internals ───────────────────────────────────────────────────────────────

function drawFooter(
  page: ReturnType<PDFDocument['addPage']>,
  font: PDFFont,
  parts: { left: string; right: string },
) {
  const size = 7.5;
  const y = MARGIN.bottom - 22;
  page.drawText(sanitise(parts.left), {
    x: MARGIN.left, y, size, font, color: rgb(0.55, 0.6, 0.68),
  });
  const rightWidth = font.widthOfTextAtSize(parts.right, size);
  page.drawText(parts.right, {
    x: MARGIN.left + CONTENT_WIDTH - rightWidth, y, size, font, color: rgb(0.55, 0.6, 0.68),
  });
}

/**
 * Save with every source of variation pinned.
 *
 * Without this, two renders of identical content produce different bytes — PDF
 * stamps a creation date and a random document id — and the hash that is
 * supposed to prove the file has not changed would change by itself.
 */
async function finalise(pdf: PDFDocument, title: string, org: string): Promise<Buffer> {
  pdf.setTitle(sanitise(title));
  pdf.setAuthor(sanitise(org));
  pdf.setProducer('HBCField');
  pdf.setCreator('HBCField');
  pdf.setCreationDate(FIXED_EPOCH);
  pdf.setModificationDate(FIXED_EPOCH);
  return Buffer.from(await pdf.save({ useObjectStreams: false }));
}

/**
 * Last-resort scrub for strings that reach the page without going through the
 * layout check — metadata, a device string from a header, an IP.
 *
 * The body is validated up front and REFUSES rather than substituting; here a
 * question mark in a user-agent is better than a failed seal, because the
 * signature has already been made by then.
 */
function sanitise(s: string): string {
  const bad = unencodableCharacters(s);
  if (bad.length === 0) return s;
  let out = s;
  for (const ch of bad) out = out.split(ch).join('?');
  return out;
}
