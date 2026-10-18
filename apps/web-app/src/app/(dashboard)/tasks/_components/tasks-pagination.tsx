"use client"

import type { Dispatch, SetStateAction } from "react"
import { useTranslation } from "react-i18next"

import { ListPager } from "@/components/ui/list-pager"

/** "Showing x of y", and the pager with page numbers when the table is paged. */
export function TasksPagination({
  shownCount,
  total,
  paginated,
  page,
  totalPages,
  setPage,
}: {
  shownCount: number
  total: number
  paginated: boolean
  page: number
  totalPages: number
  setPage: Dispatch<SetStateAction<number>>
}) {
  const { t } = useTranslation()
  const label = t("tasks.page.showingCount", { count: shownCount, total })

  // Not paged (or one page): the count alone, where the pager's label sits.
  if (!paginated || totalPages <= 1) return <p className="mt-5 text-sm text-muted-foreground tabular-nums">{label}</p>
  return (
    <ListPager
      page={page}
      totalPages={totalPages}
      setPage={setPage}
      label={label}
      numbered
      framed={false}
      className="mt-5"
    />
  )
}
