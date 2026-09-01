"use client"

import { useState } from "react"
import { useTranslation } from "react-i18next"
import { useQuery, useMutation } from "@tanstack/react-query"
import {
  Folder, FolderOpen, FileText, ChevronRight, Eye, Loader2,
  User, Calendar, Layers, Clock,
} from "lucide-react"
import { documentsApi, type BrowseLevel, type BrowseFolder, type IssuedRow } from "@/lib/api"
import { Button } from "@/components/ui/button"
import { UserAvatar } from "@/components/user-avatar"
import { notify } from "@/lib/toast"
import { cn } from "@/lib/utils"

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

type GroupBy = "type" | "member" | "year"

type Crumb = { kind: "type" | "member" | "year"; key: string; label: string; undated: boolean }

const GROUPS: { key: GroupBy; icon: typeof Layers }[] = [
  { key: "type", icon: Layers },
  { key: "member", icon: User },
  { key: "year", icon: Calendar },
]

/** Loading that keeps the shape of what is coming, rather than a spinner. */
const Shimmer = ({ className }: { className?: string }) => (
  <div
    className={cn(
      "relative overflow-hidden rounded bg-muted before:absolute before:inset-0",
      "before:-translate-x-full before:animate-[shimmer_1.5s_infinite]",
      "before:bg-gradient-to-r before:from-transparent before:via-foreground/5 before:to-transparent",
      className,
    )}
  />
)

export function FolderBrowser() {
  const { t, i18n } = useTranslation()
  const [groupBy, setGroupBy] = useState<GroupBy>("type")
  const [path, setPath] = useState<Crumb[]>([])
  const [opening, setOpening] = useState<string | null>(null)

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
    queryKey: ["documents-browse", groupBy, path.map((c) => `${c.kind}:${c.key}`).join("/")],
    queryFn: () => documentsApi.browse(params),
    staleTime: 30_000,
  })

  const open = useMutation({
    mutationFn: (id: string) => documentsApi.downloadUrl(id),
    onMutate: (id: string) => setOpening(id),
    onSettled: () => setOpening(null),
    onSuccess: (res: any) => {
      if (res?.url) window.open(res.url, "_blank", "noopener,noreferrer")
    },
    onError: (e: any) =>
      notify.error(e?.message ?? t("documents.sent.openFailed", "Could not open the document")),
  })

  const folderLabel = (f: BrowseFolder) =>
    f.undated ? t("documents.sent.undated", "No period") : (f.label ?? f.key)

  const enter = (f: BrowseFolder) =>
    setPath((p) => [...p, { kind: f.kind, key: f.key, label: folderLabel(f), undated: f.undated }])

  return (
    <div>
      {/* How to file it — a different way through the same shelf, not a filter */}
      <div className="mb-5 flex flex-wrap items-center gap-2">
        <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground/70">
          {t("documents.sent.groupByLabel", "Browse by")}
        </span>
        <div className="inline-flex rounded-lg border border-border/80 bg-card p-0.5">
          {GROUPS.map(({ key, icon: Icon }) => (
            <button
              key={key}
              onClick={() => {
                setGroupBy(key)
                setPath([]) // a different hierarchy makes the old path meaningless
              }}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
                groupBy === key
                  ? "bg-accent text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              <Icon className="h-3.5 w-3.5" />
              {t(`documents.sent.groupBy.${key}`)}
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
          {t("documents.sent.allFiles", "All files")}
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

      <div className="overflow-hidden rounded-xl border border-border/80 bg-card">
        {isLoading ? (
          <div>
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="flex items-center gap-4 border-b border-border/20 px-5 py-3.5 last:border-0">
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
              {data.documents.map((d, i) => (
                <DocumentRow
                  key={d.id}
                  doc={d}
                  index={i}
                  locale={i18n.language}
                  busy={opening === d.id}
                  onOpen={() => open.mutate(d.id)}
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
                className="group flex w-full items-center gap-4 border-b border-border/50 px-5 py-3.5 text-left transition-colors last:border-0 hover:bg-accent/30"
              >
                {f.kind === "member" ? (
                  <UserAvatar
                    firstName={(f.label ?? "").split(" ")[0] ?? ""}
                    lastName={(f.label ?? "").split(" ").slice(1).join(" ")}
                    seed={f.key}
                    size="md"
                  />
                ) : (
                  <span
                    className={cn(
                      "flex size-9 shrink-0 items-center justify-center rounded-lg transition-colors",
                      f.undated
                        ? "bg-muted text-muted-foreground"
                        : "bg-primary/10 text-primary group-hover:bg-primary/15",
                    )}
                  >
                    {f.undated ? <Clock className="h-4 w-4" /> : <Folder className="h-4 w-4" />}
                  </span>
                )}

                <span className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">
                  {folderLabel(f)}
                </span>

                <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-xs font-medium tabular-nums text-muted-foreground">
                  {f.count}
                </span>
                <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground/40 transition-transform group-hover:translate-x-0.5" />
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function Empty() {
  const { t } = useTranslation()
  return (
    <div className="flex flex-col items-center gap-3 py-16 text-center">
      <div className="flex size-14 items-center justify-center rounded-2xl bg-muted">
        <FolderOpen className="h-6 w-6 text-muted-foreground/60" />
      </div>
      <p className="text-sm text-muted-foreground">
        {t("documents.sent.emptyFolder", "This folder is empty.")}
      </p>
    </div>
  )
}

function DocumentRow({
  doc, index, locale, busy, onOpen,
}: { doc: IssuedRow; index: number; locale: string; busy: boolean; onOpen: () => void }) {
  const { t } = useTranslation()
  const month =
    doc.periodYear && doc.periodMonth
      ? new Date(Date.UTC(doc.periodYear, doc.periodMonth - 1, 1)).toLocaleDateString(locale, {
          month: "long", timeZone: "UTC",
        })
      : null

  return (
    <div
      style={{ animation: `fadeSlideIn 0.25s ease-out ${index * 40}ms both` }}
      className="group flex items-center gap-4 border-b border-border/50 px-5 py-3.5 transition-colors last:border-0 hover:bg-accent/30"
    >
      <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
        <FileText className="h-4 w-4" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-foreground">{doc.title}</p>
        <p className="truncate text-sm text-muted-foreground">
          {month ?? doc.memberName}
          {month && (
            <>
              <span className="px-1.5 text-muted-foreground/40">·</span>
              {doc.memberName}
            </>
          )}
        </p>
      </div>
      {!doc.openedAt && (
        <span className="hidden shrink-0 rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-medium text-primary sm:inline-block">
          {t("documents.sent.state.unopened", "Not opened")}
        </span>
      )}
      <Button
        variant="ghost" size="icon"
        className="h-8 w-8 shrink-0 opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100"
        disabled={busy} onClick={onOpen}
        aria-label={t("documents.sent.open", "Open")}
      >
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Eye className="h-4 w-4" />}
      </Button>
    </div>
  )
}
