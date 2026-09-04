"use client"

import { cn } from "@/lib/utils"
import { useTranslation } from "react-i18next"

/**
 * The row of workspace tabs — "All", then one per space, underlined when active.
 *
 * Lifted verbatim out of the tasks page, which is where this pattern was
 * invented and where it stays in use. It is the app's established way of saying
 * "which workspace are you looking at", so every screen that has to ask should
 * ask it the same way rather than growing its own dropdown.
 *
 * Deliberately dumb: it renders what it is given and reports clicks. Which
 * spaces belong in it, whether the row should appear at all, and where the
 * choice is remembered are decisions for `useSpaceScope`, because they differ
 * per screen while this does not.
 */
export interface SpaceTabItem {
  id: string
  name: string
  /** Optional count shown beside the name — omitted when the screen has none. */
  count?: number
}

export function SpaceTabs({
  spaces,
  value,
  onChange,
  allLabel,
  showAll = true,
  className,
}: {
  spaces: SpaceTabItem[]
  /** null = the All tab. */
  value: string | null
  onChange: (spaceId: string | null) => void
  /** Overrides the "All" wording where a screen means something more specific. */
  allLabel?: string
  /**
   * Whether an All tab makes sense at all.
   *
   * It does not everywhere: a client portal belongs to one workspace, so "all
   * portals" is a different screen rather than this one unfiltered.
   */
  showAll?: boolean
  className?: string
}) {
  const { t } = useTranslation()
  if (spaces.length === 0) return null

  const tab = (key: string, label: string, count: number | undefined, isActive: boolean, onClick: () => void) => (
    <button
      key={key}
      onClick={onClick}
      className={cn(
        "relative px-3 py-2 text-sm whitespace-nowrap transition-colors duration-150",
        isActive ? "text-foreground font-semibold" : "text-muted-foreground hover:text-foreground font-medium",
      )}
    >
      {label}
      {count !== undefined && count > 0 && (
        <span className={cn("ml-1 text-[11px] tabular-nums", isActive ? "text-foreground/60" : "text-muted-foreground/60")}>
          {count}
        </span>
      )}
      {isActive && <span className="absolute bottom-0 left-2 right-2 h-[2px] rounded-full bg-foreground" />}
    </button>
  )

  return (
    <div className={cn("mb-3", className)}>
      <div className="flex items-center gap-0.5 overflow-x-auto scrollbar-hide">
        {showAll && tab("__all", allLabel ?? t("common.all"), undefined, value === null, () => onChange(null))}
        {spaces.map((s) => tab(s.id, s.name, s.count, value === s.id, () => onChange(s.id)))}
      </div>
      <div className="h-px bg-border/50" />
    </div>
  )
}
