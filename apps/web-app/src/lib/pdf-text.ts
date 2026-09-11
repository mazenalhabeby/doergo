/**
 * The text printed on a PDF, read in the browser.
 *
 * ⚠️ Loaded through `import()` and never at module scope. pdf.js is roughly a
 * megabyte; putting it in the bundle would tax every page in the product to
 * serve one screen that opens a file occasionally. This way it is fetched the
 * first time a batch actually needs reading, and never otherwise.
 *
 * In the BROWSER rather than on the server, deliberately. The file is already
 * here — the drop handler is holding it — so reading it costs no upload and the
 * row fills in while the person is still looking at it. Thirty files would
 * otherwise be thirty round trips before anything appeared on screen.
 *
 * Nothing read here is trusted. What comes back only pre-fills fields the
 * reviewer can see and change, exactly like the member dropdown they already
 * set by hand, and the server re-validates the period it is finally sent
 * (`periodIsValid`). A browser that extracted nonsense produces a row somebody
 * corrects, never a document filed wrongly.
 *
 * ⚠️ It lived under `documents/_lib/` and was used by ONE screen, while the
 * member's own supply dialog — the other place in the product where somebody
 * hands over a PDF — asked the server to read it and was told nothing, because
 * the server's OCR cannot rasterise a PDF and never will without a renderer it
 * does not have. The capability existed and was one directory out of reach. It
 * is in `src/lib` now because two route trees read PDFs, not one.
 */

/** How much of a document is worth reading. */
const MAX_PAGES = 2;

/**
 * Two pages, not all of them.
 *
 * Everything this looks for — a date under a label, a name, an email — is on
 * the first page of every document of this kind. A twelve-page contract would
 * otherwise cost twelve pages of parsing to find something printed at the top,
 * and a malformed file could cost far more than that.
 */
export async function extractPdfText(file: File): Promise<string> {
  const pdfjs = await import("pdfjs-dist")

  /*
    The worker is resolved from the installed package by URL rather than copied
    into `public/`. A stale hand-copied worker whose version has drifted from the
    library is the classic way this integration breaks, and it breaks silently —
    the parse simply returns nothing.
  */
  pdfjs.GlobalWorkerOptions.workerSrc = new URL(
    "pdfjs-dist/build/pdf.worker.min.mjs",
    import.meta.url,
  ).toString()

  const data = new Uint8Array(await file.arrayBuffer())
  const doc = await pdfjs.getDocument({
    data,
    /*
      This reads text. It never renders, so every option that exists to make
      glyphs look right is dead weight — and each one is a fetch or a font
      installed into the document for no reason.

      (`isEvalSupported` was the other switch worth setting; pdf.js 5 removed
      it, having stopped using eval at all.)
    */
    disableFontFace: true,
    useSystemFonts: false,
    // A malformed page should cost us that page, not the whole file: a batch
    // where one bad PDF loses the other twenty-nine is worse than no scanning.
    stopAtErrors: false,
    verbosity: 0,
  }).promise

  try {
    const pages: string[] = []
    for (let i = 1; i <= Math.min(doc.numPages, MAX_PAGES); i++) {
      const page = await doc.getPage(i)
      const content = await page.getTextContent()
      /*
        Joined with newlines, not spaces.

        A PDF stores text as positioned runs, so "DATE" and "31.08.2026" arrive
        as separate items even though they sit on one line. Spaces would run
        "DUE" into the previous cell and change which label a date appears to be
        under — which is the one thing these rules must get right.
      */
      pages.push(
        content.items
          .map((it) => ("str" in it ? it.str : ""))
          .filter(Boolean)
          .join("\n"),
      )
      page.cleanup()
    }
    return pages.join("\n")
  } finally {
    // Frees the worker's copy of the file. Thirty of these in a payroll batch
    // is thirty documents' worth of memory if nobody closes them.
    await doc.destroy()
  }
}

/**
 * Read several files without opening thirty at once.
 *
 * A payroll drop is dozens of files and each parse is CPU work on the main
 * thread's doorstep. Three at a time keeps the screen responsive while still
 * finishing a batch in a fraction of the time a strict queue would take.
 */
export async function mapWithLimit<T, R>(
  items: T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const out: R[] = new Array(items.length)
  let next = 0
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    for (;;) {
      const i = next++
      if (i >= items.length) return
      out[i] = await fn(items[i]!, i)
    }
  })
  await Promise.all(workers)
  return out
}
