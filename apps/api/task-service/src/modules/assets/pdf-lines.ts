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
 * Items on roughly the same baseline belong to the same line.
 *
 * In PDF units, which are points: 2.5 is well under a line of body text and
 * comfortably over the jitter in a table row's baselines.
 */
const SAME_LINE_TOLERANCE = 2.5;

/*
  ⚠️ `import()` THROUGH `new Function`, DELIBERATELY.

  This service compiles to CommonJS, and TypeScript rewrites a plain
  `await import('x')` into `require('x')` — which throws on an ESM-only package,
  at runtime, in production, with an error that says nothing about the cause.
  pdf.js ships its legacy build as `.mjs`. Hiding the specifier inside a
  constructed function is what keeps the compiler's hands off it, so the real
  dynamic import survives to run.

  Dynamic at all because pdf.js is about a megabyte: a service that files
  expenses should not carry a PDF engine into memory at boot for the minority
  of receipts that are PDFs.
*/
const esmImport = new Function('s', 'return import(s)') as (s: string) => Promise<any>;

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
  let doc: any;
  try {
    const pdfjs = await esmImport('pdfjs-dist/legacy/build/pdf.mjs');
    doc = await pdfjs.getDocument({
      data: new Uint8Array(bytes),
      /*
        This reads text and never renders, so everything that exists to make
        glyphs look right is dead weight — and each of those is a fetch or a
        font installed into the document for no reason.
      */
      disableFontFace: true,
      useSystemFonts: false,
      // A malformed page should cost that page, not the whole file.
      stopAtErrors: false,
      verbosity: 0,
      // ⚠️ No worker. A worker thread per receipt on a box that also runs the
      // database is not worth the parallelism for a two-page invoice.
      disableWorker: true,
    }).promise;
  } catch {
    return [];
  }

  try {
    const out: string[] = [];
    for (let i = 1; i <= Math.min(doc.numPages, MAX_PAGES); i++) {
      const page = await doc.getPage(i);
      const content = await page.getTextContent();

      // Baseline → the runs sitting on it, each with its x for ordering.
      const byLine = new Map<number, { x: number; text: string }[]>();
      for (const item of content.items) {
        if (!('str' in item) || !item.str.trim()) continue;
        const x = item.transform[4] as number;
        const y = item.transform[5] as number;
        // Snap to an existing baseline within tolerance, so a row whose cells
        // differ by a fraction of a point stays one row.
        let key = y;
        for (const existing of byLine.keys()) {
          if (Math.abs(existing - y) <= SAME_LINE_TOLERANCE) { key = existing; break; }
        }
        const row = byLine.get(key) ?? [];
        row.push({ x, text: item.str });
        byLine.set(key, row);
      }

      // Descending y: in PDF space the origin is the BOTTOM-left, so the
      // largest y is the top of the page. Sorting ascending reads the invoice
      // upside down — and the reader's vendor rule takes the first line.
      const lines = [...byLine.entries()]
        .sort((a, b) => b[0] - a[0])
        .map(([, runs]) =>
          runs
            .sort((a, b) => a.x - b.x)
            .map((r) => r.text)
            .join(' ')
            .replace(/\s+/g, ' ')
            .trim(),
        )
        .filter(Boolean);

      out.push(...lines);
      page.cleanup();
    }
    return out;
  } catch {
    return [];
  } finally {
    // Frees the engine's copy of the file rather than waiting for a GC that
    // does not know how large it is.
    try { await doc.destroy(); } catch { /* already gone */ }
  }
}
