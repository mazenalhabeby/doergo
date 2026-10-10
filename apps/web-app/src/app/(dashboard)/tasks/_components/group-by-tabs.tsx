"use client"

import { useTranslation } from "react-i18next"

import { cn } from "@/lib/utils"
import type { GroupByOption } from "./grouped-list"

/** Group-by tabs (only on list view). */
export function GroupByTabs({
  options,
  value: groupBy,
  onChange,
}: {
  options: { value: GroupByOption; label: string }[]
  value: GroupByOption
  onChange: (value: GroupByOption) => void
}) {
  const { t } = useTranslation()

  return (
          <div className="mb-3 flex items-center gap-1 text-xs text-muted-foreground">
            <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground/50 mr-1">{t("tasks.page.group")}</span>
            {options.map(({ value }) => (
              <button
                key={value}
                onClick={() => onChange(value)}
                className={cn(
                  "px-2.5 py-1 rounded-md transition-colors duration-150 whitespace-nowrap",
                  groupBy === value
                    ? "bg-foreground/10 text-foreground font-semibold"
                    : "text-muted-foreground hover:text-foreground hover:bg-accent/50 font-medium"
                )}
              >
                {t(`tasks.groupBy.${value}`)}
              </button>
            ))}
          </div>
  )
}
