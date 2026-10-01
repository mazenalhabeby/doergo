/**
 * A PDF's text layer → lines, in reading order, with their font size.
 *
 * ONE implementation for every server that reads PDFs: the expense reader
 * (receipts) and the document reader (certificates, letters, contracts a
 * member uploads). pdf.js itself is passed in — each service loads it from its
 * own node_modules — so this package never carries a megabyte PDF engine into
 * a browser bundle that imports something else from it.
 *
 * ⚠️ THE TEXT LAYER, NOT AN IMAGE OF IT. A generated PDF holds its characters
 * exactly as written, which beats any OCR of the same page. A scanned PDF (a
 * photo in a PDF wrapper) has no text layer and yields nothing — reported
 * honestly as nothing, never guessed at.
 */

export interface PdfLine {
  text: string;
  /** The largest font size on the line, in points — a heading is bigger than body text. */
  size: number;
  /** 1-based page number. */
  page: number;
}

/**
 * Items on roughly the same baseline belong to the same line. In points: well
 * under a line of body text, comfortably over the jitter in a table row.
 */
const SAME_LINE_TOLERANCE = 2.5;

/**
 * ⚠️ pdf.js 6 calls Promise.withResolvers, which Node only has from 22. On the
 * Node 20 containers EVERY PDF threw inside getDocument, and a catch turned
 * that into "no lines" — PDF receipts were silently never read. Supplied here,
 * before pdf.js runs.
 */
function ensureWithResolvers(): void {
  const P = Promise as unknown as { withResolvers?: unknown };
  if (typeof P.withResolvers === 'function') return;
  P.withResolvers = function withResolvers<T>() {
    let resolve!: (v: T) => void;
    let reject!: (e: unknown) => void;
    const promise = new Promise<T>((a, b) => {
      resolve = a;
      reject = b;
    });
    return { promise, resolve, reject };
  };
}

/**
 * Read up to `maxPages` pages. Never throws: a file that is not a PDF, is
 * encrypted, or is corrupt returns no lines.
 *
 * @param pdfjs the loaded `pdfjs-dist/legacy/build/pdf.mjs` module
 */
export async function pdfLines(
  pdfjs: { getDocument: (src: unknown) => { promise: Promise<any>; destroy: () => Promise<void> } },
  bytes: Uint8Array,
  opts: { maxPages?: number } = {},
): Promise<PdfLine[]> {
  ensureWithResolvers();
  let task: { promise: Promise<any>; destroy: () => Promise<void> } | undefined;
  try {
    task = pdfjs.getDocument({
      // A copy: pdf.js transfers (and detaches) the buffer it is given.
      data: new Uint8Array(bytes),
      // Reads text, never renders — everything that exists to draw glyphs is
      // dead weight and each is a fetch or a font installed for nothing.
      disableFontFace: true,
      useSystemFonts: false,
      stopAtErrors: false,
      verbosity: 0,
      disableWorker: true,
    });
    const doc = await task.promise;
    const out: PdfLine[] = [];
    for (let p = 1; p <= Math.min(doc.numPages, opts.maxPages ?? 3); p++) {
      const page = await doc.getPage(p);
      const content = await page.getTextContent();
      const rows = new Map<number, { size: number; runs: { x: number; text: string }[] }>();
      for (const item of content.items as any[]) {
        if (!('str' in item) || !item.str.trim()) continue;
        const x = item.transform[4] as number;
        const y = item.transform[5] as number;
        const size = Math.abs(item.transform[3] as number) || 0;
        let key = y;
        for (const existing of rows.keys()) {
          if (Math.abs(existing - y) <= SAME_LINE_TOLERANCE) { key = existing; break; }
        }
        const row = rows.get(key) ?? { size: 0, runs: [] };
        row.size = Math.max(row.size, size);
        row.runs.push({ x, text: item.str });
        rows.set(key, row);
      }
      // PDF y grows upwards: the top of the page has the largest y.
      for (const [, row] of [...rows.entries()].sort((a, b) => b[0] - a[0])) {
        const text = row.runs.sort((a, b) => a.x - b.x).map((r) => r.text).join(' ').replace(/\s+/g, ' ').trim();
        if (text) out.push({ text, size: Math.round(row.size * 10) / 10, page: p });
      }
      page.cleanup?.();
    }
    return out;
  } catch {
    return [];
  } finally {
    try { await task?.destroy(); } catch { /* already gone */ }
  }
}
