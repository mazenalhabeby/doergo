"use client"

import { useTranslation } from "react-i18next"

import { cn } from "@/lib/utils"

/** The boards' quick filter (`kqf`): a 38px pill, filled with ink when it is the slice on screen. */
export const QUICK_FILTER =
  "inline-flex h-[38px] items-center gap-2 rounded-full px-4 text-sm font-medium text-foreground outline-none " +
  "transition-colors hover:bg-shell-chip focus-visible:ring-2 focus-visible:ring-ring " +
  "aria-pressed:bg-foreground aria-pressed:font-semibold aria-pressed:text-background"

/**
 * Mine, or everything I oversee.
 *
 * Beside the workspace tabs because it is the same kind of question —
 * "which slice am I looking at" — and both counts stay visible so
 * somebody working in All cannot miss that a job is theirs.
 */
export function MineScopeToggle({
  mineOnly,
  counts,
  onChange,
}: {
  mineOnly: boolean
  counts: { all?: number; mine?: number } | undefined
  onChange: (mineOnly: boolean) => void
}) {
  const { t } = useTranslation()

  return (
    <div className="flex items-center gap-0.5" role="group" aria-label={t("tasks.myWork.scope.label", "Whose work")}>
      {(
        [
          [false, t("tasks.myWork.scope.all", "All"), counts?.all],
          [true, t("tasks.myWork.scope.mine", "Mine"), counts?.mine],
        ] as const
      ).map(([isMine, label, count]) => (
        <button
          key={label}
          type="button"
          aria-pressed={mineOnly === isMine}
          onClick={() => onChange(isMine)}
          className={QUICK_FILTER}
        >
          {label}
          {typeof count === "number" && <span className={cn("tabular-nums opacity-55")}>{count}</span>}
        </button>
      ))}
    </div>
  )
}
