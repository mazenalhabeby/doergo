import type { ReactNode } from "react"

/**
 * The public site's face: Inter. The app is in Geist (the body's font); a marketing page wraps its content in this
 * so it keeps the face it was designed in. `contents` adds no box — the font is inherited, the layout untouched.
 */
export function SiteFont({ children }: { children: ReactNode }) {
  return <div className="contents font-site">{children}</div>
}
