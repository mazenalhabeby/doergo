"use client"

import { useTranslation } from "react-i18next"
import { Loader2, Eye, Inbox } from "lucide-react"
import { Button } from "@/components/ui/button"
import { UserAvatar } from "@/components/common/user-avatar"
import { cn } from "@/lib/utils"
import { DocumentRowMenu, SelectionBar, VisibilityChip } from "./document-control"
import { Checkbox } from "@/components/ui/checkbox"
import { Panel } from "@/components/page/page-kit"
import { useOpenDocument } from "@/hooks/use-open-document"
import { Shimmer, periodLabel, ChainLine, StateChip } from "./sent-document-row-bits"
import type { SentRegister } from "../_hooks/use-sent-register"

/** The ATTENTION list: loading, empty, or the rows — selectable, each opened (and the open recorded) on its own. */
export function SentDocumentsList({
  isLoading,
  rows,
  tab,
  selection,
  setAction,
  canSelect,
}: Pick<SentRegister, "isLoading" | "rows" | "tab" | "selection" | "setAction" | "canSelect">) {
  const { t, i18n } = useTranslation()
  const { open, opening } = useOpenDocument({
    errorMessage: (e) => e?.message ?? t("documents.all.openFailed", "Could not open the document"),
  })
  return (
    <Panel className="overflow-hidden p-1.5">
      {isLoading ? (
        <div>
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="flex min-h-[62px] items-center gap-3.5 px-3.5 py-2.5">
              <Shimmer className="size-9 rounded-full" />
              <div className="flex-1 space-y-2">
                <Shimmer className={cn("h-4", ["w-44", "w-56", "w-40", "w-48"][i])} />
                <Shimmer className="h-3 w-32" />
              </div>
              <Shimmer className="h-5 w-24 rounded-full" />
            </div>
          ))}
        </div>
      ) : rows.length === 0 ? (
        <div className="flex flex-col items-center gap-3 py-16 text-center">
          <div className="flex size-14 items-center justify-center rounded-2xl bg-muted">
            <Inbox className="h-6 w-6 text-muted-foreground/60" />
          </div>
          <p className="text-sm text-muted-foreground">{t(`documents.all.empty.${tab}`)}</p>
        </div>
      ) : (
        <div>
          <SelectionBar
            selected={selection.selected}
            onClear={selection.clear}
            onAction={(kind, picked) => setAction({ kind, rows: picked })}
          />
          {canSelect && selection.selected.length === 0 && rows.length > 1 && (
            <div className="flex h-10 items-center gap-2.5 px-3.5">
              <Checkbox
                id="docs-select-all"
                checked={selection.allSelected}
                onCheckedChange={() => selection.toggleAll()}
                aria-label={t("documents.control.selectAll", "Select all on this page")}
              />
              <label htmlFor="docs-select-all" className="cursor-pointer text-xs text-muted-foreground">
                {t("documents.control.selectAll", "Select all on this page")}
              </label>
            </div>
          )}
          {rows.map((row, i) => {
            const period = periodLabel(row, i18n.language)
            const [first = "", ...rest] = row.memberName.split(" ")
            return (
              <div
                key={row.id}
                style={{ animation: `fadeSlideIn 0.25s ease-out ${i * 40}ms both` }}
                className={cn(
                  "group flex min-h-[62px] items-center gap-3.5 rounded-[14px] px-3.5 py-2.5 transition-colors hover:bg-accent",
                  selection.isSelected(row.id) && "bg-shell-nav-on",
                )}
              >
                {canSelect && (
                  <Checkbox
                    checked={selection.isSelected(row.id)}
                    onCheckedChange={() => selection.toggle(row.id)}
                    aria-label={t("documents.control.selectOne", {
                      defaultValue: "Select {{title}}",
                      title: row.title,
                    })}
                  />
                )}
                <UserAvatar
                  firstName={first}
                  lastName={rest.join(" ")}
                  seed={row.memberId}
                  size="lg"
                  soft
                  className="size-9"
                />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[14.5px] font-semibold text-foreground">{row.title}</p>
                  <p className="truncate text-[12.5px] text-muted-foreground">
                    {row.memberName}
                    <span className="px-1.5 text-muted-foreground/40">·</span>
                    {row.typeLabel}
                    {period && (
                      <>
                        <span className="px-1.5 text-muted-foreground/40">·</span>
                        {period}
                      </>
                    )}
                  </p>
                  <ChainLine chain={row.chain} />
                </div>

                <VisibilityChip row={row} />
                <StateChip row={row} />

                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 shrink-0 opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100"
                  disabled={opening === row.id}
                  onClick={() => open.mutate(row.id)}
                  aria-label={t("documents.all.open", "Open")}
                >
                  {opening === row.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Eye className="h-4 w-4" />}
                </Button>
                <DocumentRowMenu row={row} onAction={(kind, picked) => setAction({ kind, rows: picked })} />
              </div>
            )
          })}
        </div>
      )}
    </Panel>
  )
}
