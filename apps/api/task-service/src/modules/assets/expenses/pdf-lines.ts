import { pdfLines } from '@hbcfield/shared';
import { loadPdfjs } from './pdfjs-loader';
/**
 * A PDF invoice → the lines a receipt reader can work with.
 *
 * A phone cannot do this. On-device OCR reads PIXELS, and a PDF has none until
 * something renders it — which needs a renderer no phone build carries. So the
 * one file type a driver is most likely to be *sent* rather than handed at a
 * counter is the one the camera path can never open. This is that path.
 *
 * ⚠️ THE TEXT LAYER, NOT AN IMAGE OF IT. Nearly every invoice a company emails
 * is generated, so its characters are in the file exactly as they were written.
 * That is better than any OCR of the same page could ever be: no confusion of
 * 8 for 3, no lost decimal point, in a field where a misread digit is money.
 *
 * A SCANNED pdf — a photocopy wrapped in a PDF container — has no text layer
 * and yields nothing here. That is reported honestly rather than guessed at.
 *
 * What it produces is handed to `parseReceipt` in shared: the same rules the
 * phone runs on a photograph and the same rules the office would apply reading
 * the paper. Pixels are platform work; meaning is one module.
 */

/** How much of a document is worth reading. */
const MAX_PAGES = 3;




/**
 * The visual lines of a PDF, top to bottom, left to right within each line.
 *
 * ⚠️ RECONSTRUCTED FROM COORDINATES, not taken as the file lists them. A PDF
 * stores text as positioned runs in whatever order the generator emitted them,
 * so "Gesamtbetrag" and "836,40" arrive as separate items even when they sit on
 * one printed line — and a reader handed those as separate lines sees a label
 * with no figure beside it. Grouping by baseline puts the page back the way a
 * person reads it, which is the order every rule downstream assumes.
 *
 * Returns [] for a PDF with no text layer, a corrupt file, or an engine that
 * failed. A receipt that cannot be read is a receipt somebody types in — never
 * a failed upload.
 */
export async function pdfToLines(bytes: Buffer): Promise<string[]> {
  let pdfjs: any;
  try {
    pdfjs = await loadPdfjs();
  } catch {
    return [];
  }
  // One reader for every service — see packages/shared/src/documents/pdf-lines.ts.
  return (await pdfLines(pdfjs, bytes, { maxPages: MAX_PAGES })).map((l) => l.text);
}
