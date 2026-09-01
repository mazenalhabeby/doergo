"use client"

import { useState } from "react"
import { useTranslation } from "react-i18next"
import { useQuery, useMutation } from "@tanstack/react-query"
import {
  Folder, FolderOpen, FileText, ChevronRight, Loader2, Eye, Home,
  User, Calendar, Layers,
} from "lucide-react"
import { documentsApi, type BrowseLevel, type BrowseFolder, type IssuedRow } from "@/lib/api"
import { Button } from "@/components/ui/button"
import { notify } from "@/lib/toast"
import { cn } from "@/lib/utils"

/*
  The filing cabinet.

  The register beside this answers "what needs attention". It is the wrong
  shape for "find Mike's March payslip", which is how somebody looks for a
  document they already know exists — by walking to it. So this is folders.

  Three orderings rather than one, because two jobs look for the same document
  differently: payroll thinks type-then-period, HR thinks person-then-file.
  Forcing either into the other's hierarchy means scrolling.

  One level is fetched at a time. Drawing a folder costs the same whether the
  archive holds fifty documents or fifty thousand.
*/

type GroupBy = "type" | "member" | "year"

/** A step already walked. `label` is held so breadcrumbs need no second lookup. */
type Crumb = {
  kind: "type" | "member" | "year"
  key: string
  label: string
  undated: boolean
}

const GROUPS: { key: GroupBy; icon: typeof Layers }[] = [
  { key: "type", icon: Layers },
  { key: "member", icon: User },
  { key: "year", icon: Calendar },
]

export function FolderBrowser() {
  const { t, i18n } = useTranslation()
  const [groupBy, setGroupBy] = useState<GroupBy>("type")
  const [path, setPath] = useState<Crumb[]>([])
  const [opening, setOpening] = useState<string | null>(null)

  // The path is the query: each crumb narrows it, exactly as the server reads it.
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

  const changeGroup = (g: GroupBy) => {
    setGroupBy(g)
    setPath([]) // a different hierarchy makes the old path meaningless
  }

  return (
    <div>
      {/* How to file it. Not a filter — a different way through the same shelf. */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <span className="text-xs font-medium uppercase tracking-wide text-slate-400">
          {t("documents.sent.groupByLabel", "Browse by")}
        </span>
        {GROUPS.map(({ key, icon: Icon }) => (
          <button
            key={key}
            onClick={() => changeGroup(key)}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-sm transition-colors",
              groupBy === key
                ? "border-blue-600 bg-blue-600 text-white"
                : "border-slate-200 bg-white text-slate-600 hover:text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300",
            )}
          >
            <Icon className="h-3.5 w-3.5" />
            {t(`documents.sent.groupBy.${key}`)}
          </button>
        ))}
      </div>

      {/* Where you are */}
      <nav className="mb-3 flex flex-wrap items-center gap-1 text-sm" aria-label="Breadcrumb">
        <button
          onClick={() => setPath([])}
          className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-slate-500 hover:bg-slate-100 hover:text-slate-900 dark:hover:bg-slate-800 dark:hover:text-slate-100"
        >
          <Home className="h-3.5 w-3.5" />
          {t("documents.sent.allFiles", "All files")}
        </button>
        {path.map((c, i) => (
          <span key={`${c.kind}:${c.key}`} className="flex items-center gap-1">
            <ChevronRight className="h-3.5 w-3.5 text-slate-300 dark:text-slate-600" />
            <button
              onClick={() => setPath((p) => p.slice(0, i + 1))}
              className={cn(
                "rounded-md px-2 py-1",
                i === path.length - 1
                  ? "font-medium text-slate-900 dark:text-slate-50"
                  : "text-slate-500 hover:bg-slate-100 hover:text-slate-900 dark:hover:bg-slate-800",
              )}
            >
              {c.label}
            </button>
          </span>
        ))}
      </nav>

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
        {isLoading ? (
          <div className="flex items-center justify-center gap-2 py-16 text-sm text-slate-500">
            <Loader2 className="h-4 w-4 animate-spin" />
            {t("common.loading", "Loading")}
          </div>
        ) : data?.level === "documents" ? (
          data.documents.length === 0 ? (
            <Empty label={t("documents.sent.emptyFolder", "This folder is empty.")} />
          ) : (
            <ul className="divide-y divide-slate-100 dark:divide-slate-800">
              {data.documents.map((d) => (
                <DocumentRow
                  key={d.id}
                  doc={d}
                  locale={i18n.language}
                  busy={opening === d.id}
                  onOpen={() => open.mutate(d.id)}
                />
              ))}
            </ul>
          )
        ) : !data || data.folders.length === 0 ? (
          <Empty label={t("documents.sent.emptyFolder", "This folder is empty.")} />
        ) : (
          <ul className="divide-y divide-slate-100 dark:divide-slate-800">
            {data.folders.map((f) => (
              <li key={f.key}>
                <button
                  onClick={() => enter(f)}
                  className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-slate-50 dark:hover:bg-slate-800/50"
                >
                  <Folder className="h-5 w-5 shrink-0 text-blue-500" />
                  <span className="min-w-0 flex-1 truncate text-sm font-medium text-slate-900 dark:text-slate-50">
                    {folderLabel(f)}
                  </span>
                  <span className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-xs tabular-nums text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                    {f.count}
                  </span>
                  <ChevronRight className="h-4 w-4 shrink-0 text-slate-300 dark:text-slate-600" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}

function Empty({ label }: { label: string }) {
  return (
    <div className="flex flex-col items-center gap-2 py-16 text-center">
      <FolderOpen className="h-8 w-8 text-slate-300 dark:text-slate-600" />
      <p className="text-sm text-slate-500 dark:text-slate-400">{label}</p>
    </div>
  )
}

function DocumentRow({
  doc, locale, busy, onOpen,
}: { doc: IssuedRow; locale: string; busy: boolean; onOpen: () => void }) {
  const { t } = useTranslation()
  const month =
    doc.periodYear && doc.periodMonth
      ? new Date(Date.UTC(doc.periodYear, doc.periodMonth - 1, 1)).toLocaleDateString(locale, {
          month: "long", timeZone: "UTC",
        })
      : null

  return (
    <li className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-slate-50 dark:hover:bg-slate-800/50">
      <FileText className="h-5 w-5 shrink-0 text-slate-400" />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-slate-900 dark:text-slate-50">{doc.title}</p>
        <p className="mt-0.5 truncate text-xs text-slate-500 dark:text-slate-400">
          {month ?? doc.memberName}
          {month && (
            <>
              <span className="mx-1.5 text-slate-300 dark:text-slate-600">·</span>
              {doc.memberName}
            </>
          )}
        </p>
      </div>
      {!doc.openedAt && (
        <span className="hidden shrink-0 rounded-full bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-700 dark:bg-blue-500/10 dark:text-blue-300 sm:inline-block">
          {t("documents.sent.state.unopened", "Not opened")}
        </span>
      )}
      <Button
        variant="ghost" size="icon" className="h-8 w-8 shrink-0"
        disabled={busy} onClick={onOpen}
        aria-label={t("documents.sent.open", "Open")}
      >
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Eye className="h-4 w-4" />}
      </Button>
    </li>
  )
}
