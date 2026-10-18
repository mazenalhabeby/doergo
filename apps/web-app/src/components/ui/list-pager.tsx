"use client"

import type { Dispatch, ReactNode, SetStateAction } from "react"
import { useTranslation } from "react-i18next"
import { ChevronLeft, ChevronRight } from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

/*
  THE pager. One look everywhere (docs/design/ui-pieces/variants.md §1): what the
  page is showing on the left, outline Previous / Next with chevrons on the right.

  - `label` replaces "Page x of y" when a table says more ("Showing 1–25 of 80",
    "80 documents").
  - `numbered` adds up to five page buttons between the two (the task list).
  - `framed` (default) is the footer of a card: top border and side padding.
    Off, it is a plain row under a list.
*/
export function ListPager({
  page,
  totalPages,
  setPage,
  label,
  numbered = false,
  framed = true,
  disabled = false,
  className,
}: {
  page: number
  totalPages: number
  setPage: Dispatch<SetStateAction<number>>
  label?: ReactNode
  numbered?: boolean
  framed?: boolean
  /** While the next page loads. */
  disabled?: boolean
  className?: string
}) {
  const { t } = useTranslation()
  if (totalPages <= 1) return null
  return (
    <div
      className={cn(
        "flex flex-wrap items-center justify-between gap-3",
        framed ? "border-t border-border px-6 py-3" : "mt-4",
        className,
      )}
    >
      <p className="text-sm text-muted-foreground tabular-nums">{label ?? t("common.page", { page, totalPages })}</p>
      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          className="rounded-lg"
          onClick={() => setPage((p) => Math.max(1, p - 1))}
          disabled={disabled || page <= 1}
        >
          <ChevronLeft className="h-4 w-4" />
          {t("common.previous")}
        </Button>
        {numbered && <PageNumbers page={page} totalPages={totalPages} setPage={setPage} disabled={disabled} />}
        <Button
          variant="outline"
          size="sm"
          className="rounded-lg"
          onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
          disabled={disabled || page >= totalPages}
        >
          {t("common.next")}
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  )
}

/** Up to five page numbers around the current page. */
function PageNumbers({
  page,
  totalPages,
  setPage,
  disabled,
}: {
  page: number
  totalPages: number
  setPage: Dispatch<SetStateAction<number>>
  disabled: boolean
}) {
  const count = Math.min(totalPages, 5)
  const first = totalPages <= 5 || page <= 3 ? 1 : page >= totalPages - 2 ? totalPages - 4 : page - 2
  return (
    <div className="hidden items-center gap-1 sm:flex">
      {Array.from({ length: count }, (_, i) => first + i).map((n) => (
        <Button
          key={n}
          variant={n === page ? "default" : "ghost"}
          size="icon"
          aria-current={n === page ? "page" : undefined}
          className={cn(
            "size-8 rounded-lg text-xs font-medium tabular-nums",
            n === page && "bg-foreground text-background hover:bg-foreground/90",
          )}
          disabled={disabled}
          onClick={() => setPage(n)}
        >
          {n}
        </Button>
      ))}
    </div>
  )
}
