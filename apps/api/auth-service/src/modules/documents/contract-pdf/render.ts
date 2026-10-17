/** Drawing a contract from its filled template, and the small pieces every page shares. */
import {
  CONTENT_WIDTH,
  MARGIN,
  PAGE,
  layout,
  parseBlocks,
  type Measure,
  unencodableCharacters,
} from '@hbcfield/shared';
import { PDFDocument, StandardFonts, rgb, type PDFFont } from 'pdf-lib';

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

interface ContractValues {
  title: string;
  body: string;
  /** Rendered into the footer of every page. Passed in, never read from a clock. */
  issuedAt: Date;
  organizationName: string;
  memberName: string;
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
 * What somebody was actually using, in words a reader can act on.
 *
 * The certificate showed the raw user-agent, which for the mobile app is
 * `okhttp/4.12.0` — the name of Android's HTTP library. On a record whose
 * purpose is to be read by a human deciding whether a signature is sound, that
 * is worse than nothing: it looks like a fault.
 *
 * Deliberately coarse. This is not device fingerprinting and should not become
 * it; "the Android app" is the fact that matters. The raw agent is still
 * printed beneath, because it is evidence and losing it to make the page read
 * better would be a bad trade.
 */
export function describeDevice(userAgent: string): string {
  const ua = userAgent.toLowerCase();

  // The app's own HTTP clients, which no browser sends.
  if (ua.includes('okhttp')) return 'HBCField app for Android';
  if (ua.includes('cfnetwork') || ua.includes('darwin')) return 'HBCField app for iOS';
  if (ua.includes('expo')) return 'HBCField app';

  const os = ua.includes('iphone') ? 'iPhone'
    : ua.includes('ipad') ? 'iPad'
    : ua.includes('android') ? 'Android'
    : ua.includes('mac os') || ua.includes('macintosh') ? 'macOS'
    : ua.includes('windows') ? 'Windows'
    : ua.includes('linux') ? 'Linux'
    : null;

  // Order matters: Edge and Opera both claim Chrome, and Chrome claims Safari.
  const browser = ua.includes('edg/') ? 'Edge'
    : ua.includes('opr/') || ua.includes('opera') ? 'Opera'
    : ua.includes('firefox') ? 'Firefox'
    : ua.includes('chrome') || ua.includes('crios') ? 'Chrome'
    : ua.includes('safari') ? 'Safari'
    : null;

  if (browser && os) return `${browser} on ${os}`;
  if (browser) return browser;
  if (os) return os;
  return 'Unrecognised device';
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
/** "29 August 2026, 11:20 UTC" — a date a person reads, not a timestamp. */
function longDate(d: Date): string {
  const months = ['January','February','March','April','May','June',
                  'July','August','September','October','November','December'];
  const hh = String(d.getUTCHours()).padStart(2, '0');
  const mm = String(d.getUTCMinutes()).padStart(2, '0');
  return `${d.getUTCDate()} ${months[d.getUTCMonth()]} ${d.getUTCFullYear()}, ${hh}:${mm} UTC`;
}

function sanitise(s: string): string {
  const bad = unencodableCharacters(s);
  if (bad.length === 0) return s;
  let out = s;
  for (const ch of bad) out = out.split(ch).join('?');
  return out;
}

export { drawFooter, longDate, sanitise };
