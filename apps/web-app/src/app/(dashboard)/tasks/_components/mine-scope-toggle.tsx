"use client"

import { useTranslation } from "react-i18next"

import { cn } from "@/lib/utils"

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
          <div className="mb-3 inline-flex rounded-lg border border-border bg-card p-0.5" role="group"
               aria-label={t("tasks.myWork.scope.label", "Whose work")}>
            {([
              [false, t("tasks.myWork.scope.all", "All"), counts?.all],
              [true, t("tasks.myWork.scope.mine", "Mine"), counts?.mine],
            ] as const).map(([isMine, label, count]) => (
              <button
                key={label}
                type="button"
                aria-pressed={mineOnly === isMine}
                onClick={() => onChange(isMine)}
                className={cn(
                  "inline-flex h-7 items-center gap-1.5 rounded-md px-3 text-[13px] font-medium transition",
                  mineOnly === isMine
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {label}
                {typeof count === "number" && (
                  <span className={cn(
                    "rounded px-1.5 text-[11px] font-bold tabular-nums",
                    mineOnly === isMine ? "bg-white/20" : "bg-muted text-muted-foreground",
                  )}>
                    {count}
                  </span>
                )}
              </button>
            ))}
          </div>
  )
}
