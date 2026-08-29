"use client"

import { useMemo, useState } from "react"
import { useTranslation } from "react-i18next"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import {
  Search, Download, Loader2, FileText, Image as ImageIcon,
  ShieldCheck, ShieldAlert, ShieldX, PenLine, Trash2, Inbox, DownloadCloud, Upload, Clock, XCircle,
} from "lucide-react"
import { useRouter } from "next/navigation"
import { documentsApi, type MemberDocumentRow, type DocumentTypeRow } from "@/lib/api"
import { SupplyDocumentDialog } from "./_components/supply-document-dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { notify } from "@/lib/toast"
import { cn } from "@/lib/utils"

/*
  A member's own file.

  Three decisions here came out of looking at how payroll portals actually get
  used, and at the screens this was modelled on:

  1. TABS BY TYPE, not folders. Document types are static and mutually
     exclusive — a payslip is never also a contract — which is exactly the case
     tabs are for. Folders would invite nesting nobody needs.

  2. SEARCH IS PRESENT FROM THE START. It is the single most-used control in
     any document product; adding it "later" means a year of people scrolling.

  3. NOTHING IS PREFETCHED. Rows carry no download link: one is minted only when
     someone clicks, and that mint is what records the document as opened. A
     grid of live links would make "opened" mean "the page rendered".
*/

const MONTHS_KEY = [
  "january", "february", "march", "april", "may", "june",
  "july", "august", "september", "october", "november", "december",
] as const

/** Bytes, in the unit a person would say out loud. */
function fileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

/*
  A credential's standing, as a colour and a word.

  Colour alone would fail anyone who cannot distinguish red from green, and on
  a screen this is the one row where the difference decides whether somebody can
  be sent to a job — so the word carries the meaning and the colour only speeds
  it up.
*/
function StandingChip({ standing, expiresOn }: { standing: string; expiresOn: string | null }) {
  const { t } = useTranslation()
  const map: Record<string, { cls: string; Icon: typeof ShieldCheck; label: string }> = {
    VALID: { cls: "bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-400", Icon: ShieldCheck, label: t("documents.standing.valid") },
    EXPIRING: { cls: "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-400", Icon: ShieldAlert, label: t("documents.standing.expiring") },
    EXPIRED: { cls: "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-400", Icon: ShieldX, label: t("documents.standing.expired") },
  }
  const v = map[standing]
  if (!v) return null
  const days = expiresOn
    ? Math.ceil((new Date(expiresOn).getTime() - Date.now()) / 86_400_000)
    : null

  return (
    <span className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium", v.cls)}>
      <v.Icon className="h-3 w-3" />
      {standing === "EXPIRING" && days !== null
        ? t("documents.standing.inDays", { count: days })
        : v.label}
    </span>
  )
}

export default function MyDocumentsPage() {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const router = useRouter()

  const [activeType, setActiveType] = useState<string | null>(null)
  const [year, setYear] = useState<number | null>(null)
  const [search, setSearch] = useState("")
  const [opening, setOpening] = useState<string | null>(null)
  const [exported, setExported] = useState<{ title: string; url: string }[] | null>(null)
  const [supplying, setSupplying] = useState(false)

  const { data: types = [] } = useQuery<DocumentTypeRow[]>({
    queryKey: ["document-types"],
    queryFn: () => documentsApi.listTypes(),
  })

  const { data: documents = [], isLoading } = useQuery<MemberDocumentRow[]>({
    queryKey: ["my-documents"],
    queryFn: () => documentsApi.list(),
  })

  /*
    Filtered in the browser, not by refetching.

    A personnel file is tens of rows, not thousands — the whole set arrives in
    one request, so switching a tab is instant instead of a spinner. Search hits
    the server only if that ever stops being true.
  */
  const visible = useMemo(() => {
    const q = search.trim().toLowerCase()
    return documents.filter((d) => {
      if (activeType && d.typeId !== activeType) return false
      if (year !== null && (d.periodYear ?? new Date(d.issuedAt).getFullYear()) !== year) return false
      if (q && !d.title.toLowerCase().includes(q) && !d.typeLabel.toLowerCase().includes(q)) return false
      return true
    })
  }, [documents, activeType, year, search])

  /** Years that actually have documents — never a range with gaps in it. */
  const years = useMemo(() => {
    const set = new Set<number>()
    for (const d of documents) set.add(d.periodYear ?? new Date(d.issuedAt).getFullYear())
    return [...set].sort((a, b) => b - a)
  }, [documents])

  /** Only tabs with something behind them. An empty tab is a dead end. */
  const usedTypes = useMemo(() => {
    const ids = new Set(documents.map((d) => d.typeId))
    return types.filter((ty) => ids.has(ty.id))
  }, [types, documents])

  const awaiting = documents.filter((d) => d.needsSignature)

  const open = useMutation({
    mutationFn: (id: string) => documentsApi.downloadUrl(id),
    onMutate: (id) => setOpening(id),
    onSettled: () => setOpening(null),
    onSuccess: (res) => {
      if (!res?.url) return
      // A new tab rather than a same-tab navigation: losing the list to a PDF
      // viewer and having to come back is the most common complaint about
      // document portals.
      window.open(res.url, "_blank", "noopener,noreferrer")
      queryClient.invalidateQueries({ queryKey: ["my-documents"] })
    },
    onError: (e: Error) => notify.error(e.message),
  })

  /*
    Take the whole file away.

    GDPR portability, and the reason it opens each link rather than zipping:
    the server never assembles an archive in memory, which is the same rule the
    rest of this feature follows. A browser will block a burst of automatic
    downloads, so the links are handed over as a list to click.
  */
  const exportAll = useMutation({
    mutationFn: () => documentsApi.exportMine(),
    onSuccess: (res) => {
      if (!res?.count) { notify.error(t("documents.export.nothing")); return }
      setExported(res.files)
      notify.success(t("documents.export.ready", { count: res.count }))
    },
    onError: (e: Error) => notify.error(e.message),
  })

  const remove = useMutation({
    mutationFn: (id: string) => documentsApi.remove(id),
    onSuccess: () => {
      notify.success(t("documents.removed"))
      queryClient.invalidateQueries({ queryKey: ["my-documents"] })
    },
    onError: (e: Error) => notify.error(e.message),
  })

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-6 sm:px-6 lg:px-8">
      <header className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900 dark:text-slate-100">
            {t("documents.my.title")}
          </h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            {t("documents.my.subtitle")}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {/* Only when the organization actually asks its members for
              something. An upload button on an organization that issues
              everything is an invitation to be refused. */}
          {types.some((ty) => ty.direction === "SUPPLIED" && ty.isActive) && (
            <Button size="sm" onClick={() => setSupplying(true)}>
              <Upload className="mr-2 h-4 w-4" />
              {t("documents.supply.action")}
            </Button>
          )}
          {documents.length > 0 && (
            <Button variant="outline" size="sm" onClick={() => exportAll.mutate()} disabled={exportAll.isPending}>
              {exportAll.isPending
                ? <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                : <DownloadCloud className="mr-2 h-4 w-4" />}
              {t("documents.export.action")}
            </Button>
          )}
        </div>
      </header>

      <SupplyDocumentDialog
        types={types}
        open={supplying}
        onClose={() => setSupplying(false)}
      />

      {exported && (
        <div className="mb-6 rounded-xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-900/50">
          <div className="mb-2 flex items-center justify-between gap-3">
            <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
              {t("documents.export.ready", { count: exported.length })}
            </p>
            <button onClick={() => setExported(null)} className="text-xs text-slate-400 hover:text-slate-700">
              {t("common.close")}
            </button>
          </div>
          <p className="mb-3 text-xs text-slate-500 dark:text-slate-400">
            {t("documents.export.hint")}
          </p>
          <ul className="space-y-1">
            {exported.map((f, i) => (
              <li key={i}>
                <a href={f.url} target="_blank" rel="noopener noreferrer"
                  className="text-sm text-blue-600 hover:underline dark:text-blue-400">
                  {f.title}
                </a>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/*
        Anything needing a signature is lifted above the list.

        It is the only thing on this page that is waiting on the person reading
        it; leaving it in date order among twelve payslips is how it gets missed.
      */}
      {awaiting.length > 0 && (
        <div className="mb-6 rounded-xl border border-blue-200 bg-blue-50 p-4 dark:border-blue-900 dark:bg-blue-950/40">
          <div className="flex items-start gap-3">
            <div className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-blue-600 text-white">
              <PenLine className="h-4 w-4" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                {t("documents.my.awaiting", { count: awaiting.length })}
              </p>
              <p className="mt-0.5 text-sm text-slate-600 dark:text-slate-400">
                {awaiting.map((d) => d.title).join(" · ")}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="relative min-w-[200px] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t("documents.searchPlaceholder")}
            className="pl-9"
            aria-label={t("documents.searchPlaceholder")}
          />
        </div>
        {years.length > 1 && (
          <select
            value={year ?? ""}
            onChange={(e) => setYear(e.target.value ? Number(e.target.value) : null)}
            aria-label={t("documents.year")}
            className="h-10 rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
          >
            <option value="">{t("documents.allYears")}</option>
            {years.map((y) => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>
        )}
      </div>

      {/* Type tabs — only ones with documents behind them */}
      {usedTypes.length > 0 && (
        <div className="mb-4 flex gap-1 overflow-x-auto border-b border-slate-200 dark:border-slate-800" role="tablist">
          <button
            role="tab"
            aria-selected={activeType === null}
            onClick={() => setActiveType(null)}
            className={cn(
              "whitespace-nowrap border-b-2 px-3 py-2 text-sm font-medium transition-colors",
              activeType === null
                ? "border-blue-600 text-blue-600"
                : "border-transparent text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200",
            )}
          >
            {t("documents.allTypes")}
          </button>
          {usedTypes.map((ty) => (
            <button
              key={ty.id}
              role="tab"
              aria-selected={activeType === ty.id}
              onClick={() => setActiveType(ty.id)}
              className={cn(
                "whitespace-nowrap border-b-2 px-3 py-2 text-sm font-medium transition-colors",
                activeType === ty.id
                  ? "border-blue-600 text-blue-600"
                  : "border-transparent text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200",
              )}
            >
              {ty.label}
            </button>
          ))}
        </div>
      )}

      {/* The list */}
      {isLoading ? (
        <div className="space-y-2" aria-busy="true">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-16 animate-pulse rounded-lg bg-slate-100 dark:bg-slate-800" />
          ))}
        </div>
      ) : visible.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 py-14 text-center dark:border-slate-700">
          <Inbox className="mx-auto h-8 w-8 text-slate-300 dark:text-slate-600" />
          <p className="mt-3 text-sm font-medium text-slate-700 dark:text-slate-300">
            {documents.length === 0 ? t("documents.my.empty") : t("documents.noMatches")}
          </p>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            {documents.length === 0 ? t("documents.my.emptyHint") : t("documents.noMatchesHint")}
          </p>
        </div>
      ) : (
        <ul className="divide-y divide-slate-200 overflow-hidden rounded-xl border border-slate-200 dark:divide-slate-800 dark:border-slate-800">
          {visible.map((d) => {
            const isImage = d.mimeType.startsWith("image/")
            const period =
              d.periodMonth && d.periodYear
                ? `${t(`documents.months.${MONTHS_KEY[d.periodMonth - 1]}`)} ${d.periodYear}`
                : d.periodYear
                  ? String(d.periodYear)
                  : new Date(d.issuedAt).toLocaleDateString()

            return (
              <li key={d.id} className="flex items-center gap-3 bg-white px-4 py-3 dark:bg-slate-900">
                {/* Unread marker holds its width either way, so rows do not jog */}
                <span className="w-2 shrink-0" aria-hidden="true">
                  {d.unread && <span className="block h-2 w-2 rounded-full bg-blue-600" />}
                </span>

                <span className="shrink-0 text-slate-400">
                  {isImage ? <ImageIcon className="h-5 w-5" /> : <FileText className="h-5 w-5" />}
                </span>

                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="truncate text-sm font-medium text-slate-900 dark:text-slate-100">
                      {d.title}
                    </span>
                    {d.unread && (
                      <span className="rounded-full bg-blue-100 px-2 py-0.5 text-[11px] font-semibold text-blue-700 dark:bg-blue-950 dark:text-blue-400">
                        {t("documents.new")}
                      </span>
                    )}
                    {/* Never in the signing queue — the app cannot clear it —
                        but silence would leave the member unaware they must
                        sign a printed copy and return it. */}
                    {types.find((ty) => ty.id === d.typeId)?.signatureMode === "WET_INK" && (
                      <span className="rounded-full bg-blue-100 px-2 py-0.5 text-[11px] font-semibold text-blue-700 dark:bg-blue-950 dark:text-blue-400">
                        {t("documents.signOnPaper")}
                      </span>
                    )}
                    {d.needsSignature && (
                      <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-700 dark:bg-amber-950 dark:text-amber-400">
                        {t("documents.needsSignature")}
                      </span>
                    )}
                    {/*
                      What the member supplied, and where it got to.

                      Silence here would be the worst outcome of the whole
                      upload feature: somebody uploads a licence, sees it in
                      their list, and assumes they are covered for the work —
                      while the dispatch gate, which reads status, still says
                      no. The chip is the difference between "sent" and "counts".
                    */}
                    {d.status === "PENDING_VERIFICATION" && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                        <Clock className="h-3 w-3" />
                        {t("documents.status.pendingVerification")}
                      </span>
                    )}
                    {d.status === "REJECTED" && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2 py-0.5 text-[11px] font-semibold text-red-700 dark:bg-red-950 dark:text-red-400">
                        <XCircle className="h-3 w-3" />
                        {t("documents.status.rejected")}
                      </span>
                    )}
                    {/* A credential's standing is meaningless until it counts. */}
                    {d.standing && d.status !== "PENDING_VERIFICATION" && d.status !== "REJECTED" && (
                      <StandingChip standing={d.standing} expiresOn={d.expiresOn} />
                    )}
                  </div>
                  <p className="mt-0.5 truncate text-xs text-slate-500 tabular-nums dark:text-slate-400">
                    {d.typeLabel} · {period} · {fileSize(d.sizeBytes)}
                  </p>
                  {/* The reason, verbatim. "Rejected" on its own is an
                      instruction to upload the same photograph again. */}
                  {d.status === "REJECTED" && d.rejectionReason && (
                    <p className="mt-1 text-xs text-red-600 dark:text-red-400">
                      {d.rejectionReason}
                    </p>
                  )}
                </div>

                <div className="flex shrink-0 items-center gap-1">
                  {/*
                    A document waiting on the member goes to the signing flow,
                    not to a PDF viewer — opening it in a new tab and leaving
                    them to find the way back is how a request gets forgotten.
                  */}
                  {d.needsSignature ? (
                    <Button size="sm" onClick={() => router.push(`/my/documents/${d.id}/sign`)}>
                      {t("documents.signAction")}
                    </Button>
                  ) : (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => open.mutate(d.id)}
                    disabled={opening === d.id}
                    aria-label={t("documents.open")}
                  >
                    {opening === d.id ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Download className="h-4 w-4" />
                    )}
                  </Button>
                  )}
                  {/*
                    Only ever offered for what the member supplied. The server
                    refuses anything ISSUED regardless of what the UI shows —
                    this just avoids offering a button that always fails.
                  */}
                  {types.find((ty) => ty.id === d.typeId)?.direction === "SUPPLIED" && (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => remove.mutate(d.id)}
                      aria-label={t("common.delete")}
                    >
                      <Trash2 className="h-4 w-4 text-slate-400" />
                    </Button>
                  )}
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
