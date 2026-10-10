"use client"

import type { Dispatch, ReactNode, SetStateAction } from "react"
import { useTranslation } from "react-i18next"
import { AlertCircle, ChevronLeft, ChevronRight, RefreshCw } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { cn } from "@/lib/utils"

/**
 * The pieces of a filtered, paginated list page (Invitations, Join requests):
 * the header with its status filter and refresh, the row-range line, the
 * loading and error states of the table, and the pager under it.
 */

export function ListPageHeader({
  tour,
  title,
  subtitle,
  statusFilter,
  onStatusChange,
  statusOptions,
  isLoading,
  onRefresh,
  children,
}: {
  /** The guided tour's anchor on the title. */
  tour: string
  title: ReactNode
  subtitle: ReactNode
  statusFilter: string
  onStatusChange: (value: string) => void
  statusOptions: ReadonlyArray<{ value: string; labelKey: string }>
  isLoading: boolean
  onRefresh: () => void
  /** Actions after the refresh button. */
  children?: ReactNode
}) {
  const { t } = useTranslation()
  return (
    <div className="mb-8">
      <div className="flex items-start justify-between">
        <div>
          <h1 data-tour={tour} className="text-3xl font-bold text-foreground tracking-tight">
            {title}
          </h1>
          <p className="mt-1.5 text-muted-foreground">
            {subtitle}
          </p>
        </div>
        <div className="flex items-center gap-3">
          {/* Status Filter */}
          <Select value={statusFilter} onValueChange={onStatusChange}>
            <SelectTrigger className="w-[160px] h-11 bg-card/80 backdrop-blur-sm border-border/80 rounded-xl shadow-sm">
              <SelectValue placeholder={t("common.filterByStatus")} />
            </SelectTrigger>
            <SelectContent>
              {statusOptions.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {t(option.labelKey)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* Refresh */}
          <Button
            variant="outline"
            size="icon"
            onClick={onRefresh}
            disabled={isLoading}
            className="h-11 w-11 bg-card/80 backdrop-blur-sm border-border/80 rounded-xl shadow-sm hover:shadow-md transition-all"
          >
            <RefreshCw className={cn("size-4", isLoading && "animate-spin")} />
          </Button>
          {children}
        </div>
      </div>
    </div>
  )
}

/** The first and last row on this page, 1-based; 0 and 0 when there are none. */
export function pageRange(page: number, limit: number, total: number) {
  return {
    startItem: total > 0 ? (page - 1) * limit + 1 : 0,
    endItem: Math.min(page * limit, total),
  }
}

export function ListTableLoading() {
  return (
    <div className="p-6 space-y-4">
      {[...Array(5)].map((_, i) => (
        <Skeleton key={i} className="h-14 w-full rounded-lg" />
      ))}
    </div>
  )
}

export function ListTableError({ title, error, onRetry }: { title: ReactNode; error: unknown; onRetry: () => void }) {
  const { t } = useTranslation()
  return (
    <div className="p-12 text-center">
      <AlertCircle className="h-12 w-12 text-red-400 mx-auto mb-4" />
      <h3 className="text-lg font-medium text-foreground mb-2">{title}</h3>
      <p className="text-sm text-muted-foreground mb-4">{(error as Error)?.message}</p>
      <Button variant="outline" className="rounded-xl" onClick={onRetry}>
        {t("common.tryAgain")}
      </Button>
    </div>
  )
}

/** Previous / Next under the table; renders nothing for a single page. */
export function ListPager({
  page,
  totalPages,
  setPage,
}: {
  page: number
  totalPages: number
  setPage: Dispatch<SetStateAction<number>>
}) {
  const { t } = useTranslation()
  if (totalPages <= 1) return null
  return (
    <div className="flex items-center justify-between px-6 py-3 border-t border-border">
      <p className="text-sm text-muted-foreground">
        {t("common.page", { page, totalPages })}
      </p>
      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          className="rounded-lg"
          onClick={() => setPage((p) => Math.max(1, p - 1))}
          disabled={page === 1}
        >
          <ChevronLeft className="h-4 w-4" />
          {t("common.previous")}
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="rounded-lg"
          onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
          disabled={page >= totalPages}
        >
          {t("common.next")}
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  )
}
