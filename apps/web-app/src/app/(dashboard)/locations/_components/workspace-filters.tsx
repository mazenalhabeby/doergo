"use client"

import { useTranslation } from "react-i18next"
import { FilterPill, FilterPills, SearchPill } from "@/components/page/page-controls"

export type WorkspaceFilter = "all" | "active" | "archived"

/** The board's tool row over the workspace cards: find one by name, then all / active / archived. */
export function WorkspaceFilters({
  query,
  onQuery,
  filter,
  onFilter,
}: {
  query: string
  onQuery: (q: string) => void
  filter: WorkspaceFilter
  onFilter: (f: WorkspaceFilter) => void
}) {
  const { t } = useTranslation()
  const options: { key: WorkspaceFilter; label: string }[] = [
    { key: "all", label: t("common.all") },
    { key: "active", label: t("common.active") },
    { key: "archived", label: t("locations.archived", "Archived") },
  ]
  return (
    <div className="mb-3.5 flex flex-wrap items-center gap-2.5">
      <SearchPill
        className="sm:w-[280px]"
        value={query}
        onChange={(e) => onQuery(e.target.value)}
        placeholder={t("common.search")}
      />
      <FilterPills>
        {options.map((o) => (
          <FilterPill key={o.key} active={filter === o.key} onClick={() => onFilter(o.key)}>
            {o.label}
          </FilterPill>
        ))}
      </FilterPills>
    </div>
  )
}
