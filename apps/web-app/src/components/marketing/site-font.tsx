import type { ReactNode } from "react"
import { SITE_FONT_CLASS } from "./site-fonts"

/**
 * The public site's faces (site-fonts.ts): Inter for text, and the Familjen / Martian variables its pieces use.
 * The app is in Geist (the body's font); every marketing page wraps its content in this. `contents` adds no box —
 * the font and the variables are inherited, the layout untouched.
 *
 * ⚠️ Anything a marketing page renders OUTSIDE this (a portal) has no site fonts — the marketing pages have none.
 */
export function SiteFont({ children }: { children: ReactNode }) {
  return <div className={`contents ${SITE_FONT_CLASS}`}>{children}</div>
}
