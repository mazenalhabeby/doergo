import { PDFDocument } from 'pdf-lib';
import { openUntrustedImage } from './image-input';

/**
 * Sheets of paper photographed one at a time, filed as ONE document.
 *
 * The supply path was built for a credential: a card held in a frame, with a
 * machine-readable zone and at most a reverse. A hotel invoice is six sheets
 * and none of that applies. Rather than teach the document model about pages —
 * which would ripple into signing, the chain, retention and every reader — the
 * sheets become a single PDF here, and everything downstream goes on seeing
 * one `storageKey` holding one file.
 *
 * ⚠️ Nobody downstream can address "page 3", and that is the trade being made
 * deliberately: no screen in the product asks for one, and a page array would
 * cost a schema change in eight places to serve a need that does not exist.
 */

/**
 * The longest edge any sheet is stored at.
 *
 * A phone hands over a 12-megapixel photograph of a sheet of A4. Embedded raw,
 * six of those are a ~25MB PDF that is slow to store, slow to fetch and slower
 * to open on the phone that sent it — for a page of text that is completely
 * legible at a fraction of the size. 2200px on the long edge is about 190 dpi
 * across A4: comfortably past what anybody reads on screen or prints to check.
 */
const MAX_EDGE = 2200;

/** JPEG quality for a page of text. Past ~82 the bytes grow and the glyphs do not. */
const QUALITY = 82;

/**
 * How many sheets one document may hold.
 *
 * Not a storage limit — it is the point past which somebody is photographing a
 * folder rather than a document, and every later reader pays for it.
 */
export const MAX_PAGES = 30;

/**
 * Normalise one sheet: strip the camera's rotation, bound the resolution, and
 * re-encode as JPEG.
 *
 * ⚠️ `openUntrustedImage` rather than sharp directly — these bytes came from a
 * phone over the wire, and it is the bounded opener that refuses a decompression
 * bomb before it reaches memory.
 */
async function normalise(bytes: Buffer): Promise<{ jpeg: Buffer; width: number; height: number }> {
  const image = (await openUntrustedImage(bytes))
    // `rotate()` with no argument applies the EXIF orientation and drops it, so
    // the stored page is the right way up everywhere rather than only in
    // readers that honour the tag.
    .rotate()
    .resize({ width: MAX_EDGE, height: MAX_EDGE, fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality: QUALITY, mozjpeg: true });

  const { data, info } = await image.toBuffer({ resolveWithObject: true });
  return { jpeg: data, width: info.width, height: info.height };
}

/**
 * Sheets in, one PDF out. Page size follows each sheet, so a portrait photo and
 * a landscape one both fill their own page instead of being letterboxed into a
 * fixed A4 frame.
 *
 * ⚠️ The sheets are normalised in PARALLEL and embedded in order. Sequential
 * normalisation is the obvious way to write this and makes a six-page upload
 * take six times as long for no benefit — the work is CPU-bound in sharp's
 * thread pool, not in this function.
 */
export async function assemblePagesPdf(sheets: Buffer[]): Promise<Buffer> {
  if (sheets.length === 0) {
    throw new Error('A document needs at least one page');
  }
  if (sheets.length > MAX_PAGES) {
    throw new Error(`A document may hold at most ${MAX_PAGES} pages`);
  }

  const normalised = await Promise.all(sheets.map(normalise));

  const pdf = await PDFDocument.create();
  for (const sheet of normalised) {
    const embedded = await pdf.embedJpg(sheet.jpeg);
    const page = pdf.addPage([sheet.width, sheet.height]);
    page.drawImage(embedded, { x: 0, y: 0, width: sheet.width, height: sheet.height });
  }

  // `useObjectStreams` keeps the cross-reference table compact — a few hundred
  // bytes per page, which is noise next to the images but free to have.
  return Buffer.from(await pdf.save({ useObjectStreams: true }));
}
