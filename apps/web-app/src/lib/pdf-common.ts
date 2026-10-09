/**
 * What every PDF this product draws has in common — the palette, the table
 * look, getting an image into the document, and text the built-in font can
 * draw.
 *
 * ⚠️ NO jsPDF IMPORT HERE. The PDF builders (invoice, statement, report, job
 * report) import jsPDF themselves and are reached through `import()` where the
 * screen allows it; this module stays small and free of the library so a page
 * that only needs a colour or a file name does not pull a PDF engine in.
 *
 * Extracted from invoice-pdf.ts and report-pdf.ts, which each carried an
 * identical `loadLogo` — the job report needed a third copy with downscaling,
 * and three copies of "load a cross-origin image" is how one of them stops
 * handling a CORS refusal.
 */

const INK = { r: 30, g: 41, b: 59 } // slate-800
const MUTED = { r: 100, g: 116, b: 139 } // slate-500
const ACCENT = { r: 37, g: 99, b: 235 } // brand-600
const LINE = { r: 226, g: 232, b: 240 } // slate-200

/** The document palette, shared with every PDF this product draws so they read as one family. */
export const PDF_PALETTE = { INK, MUTED, ACCENT, LINE } as const

export type Rgb = { r: number; g: number; b: number }
export const rgbTuple = (c: Rgb): [number, number, number] => [c.r, c.g, c.b]

/**
 * The autotable look every document uses: a grid, slate ink and lines, a brand
 * header. Spread into `autoTable(doc, { ...PDF_TABLE_THEME, ... })`.
 */
export const PDF_TABLE_THEME = {
  theme: "grid" as const,
  styles: { font: "helvetica", fontSize: 9, cellPadding: 2.5, textColor: rgbTuple(INK), lineColor: rgbTuple(LINE), lineWidth: 0.2 },
  headStyles: { fillColor: rgbTuple(ACCENT), textColor: [255, 255, 255] as [number, number, number], fontStyle: "bold" as const, fontSize: 8.5 },
}

export interface LoadedImage {
  dataUrl: string
  w: number
  h: number
  format: "PNG" | "JPEG"
}

export interface LoadImageOptions {
  /** Longest edge in pixels; larger images are drawn smaller on a canvas first. */
  maxEdge?: number
  /** JPEG keeps a 30-photo job small; PNG keeps a logo's transparency. Default PNG. */
  format?: "PNG" | "JPEG"
  /** JPEG quality, 0–1. */
  quality?: number
  timeoutMs?: number
}

/** The size an image is drawn at so its longest edge is at most `maxEdge`. */
export function fitWithin(w: number, h: number, maxEdge?: number): { w: number; h: number } {
  if (!maxEdge || (w <= maxEdge && h <= maxEdge) || w <= 0 || h <= 0) return { w, h }
  const scale = maxEdge / Math.max(w, h)
  return { w: Math.max(1, Math.round(w * scale)), h: Math.max(1, Math.round(h * scale)) }
}

/**
 * Load a (possibly cross-origin) image into a data URL a PDF can embed.
 * Resolves null on ANY failure — a refused CORS request, a dead link, a timeout
 * — so one missing picture never costs the whole document.
 *
 * ⚠️ FETCHED, NOT `<img crossOrigin>`. The page has usually shown the same photo
 * already, through a plain `<img>`: the storage answered that request WITHOUT
 * CORS headers (it only sends them when asked by an Origin), the browser cached
 * that answer, and a later crossOrigin load of the same URL is served from the
 * cache and refused — every photo then printed as "unavailable" while the screen
 * showed them all. `cache: "no-store"` asks the storage again, in CORS mode, and
 * the bytes come back as a same-origin blob, so the canvas is never tainted.
 */
export async function loadImage(url: string | null | undefined, opts: LoadImageOptions = {}): Promise<LoadedImage | null> {
  if (!url) return null
  const format = opts.format ?? "PNG"
  const abort = new AbortController()
  const timer = setTimeout(() => abort.abort(), opts.timeoutMs ?? 4000)
  let objectUrl: string | null = null
  try {
    let src = url
    if (!url.startsWith("data:")) {
      const res = await fetch(url, { mode: "cors", cache: "no-store", credentials: "omit", signal: abort.signal })
      if (!res.ok) return null
      objectUrl = URL.createObjectURL(await res.blob())
      src = objectUrl
    }
    const img = new Image()
    img.decoding = "async"
    const el = await new Promise<HTMLImageElement>((resolve, reject) => {
      img.onload = () => resolve(img)
      img.onerror = reject
      abort.signal.addEventListener("abort", () => reject(new Error("image timeout")))
      img.src = src
    })
    const natural = { w: el.naturalWidth || el.width, h: el.naturalHeight || el.height }
    if (!natural.w || !natural.h) return null
    const size = fitWithin(natural.w, natural.h, opts.maxEdge)
    const canvas = document.createElement("canvas")
    canvas.width = size.w
    canvas.height = size.h
    const ctx = canvas.getContext("2d")
    if (!ctx) return null
    if (format === "JPEG") {
      // JPEG has no transparency: a transparent signature would turn black.
      ctx.fillStyle = "#ffffff"
      ctx.fillRect(0, 0, size.w, size.h)
    }
    ctx.drawImage(el, 0, 0, size.w, size.h)
    const dataUrl = format === "JPEG" ? canvas.toDataURL("image/jpeg", opts.quality ?? 0.82) : canvas.toDataURL("image/png")
    // A blank result means the browser refused quietly.
    if (!dataUrl || dataUrl === "data:,") return null
    return { dataUrl, w: size.w, h: size.h, format }
  } catch {
    return null
  } finally {
    // A loaded image must not leave its timeout running (thirty photos = thirty timers).
    clearTimeout(timer)
    if (objectUrl) URL.revokeObjectURL(objectUrl)
  }
}

/** A letterhead logo: PNG (transparency kept), no resizing. */
export async function loadLogo(url?: string | null): Promise<{ dataUrl: string; w: number; h: number } | null> {
  const img = await loadImage(url, { format: "PNG" })
  return img ? { dataUrl: img.dataUrl, w: img.w, h: img.h } : null
}

/**
 * Text the PDF font can draw.
 *
 * jsPDF's built-in Helvetica covers Latin-1. Space-like characters outside it
 * (French thousands, the no-break space before "€") become plain spaces, and
 * the typographic marks our sentences use become their plain twins — a curly
 * quote or an arrow is a character the font may not hold.
 */
export function pdfSafeText(s: string | null | undefined): string {
  if (!s) return ""
  return s
    .replace(/[     ]/g, " ")
    .replace(/[“”„]/g, '"')
    .replace(/[‘’‚]/g, "'")
    .replace(/→/g, "->")
    .replace(/…/g, "...")
    .replace(/[–—]/g, "-")
}
