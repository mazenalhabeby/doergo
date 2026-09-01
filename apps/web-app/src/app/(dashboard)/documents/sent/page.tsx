"use client"

import { useState } from "react"
import { useTranslation } from "react-i18next"
import { useQuery, useMutation } from "@tanstack/react-query"
import { useRouter } from "next/navigation"
import {
  ArrowLeft, Search, Loader2, Eye, PenLine, MailOpen, CheckCircle2,
  FileText, Inbox, ChevronLeft, ChevronRight, FolderTree, ListChecks,
} from "lucide-react"
import { documentsApi, type IssuedRegister, type IssuedRow } from "@/lib/api"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { notify } from "@/lib/toast"
import { cn } from "@/lib/utils"
import { FolderBrowser } from "./_components/folder-browser"

/*
  What the organization has sent.

  Every other document list answers "what does THIS PERSON have" — the member's
  own file, or one member's record opened from the team page. So an admin could
  inspect people one at a time and never see the shape of the whole thing: what
  went out, who never opened it, what is still unsigned. This is that view.

  Organized by the question rather than by date. A register that opens on five
  hundred rows sorted newest-first is a register nobody opens twice, so the
  default is "awaiting signature" — the only rows that are holding anything up.
  "Not opened" sits beside it because it is the state nothing surfaced at all
  before: delivered, and never looked at.

  No row carries a link. Opening mints one and records the open, which is what
  makes the delivery evidence mean anything — so the eye is an action here, not
  a convenience.
*/

type Tab = "awaiting" | "unopened" | "signed" | "all"

const TABS: { key: Tab; icon: typeof PenLine }[] = [
  { key: "awaiting", icon: PenLine },
  { key: "unopened", icon: MailOpen },
  { key: "signed", icon: CheckCircle2 },
  { key: "all", icon: FileText },
]

/** Month names come from the locale; a bare number reads as a day. */
function periodLabel(row: IssuedRow, locale: string): string | null {
  if (!row.periodYear) return null
  if (!row.periodMonth) return String(row.periodYear)
  const d = new Date(Date.UTC(row.periodYear, row.periodMonth - 1, 1))
  return `${d.toLocaleDateString(locale, { month: "short", timeZone: "UTC" })} ${row.periodYear}`
}

export default function SentDocumentsPage() {
  const { t, i18n } = useTranslation()
  const router = useRouter()

  /*
    Two ways of looking, not two screens.

    "Attention" is the working queue — what is unsigned, what was never opened.
    "Files" is the cabinet, for finding a document you already know exists.
    They answer different questions and share nothing but the data, so they sit
    behind one switch rather than in two places in the navigation.
  */
  const [view, setView] = useState<"attention" | "files">("attention")
  const [tab, setTab] = useState<Tab>("awaiting")
  const [search, setSearch] = useState("")
  const [page, setPage] = useState(1)
  const [opening, setOpening] = useState<string | null>(null)

  const { data, isLoading, isFetching } = useQuery<IssuedRegister>({
    queryKey: ["documents-sent", tab, search, page],
    queryFn: () => documentsApi.listIssued({ tab, search: search || undefined, page }),
    // The register moves when somebody signs or opens something, neither of
    // which happens while an admin watches this screen.
    staleTime: 30_000,
  })

  const rows = data?.rows ?? []
  const counts = data?.counts
  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.limit)) : 1

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

  const go = (next: Tab) => {
    setTab(next)
    setPage(1)
  }

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6">
      {/* Header */}
      <div className="mb-6 flex items-start gap-3">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => router.push("/documents")}
          aria-label={t("common.back", "Back")}
          className="mt-0.5 h-9 w-9 shrink-0"
        >
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900 dark:text-slate-50">
            {t("documents.sent.title", "Sent documents")}
          </h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            {t("documents.sent.subtitle", "Everything issued to members, and where it got to.")}
          </p>
        </div>
      </div>

      {/* Which way of looking */}
      <div className="mb-5 inline-flex rounded-lg border border-slate-200 bg-slate-50 p-1 dark:border-slate-700 dark:bg-slate-800/50">
        {([
          ["attention", ListChecks],
          ["files", FolderTree],
        ] as const).map(([key, Icon]) => (
          <button
            key={key}
            onClick={() => setView(key)}
            className={cn(
              "inline-flex items-center gap-2 rounded-md px-3.5 py-1.5 text-sm font-medium transition-colors",
              view === key
                ? "bg-white text-slate-900 shadow-sm dark:bg-slate-900 dark:text-slate-50"
                : "text-slate-500 hover:text-slate-900 dark:hover:text-slate-200",
            )}
          >
            <Icon className="h-4 w-4" />
            {t(`documents.sent.view.${key}`)}
          </button>
        ))}
      </div>

      {view === "files" ? (
        <FolderBrowser />
      ) : (
      <>
      {/* Tabs — each states its count, so a tap is a decision rather than a guess */}
      <div className="mb-4 flex flex-wrap gap-2">
        {TABS.map(({ key, icon: Icon }) => {
          const active = tab === key
          const n = counts?.[key]
          return (
            <button
              key={key}
              onClick={() => go(key)}
              className={cn(
                "inline-flex items-center gap-2 rounded-full border px-3.5 py-1.5 text-sm font-medium transition-colors",
                active
                  ? "border-blue-600 bg-blue-600 text-white shadow-sm"
                  : "border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:text-slate-50",
              )}
            >
              <Icon className="h-4 w-4" />
              {t(`documents.sent.tab.${key}`)}
              {typeof n === "number" && (
                <span
                  className={cn(
                    "rounded-full px-1.5 py-0.5 text-xs tabular-nums",
                    active ? "bg-white/20" : "bg-slate-100 dark:bg-slate-800",
                  )}
                >
                  {n}
                </span>
              )}
            </button>
          )
        })}
      </div>

      {/* Search */}
      <div className="relative mb-4 max-w-sm">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <Input
          value={search}
          onChange={(e) => {
            setSearch(e.target.value)
            setPage(1)
          }}
          placeholder={t("documents.sent.searchPlaceholder", "Search by title")}
          className="pl-9"
        />
      </div>

      {/* Rows */}
      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
        {isLoading ? (
          <div className="flex items-center justify-center gap-2 py-16 text-sm text-slate-500">
            <Loader2 className="h-4 w-4 animate-spin" />
            {t("common.loading", "Loading")}
          </div>
        ) : rows.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-16 text-center">
            <Inbox className="h-8 w-8 text-slate-300 dark:text-slate-600" />
            <p className="text-sm font-medium text-slate-700 dark:text-slate-200">
              {t(`documents.sent.empty.${tab}`)}
            </p>
          </div>
        ) : (
          <ul className="divide-y divide-slate-100 dark:divide-slate-800">
            {rows.map((row) => {
              const period = periodLabel(row, i18n.language)
              return (
                <li
                  key={row.id}
                  className="flex items-center gap-4 px-4 py-3 transition-colors hover:bg-slate-50 dark:hover:bg-slate-800/50"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-slate-900 dark:text-slate-50">
                      {row.title}
                    </p>
                    <p className="mt-0.5 truncate text-xs text-slate-500 dark:text-slate-400">
                      {row.memberName}
                      <span className="mx-1.5 text-slate-300 dark:text-slate-600">·</span>
                      {row.typeLabel}
                      {period && (
                        <>
                          <span className="mx-1.5 text-slate-300 dark:text-slate-600">·</span>
                          {period}
                        </>
                      )}
                    </p>
                  </div>

                  {/* State, said in words rather than a colour alone */}
                  <StateChip row={row} />

                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 shrink-0"
                    disabled={opening === row.id}
                    onClick={() => open.mutate(row.id)}
                    aria-label={t("documents.sent.open", "Open")}
                    title={t("documents.sent.open", "Open")}
                  >
                    {opening === row.id ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Eye className="h-4 w-4" />
                    )}
                  </Button>
                </li>
              )
            })}
          </ul>
        )}
      </div>

      {/* Paging */}
      {data && data.total > data.limit && (
        <div className="mt-4 flex items-center justify-between text-sm text-slate-500">
          <span className="tabular-nums">
            {t("documents.sent.count", { count: data.total })}
          </span>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={page <= 1 || isFetching}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="tabular-nums">
              {page} / {totalPages}
            </span>
            <Button
              variant="outline"
              size="sm"
              disabled={page >= totalPages || isFetching}
              onClick={() => setPage((p) => p + 1)}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
      </>
      )}
    </div>
  )
}

/**
 * What state a document is in.
 *
 * Words, not colour alone: "awaiting signature" and "not opened" are different
 * kinds of waiting, and a viewer who cannot separate two hues would otherwise
 * be reading the same chip twice.
 */
function StateChip({ row }: { row: IssuedRow }) {
  const { t } = useTranslation()

  const [label, tone] =
    row.status === "AWAITING_SIGNATURE"
      ? [t("documents.sent.state.awaiting", "Awaiting signature"), "amber"]
      : row.status === "SIGNED"
        ? [t("documents.sent.state.signed", "Signed"), "green"]
        : row.status === "REVOKED"
          ? [t("documents.sent.state.revoked", "Revoked"), "slate"]
          : row.status === "EXPIRED"
            ? [t("documents.sent.state.expired", "Expired"), "red"]
            : !row.openedAt
              ? [t("documents.sent.state.unopened", "Not opened"), "blue"]
              : [t("documents.sent.state.opened", "Opened"), "slate"]

  const tones: Record<string, string> = {
    amber: "bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-300",
    green: "bg-green-50 text-green-700 dark:bg-green-500/10 dark:text-green-300",
    blue: "bg-blue-50 text-blue-700 dark:bg-blue-500/10 dark:text-blue-300",
    red: "bg-red-50 text-red-700 dark:bg-red-500/10 dark:text-red-300",
    slate: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300",
  }

  return (
    <span
      className={cn(
        "hidden shrink-0 rounded-full px-2.5 py-1 text-xs font-medium sm:inline-block",
        tones[tone],
      )}
    >
      {label}
    </span>
  )
}
