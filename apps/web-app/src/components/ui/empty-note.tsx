import type { LucideIcon } from "lucide-react"
import type { ReactNode } from "react"

/*
  "Nothing here" in the three shapes that were written out identically, copy for
  copy. Each renders EXACTLY the markup it replaced — same element, same classes —
  so nothing on screen moved. Shapes that differed are listed in
  docs/design/ui-pieces/variants.md for a single look the user chooses.
*/

/** One quiet line inside a panel: "Nothing logged yet." */
export function EmptyNote({ children }: { children: ReactNode }) {
  return <p className="py-8 text-center text-sm text-muted-foreground">{children}</p>
}

/** A whole page with nothing to show (no access, nothing set up). */
export function PageNotice({ children }: { children: ReactNode }) {
  return <div className="mx-auto max-w-2xl px-6 py-16 text-center text-sm text-muted-foreground">{children}</div>
}

/** A dashed box with a faint icon and one line. */
export function DashedEmptyBox({ icon: Icon, children }: { icon: LucideIcon; children: ReactNode }) {
  return (
    <div className="rounded-xl border border-dashed border-border py-16 text-center">
      <Icon className="mx-auto mb-2 h-8 w-8 text-muted-foreground/50" />
      <p className="text-sm text-muted-foreground">{children}</p>
    </div>
  )
}
