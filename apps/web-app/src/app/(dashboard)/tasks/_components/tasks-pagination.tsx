"use client"

import type { Dispatch, SetStateAction } from "react"
import { useTranslation } from "react-i18next"
import { ChevronLeft, ChevronRight } from "lucide-react"

import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

/** "Showing x of y", and page buttons when the table is paged. */
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

  return (
          <div className="flex items-center justify-between mt-5">
            <p className="text-xs text-muted-foreground">
              {t("tasks.page.showingCount", { count: shownCount, total })}
            </p>

            {paginated && totalPages > 1 && (
              <div className="flex items-center gap-1.5">
                <Button
                  variant="outline"
                  size="icon"
                  className="size-8 rounded-lg"
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page === 1}
                >
                  <ChevronLeft className="size-3.5" />
                </Button>

                {Array.from({ length: Math.min(totalPages, 5) }).map((_, i) => {
                  let pageNum: number
                  if (totalPages <= 5) {
                    pageNum = i + 1
                  } else if (page <= 3) {
                    pageNum = i + 1
                  } else if (page >= totalPages - 2) {
                    pageNum = totalPages - 4 + i
                  } else {
                    pageNum = page - 2 + i
                  }

                  return (
                    <Button
                      key={pageNum}
                      variant={page === pageNum ? "default" : "ghost"}
                      size="icon"
                      className={cn(
                        "size-8 rounded-lg text-xs font-medium",
                        page === pageNum && "bg-foreground text-background hover:bg-foreground/90"
                      )}
                      onClick={() => setPage(pageNum)}
                    >
                      {pageNum}
                    </Button>
                  )
                })}

                <Button
                  variant="outline"
                  size="icon"
                  className="size-8 rounded-lg"
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page === totalPages}
                >
                  <ChevronRight className="size-3.5" />
                </Button>
              </div>
            )}
          </div>
  )
}
