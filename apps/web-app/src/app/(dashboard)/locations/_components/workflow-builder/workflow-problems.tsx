"use client"

import { useTranslation } from "react-i18next"
import { AlertCircle } from "lucide-react"
import type { validateWorkflow } from "@hbcfield/shared/client"

/**
 * What would REFUSE this task type, shown while it is being built — four
 * lines at most, then a count.
 */
export function WorkflowProblems({ problems }: { problems: ReturnType<typeof validateWorkflow> }) {
  const { t } = useTranslation()
  return (
    <div className="space-y-1 rounded-lg border border-red-300 bg-red-50 px-3 py-2 dark:border-red-500/30 dark:bg-red-500/10">
      <p className="text-xs font-medium text-red-800 dark:text-red-300">
        {t("workflows.builder.problemsTitle", "This task type cannot be used yet")}
      </p>
      {problems.slice(0, 4).map((p, i) => (
        <p key={`${p.code}-${p.statusKey ?? i}`} className="flex items-start gap-2 text-xs text-red-700 dark:text-red-400">
          <AlertCircle className="mt-px size-3.5 shrink-0" />
          {p.message}
        </p>
      ))}
      {/* Four is enough to act on. The rest are usually the same fault
          repeated, and a list of twelve is the wall this replaced. */}
      {problems.length > 4 && (
        <p className="pl-5 text-xs text-red-700/80 dark:text-red-400/80">
          {t("workflows.builder.moreProblems", {
            count: problems.length - 4,
            defaultValue: "and {{count}} more",
          })}
        </p>
      )}
    </div>
  )
}
