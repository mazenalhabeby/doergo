"use client"

import { useState } from "react"
import { useTranslation } from "react-i18next"
import { useQuery } from "@tanstack/react-query"
import { Folder, ChevronRight, Clock } from "lucide-react"
import { documentsApi, type BrowseLevel, type BrowseFolder, type IssuedRow } from "@/lib/api"
import { UserAvatar } from "@/components/common/user-avatar"
import { useOpenDocument } from "@/hooks/use-open-document"
import { cn } from "@/lib/utils"
import { Count, Panel } from "@/components/page/page-kit"
import { Checkbox } from "@/components/ui/checkbox"
import {
  DocumentActionDialogs,
  SelectionBar,
  useDocumentControl,
  useRowSelection,
  type DocumentAction,
} from "./document-control"
import { keys } from "@/lib/query-keys"
import { type GroupBy, type Crumb, GROUPS, Shimmer, Empty, DocumentRow } from "./document-row"

/*
  The filing cabinet.

  The queue beside this answers "what needs attention". It is the wrong shape
  for "find Mike's March payslip" — how somebody looks for a document they
  already know exists, which is by walking to it. So this is folders.

  Three orderings, because two jobs look for the same document differently:
  payroll thinks type-then-period, HR thinks person-then-file. Forcing either
  into the other's hierarchy means scrolling.

  One level is fetched at a time. Opening a folder costs the same whether the
  archive holds fifty documents or fifty thousand.
*/
export function FolderBrowser() {
  const { t, i18n } = useTranslation()
  const [groupBy, setGroupBy] = useState<GroupBy>("type")
  const [path, setPath] = useState<Crumb[]>([])

  // The path IS the query — each crumb narrows it exactly as the server reads it.
  const params = {
    groupBy,
    typeId: path.find((c) => c.kind === "type")?.key,
    userId: path.find((c) => c.kind === "member")?.key,
    year: (() => {
      const y = path.find((c) => c.kind === "year")
      return y && !y.undated ? Number(y.key) : undefined
    })(),
    undated: path.some((c) => c.kind === "year" && c.undated),
  }

  const { data, isLoading } = useQuery<BrowseLevel>({
    queryKey: keys.documents.browse(groupBy, path.map((c) => `${c.kind}:${c.key}`).join("/")),
    queryFn: () => documentsApi.browse(params),
    staleTime: 30_000,
  })

  // A member's folder is where "clear their contracts" happens: tick, then act.
  const shelf = data?.level === "documents" ? data.documents : []
  const control = useDocumentControl()
  const canSelect = control.canVisibility || control.canDelete
  const selection = useRowSelection(shelf)
  const [action, setAction] = useState<{ kind: DocumentAction; rows: IssuedRow[] } | null>(null)
  const act = (kind: DocumentAction, rows: IssuedRow[]) => setAction({ kind, rows })

  const { open, opening } = useOpenDocument({
    errorMessage: (e) => e?.message ?? t("documents.all.openFailed", "Could not open the document"),
  })

  const folderLabel = (f: BrowseFolder) => (f.undated ? t("documents.all.undated", "No period") : (f.label ?? f.key))

  const enter = (f: BrowseFolder) =>
    setPath((p) => [...p, { kind: f.kind, key: f.key, label: folderLabel(f), undated: f.undated }])

  return (
    <div>
      {/* How to file it — a different way through the same shelf, not a filter */}
      <div className="mb-5 flex flex-wrap items-center gap-2">
        <span className="text-[12.5px] font-medium text-muted-foreground">
          {t("documents.all.groupByLabel", "Browse by")}
        </span>
        <div className="inline-flex gap-0.5 rounded-xl bg-shell-chip p-[3px]">
          {GROUPS.map(({ key, icon: Icon }) => (
            <button
              key={key}
              onClick={() => {
                setGroupBy(key)
                setPath([]) // a different hierarchy makes the old path meaningless
              }}
              className={cn(
                "inline-flex h-[30px] items-center gap-1.5 rounded-[9px] px-3 text-[12.5px] font-medium transition-colors",
                groupBy === key ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
              )}
            >
              <Icon className="h-3.5 w-3.5" />
              {t(`documents.all.groupBy.${key}`)}
            </button>
          ))}
        </div>
      </div>

      {/* Where you are */}
      <nav className="mb-3 flex flex-wrap items-center gap-0.5 text-sm" aria-label="Breadcrumb">
        <button
          onClick={() => setPath([])}
          className={cn(
            "rounded-md px-2 py-1 transition-colors",
            path.length === 0
              ? "font-medium text-foreground"
              : "text-muted-foreground hover:bg-accent/40 hover:text-foreground",
          )}
        >
          {t("documents.all.allFiles", "All files")}
        </button>
        {path.map((c, i) => (
          <span key={`${c.kind}:${c.key}`} className="flex items-center gap-0.5">
            <ChevronRight className="h-3.5 w-3.5 text-muted-foreground/40" />
            <button
              onClick={() => setPath((p) => p.slice(0, i + 1))}
              className={cn(
                "rounded-md px-2 py-1 transition-colors",
                i === path.length - 1
                  ? "font-medium text-foreground"
                  : "text-muted-foreground hover:bg-accent/40 hover:text-foreground",
              )}
            >
              {c.label}
            </button>
          </span>
        ))}
      </nav>

      <Panel className="overflow-hidden p-1.5">
        {isLoading ? (
          <div>
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="flex min-h-[62px] items-center gap-3.5 px-3.5 py-2.5">
                <Shimmer className="size-9 rounded-lg" />
                <Shimmer className={cn("h-4", ["w-32", "w-44", "w-36", "w-28"][i])} />
                <div className="flex-1" />
                <Shimmer className="h-5 w-8 rounded-full" />
              </div>
            ))}
          </div>
        ) : data?.level === "documents" ? (
          data.documents.length === 0 ? (
            <Empty />
          ) : (
            <div>
              <SelectionBar selected={selection.selected} onClear={selection.clear} onAction={act} />
              {canSelect && selection.selected.length === 0 && data.documents.length > 1 && (
                <div className="flex h-10 items-center gap-2.5 px-3.5">
                  <Checkbox
                    id="folder-select-all"
                    checked={selection.allSelected}
                    onCheckedChange={() => selection.toggleAll()}
                  />
                  <label htmlFor="folder-select-all" className="cursor-pointer text-xs text-muted-foreground">
                    {t("documents.control.selectAllFolder", "Select all in this folder")}
                  </label>
                </div>
              )}
              {data.documents.map((d, i) => (
                <DocumentRow
                  key={d.id}
                  doc={d}
                  index={i}
                  locale={i18n.language}
                  busy={opening === d.id}
                  onOpen={() => open.mutate(d.id)}
                  selectable={canSelect}
                  selected={selection.isSelected(d.id)}
                  onToggle={() => selection.toggle(d.id)}
                  onAction={act}
                />
              ))}
            </div>
          )
        ) : !data || data.folders.length === 0 ? (
          <Empty />
        ) : (
          <div>
            {data.folders.map((f, i) => (
              <button
                key={f.key}
                onClick={() => enter(f)}
                style={{ animation: `fadeSlideIn 0.25s ease-out ${i * 40}ms both` }}
                className={
                  "group flex min-h-[62px] w-full items-center gap-3.5 rounded-[14px] px-3.5 " +
                  "py-2.5 text-left transition-colors hover:bg-accent"
                }
              >
                {f.kind === "member" ? (
                  <UserAvatar
                    firstName={(f.label ?? "").split(" ")[0] ?? ""}
                    lastName={(f.label ?? "").split(" ").slice(1).join(" ")}
                    seed={f.key}
                    size="lg"
                    soft
                    className="size-9"
                  />
                ) : (
                  <span
                    className={cn(
                      "flex size-9 shrink-0 items-center justify-center rounded-xl transition-colors",
                      f.undated ? "bg-muted text-muted-foreground" : "bg-shell-accent-soft text-shell-accent",
                    )}
                  >
                    {f.undated ? <Clock className="h-4 w-4" /> : <Folder className="h-4 w-4" />}
                  </span>
                )}

                <span className="min-w-0 flex-1 truncate text-[14.5px] font-semibold text-foreground">
                  {folderLabel(f)}
                </span>

                <Count n={f.count} />
                <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground/40 transition-transform group-hover:translate-x-0.5" />
              </button>
            ))}
          </div>
        )}
      </Panel>
      <DocumentActionDialogs
        action={action?.kind ?? null}
        rows={action?.rows ?? []}
        onClose={() => setAction(null)}
        onDone={selection.clear}
      />
    </div>
  )
}
