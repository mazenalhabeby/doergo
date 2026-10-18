import type { LucideIcon } from "lucide-react"
import { isValidElement, type ReactNode } from "react"
import { cn } from "@/lib/utils"

/*
  THE empty state for a section or a page with nothing in it
  (docs/design/ui-pieces/variants.md §5): a dashed box, an icon square, a title,
  an optional line under it and an optional action. Inside a panel or a list,
  one quiet line is enough — that is `EmptyNote` (components/ui/empty-note.tsx).
*/
export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
}: {
  /** A lucide icon, or an icon element already sized. */
  icon: LucideIcon | ReactNode
  title: ReactNode
  description?: ReactNode
  action?: ReactNode
  className?: string
}) {
  const Icon = icon as LucideIcon
  const glyph = isValidElement(icon) ? icon : <Icon className="h-6 w-6" />
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center rounded-xl border border-dashed bg-muted/20 px-6 py-12 text-center",
        className,
      )}
    >
      <span className="flex size-14 items-center justify-center rounded-2xl bg-muted text-muted-foreground">
        {glyph}
      </span>
      <p className="mt-4 text-sm font-semibold text-foreground">{title}</p>
      {description && <p className="mt-1 max-w-sm text-xs text-muted-foreground">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  )
}
