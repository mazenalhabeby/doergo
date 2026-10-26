"use client"

import { useTranslation } from "react-i18next"

import type { GroupByOption } from "./grouped-list"

const GROUP_PILL =
  "h-8 whitespace-nowrap rounded-full px-3.5 text-[13px] font-medium text-muted-foreground outline-none " +
  "transition-colors hover:bg-shell-chip hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring " +
  "aria-pressed:bg-shell-nav-on aria-pressed:font-semibold aria-pressed:text-shell-nav-on-ink"

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
    <div className="mb-3 flex flex-wrap items-center gap-1">
      <span className="mr-1.5 text-[13px] font-semibold text-muted-foreground">{t("tasks.page.group")}</span>
      {options.map(({ value }) => (
        <button
          key={value}
          type="button"
          aria-pressed={groupBy === value}
          onClick={() => onChange(value)}
          className={GROUP_PILL}
        >
          {t(`tasks.groupBy.${value}`)}
        </button>
      ))}
    </div>
  )
}
