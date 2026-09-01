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
import { UserAvatar } from "@/components/user-avatar"
import { notify } from "@/lib/toast"
import { cn } from "@/lib/utils"
import { FolderBrowser } from "./_components/folder-browser"

/*
  What the organization has sent.

  Every other document list answers "what does THIS PERSON have" — the member's
  own file, or one record opened from the team page. So an admin could inspect
  people one at a time and never see the shape of the whole thing: what went
  out, who never opened it, what is still unsigned.

  Two ways of looking, not two screens. ATTENTION is the working queue and
  opens on what is unsigned, because a register that opens on five hundred rows
  newest-first is one nobody opens twice. FILES is the cabinet, for finding a
  document you already know exists. They answer different questions and share
  nothing but the data, so they sit behind one switch.

  No row carries a link. Opening mints one and records the open, which is what
  makes the delivery evidence mean anything.
*/

type Tab = "awaiting" | "unopened" | "signed" | "all"

const TABS: { key: Tab; icon: typeof PenLine }[] = [
  { key: "awaiting", icon: PenLine },
  { key: "unopened", icon: MailOpen },
  { key: "signed", icon: CheckCircle2 },
  { key: "all", icon: FileText },
]

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

function periodLabel(row: IssuedRow, locale: string): string | null {
  if (!row.periodYear) return null
  if (!row.periodMonth) return String(row.periodYear)
  const d = new Date(Date.UTC(row.periodYear, row.periodMonth - 1, 1))
  return `${d.toLocaleDateString(locale, { month: "short", timeZone: "UTC" })} ${row.periodYear}`
}

export default function SentDocumentsPage() {
  const { t, i18n } = useTranslation()
  const router = useRouter()

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

  return (
    <div className="min-h-full bg-background">
      <div className="mx-auto max-w-[1200px] px-6 py-6">
        {/* Header */}
        <div className="mb-8 flex items-start gap-3">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => router.push("/documents")}
            aria-label={t("common.back", "Back")}
            className="mt-0.5 h-9 w-9 shrink-0 text-muted-foreground"
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div className="min-w-0 flex-1">
            <h1 className="text-2xl font-bold tracking-tight text-foreground">
              {t("documents.sent.title", "Sent documents")}
              {counts != null && (
                <span className="ml-2 text-lg font-normal text-muted-foreground">
                  ({counts.all})
                </span>
              )}
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {t("documents.sent.subtitle", "Everything issued to members, and where it got to.")}
            </p>
          </div>
        </div>

        {/* Which way of looking */}
        <div className="mb-6 inline-flex rounded-lg border border-border/80 bg-card p-0.5">
          {([
            ["attention", ListChecks],
            ["files", FolderTree],
          ] as const).map(([key, Icon]) => (
            <button
              key={key}
              onClick={() => setView(key)}
              className={cn(
                "inline-flex items-center gap-2 rounded-md px-4 py-1.5 text-sm font-medium transition-colors",
                view === key
                  ? "bg-accent text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground",
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
            {/* Tabs, each stating its count so a click is a decision not a guess */}
            <div className="mb-4 flex flex-wrap items-center gap-2">
              {TABS.map(({ key, icon: Icon }) => {
                const active = tab === key
                const n = counts?.[key]
                return (
                  <button
                    key={key}
                    onClick={() => {
                      setTab(key)
                      setPage(1)
                    }}
                    className={cn(
                      "inline-flex items-center gap-2 rounded-lg border px-3.5 py-2 text-sm font-medium transition-colors",
                      active
                        ? "border-primary/30 bg-primary/10 text-primary"
                        : "border-border/80 bg-card text-muted-foreground hover:text-foreground",
                    )}
                  >
                    <Icon className="h-4 w-4" />
                    {t(`documents.sent.tab.${key}`)}
                    {typeof n === "number" && (
                      <span
                        className={cn(
                          "rounded-full px-1.5 py-0.5 text-xs tabular-nums",
                          active ? "bg-primary/15" : "bg-muted",
                        )}
                      >
                        {n}
                      </span>
                    )}
                  </button>
                )
              })}

              <div className="relative ml-auto">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={search}
                  onChange={(e) => {
                    setSearch(e.target.value)
                    setPage(1)
                  }}
                  placeholder={t("documents.sent.searchPlaceholder", "Search by title")}
                  className="h-9 w-56 rounded-lg border-border/80 bg-card pl-9 text-sm"
                />
              </div>
            </div>

            <div className="overflow-hidden rounded-xl border border-border/80 bg-card">
              {isLoading ? (
                <div>
                  {[0, 1, 2, 3].map((i) => (
                    <div key={i} className="flex items-center gap-4 border-b border-border/20 px-5 py-3.5 last:border-0">
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
                  <p className="text-sm text-muted-foreground">{t(`documents.sent.empty.${tab}`)}</p>
                </div>
              ) : (
                <div>
                  {rows.map((row, i) => {
                    const period = periodLabel(row, i18n.language)
                    const [first = "", ...rest] = row.memberName.split(" ")
                    return (
                      <div
                        key={row.id}
                        style={{ animation: `fadeSlideIn 0.25s ease-out ${i * 40}ms both` }}
                        className="group flex items-center gap-4 border-b border-border/50 px-5 py-3.5 transition-colors last:border-0 hover:bg-accent/30"
                      >
                        <UserAvatar
                          firstName={first}
                          lastName={rest.join(" ")}
                          seed={row.memberId}
                          size="md"
                        />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium text-foreground">{row.title}</p>
                          <p className="truncate text-sm text-muted-foreground">
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
                        </div>

                        <StateChip row={row} />

                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 shrink-0 opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100"
                          disabled={opening === row.id}
                          onClick={() => open.mutate(row.id)}
                          aria-label={t("documents.sent.open", "Open")}
                        >
                          {opening === row.id ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <Eye className="h-4 w-4" />
                          )}
                        </Button>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>

            {data && data.total > data.limit && (
              <div className="mt-4 flex items-center justify-between text-sm text-muted-foreground">
                <span className="tabular-nums">{t("documents.sent.count", { count: data.total })}</span>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline" size="sm"
                    disabled={page <= 1 || isFetching}
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <span className="tabular-nums">{page} / {totalPages}</span>
                  <Button
                    variant="outline" size="sm"
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
    </div>
  )
}

/**
 * What state a document is in.
 *
 * Words, not colour alone: "awaiting signature" and "not opened" are different
 * kinds of waiting, and a viewer who cannot separate two hues would otherwise
 * read the same chip twice.
 */
function StateChip({ row }: { row: IssuedRow }) {
  const { t } = useTranslation()

  const [label, tone] =
    row.status === "AWAITING_SIGNATURE"
      ? [t("documents.sent.state.awaiting", "Awaiting signature"), "warn"]
      : row.status === "SIGNED"
        ? [t("documents.sent.state.signed", "Signed"), "ok"]
        : row.status === "REVOKED"
          ? [t("documents.sent.state.revoked", "Revoked"), "mute"]
          : row.status === "EXPIRED"
            ? [t("documents.sent.state.expired", "Expired"), "bad"]
            : !row.openedAt
              ? [t("documents.sent.state.unopened", "Not opened"), "info"]
              : [t("documents.sent.state.opened", "Opened"), "mute"]

  const tones: Record<string, string> = {
    warn: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
    ok: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
    info: "bg-primary/10 text-primary",
    bad: "bg-destructive/10 text-destructive",
    mute: "bg-muted text-muted-foreground",
  }

  return (
    <span className={cn("hidden shrink-0 rounded-full px-2.5 py-1 text-xs font-medium sm:inline-block", tones[tone])}>
      {label}
    </span>
  )
}
