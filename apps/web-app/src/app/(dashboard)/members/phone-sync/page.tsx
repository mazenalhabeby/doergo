"use client"

import { formatFileSize, personName } from "@hbcfield/shared/client"
import { keys } from "@/lib/query-keys"
import { useMemo, useState } from "react"
import Link from "next/link"
import { useQuery } from "@tanstack/react-query"
import { useTranslation } from "react-i18next"
import { ArrowLeft, RefreshCw, Search, Smartphone } from "lucide-react"
import type { SyncHealthState, SyncMemberHealth } from "@hbcfield/shared/client"
import { organizationsApi, syncApi, type OrgMember } from "@/lib/api"
import { useAuth } from "@/contexts/auth-context"
import { dateLocale } from "@/lib/format-date"
import { cn } from "@/lib/utils"
import { PAGE_SHELL } from "@/components/ui/page-width"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { UserAvatar } from "@/components/user-avatar"
import { GenericContentSkeleton } from "@/components/skeletons/primitives"
import { PHONE_SYNC_STATES, countByState, formatAge, matchesSearch } from "@/lib/phone-sync"
import { TONE, StatePill, FilterChip, DetailPanel } from "./detail-panel"
import { PageNotice } from "@/components/ui/empty-note"

/*
  Phone sync — whose phone is still holding work done without signal, and why.

  Read-only, and deliberately about COUNTS: the report a phone sends is how
  many changes wait, how old the oldest is, and the reason codes. What the work
  is never leaves the phone this way, so nothing here can leak a customer's
  address or a member's hours to somebody who manages accounts.
*/
export default function PhoneSyncPage() {
  const { t } = useTranslation()
  const { user } = useAuth()
  const locale = dateLocale()
  const canView = !!user?.canManageUsers

  const [filter, setFilter] = useState<SyncHealthState | "all">("all")
  const [search, setSearch] = useState("")
  const [selectedId, setSelectedId] = useState<string | null>(null)

  const health = useQuery({
    queryKey: keys.people.phoneSyncHealth(),
    queryFn: syncApi.memberHealth,
    enabled: canView,
    // Phones report every ten minutes; asking more often shows nothing new.
    refetchInterval: 60_000,
  })
  const rows = useMemo(() => health.data ?? [], [health.data])
  const ids = useMemo(() => rows.map((r) => r.userId), [rows])

  // Names for the ids in the report. `includeIds` keeps them even past the page size.
  const people = useQuery({
    queryKey: keys.members.list({ lite: true, limit: 200, includeIds: ids }),
    queryFn: () => organizationsApi.getMembers({ lite: true, limit: 200, includeIds: ids }),
    enabled: canView && ids.length > 0,
    staleTime: 5 * 60 * 1000,
  })
  const personById = useMemo(() => {
    const map = new Map<string, OrgMember>()
    for (const m of people.data?.data ?? []) map.set(m.id, m)
    return map
  }, [people.data])

  const counts = useMemo(() => countByState(rows), [rows])
  const visible = useMemo(
    () =>
      rows.filter((r) => (filter === "all" || r.state === filter) && matchesSearch(personById.get(r.userId), search)),
    [rows, filter, search, personById],
  )
  const selected = rows.find((r) => r.userId === selectedId) ?? visible[0] ?? null
  const now = Date.now()

  if (!canView) {
    return <PageNotice>{t("manage.noAccess")}</PageNotice>
  }
  if (health.isLoading) return <GenericContentSkeleton />

  const nameOf = (id: string) => {
    const p = personById.get(id)
    return p ? personName(p) : t("members.phoneSync.unknownMember")
  }
  const when = (ms: number | null) =>
    ms === null ? "—" : new Date(ms).toLocaleString(locale, { weekday: "short", hour: "2-digit", minute: "2-digit" })

  return (
    <div className="min-h-full bg-background">
      <div className={PAGE_SHELL}>
        <Link
          href="/members"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" /> {t("members.team")}
        </Link>

        <div className="mt-2 mb-6 flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-foreground">{t("members.phoneSync.title")}</h1>
            <p className="mt-1 max-w-2xl text-sm text-muted-foreground">{t("members.phoneSync.subtitle")}</p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => health.refetch()}
            disabled={health.isFetching}
            className="shrink-0"
          >
            <RefreshCw className={cn("mr-2 h-4 w-4", health.isFetching && "animate-spin")} />
            {t("members.phoneSync.refresh")}
          </Button>
        </div>

        {health.isError ? (
          <div className="rounded-xl border border-border/80 bg-card px-6 py-12 text-center">
            <p className="text-sm text-muted-foreground">{t("members.phoneSync.loadError")}</p>
            <Button variant="outline" size="sm" className="mt-4" onClick={() => health.refetch()}>
              {t("common.retry")}
            </Button>
          </div>
        ) : rows.length === 0 ? (
          <div className="rounded-xl border border-border/80 bg-card px-6 py-16 text-center">
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-muted">
              <Smartphone className="h-6 w-6 text-muted-foreground" />
            </div>
            <h3 className="font-semibold text-foreground">{t("members.phoneSync.empty.title")}</h3>
            <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
              {user?.offlineMode ? t("members.phoneSync.empty.bodyOn") : t("members.phoneSync.empty.bodyOff")}
            </p>
          </div>
        ) : (
          <>
            {/* Summary — each chip is also the filter. */}
            <div className="mb-4 flex flex-wrap gap-2" role="group" aria-label={t("members.phoneSync.filterLabel")}>
              <FilterChip
                active={filter === "all"}
                onClick={() => setFilter("all")}
                count={rows.length}
                label={t("members.phoneSync.allPhones")}
              />
              {PHONE_SYNC_STATES.filter((s) => counts[s] > 0).map((s) => (
                <FilterChip
                  key={s}
                  active={filter === s}
                  onClick={() => setFilter(s)}
                  count={counts[s]}
                  label={t(`members.phoneSync.states.${s}`)}
                  dot={TONE[s].dot}
                />
              ))}
            </div>

            <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_340px]">
              <div className="min-w-0">
                <div className="mb-3 flex flex-wrap items-center gap-3">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      placeholder={t("members.searchPlaceholder")}
                      className="h-9 w-56 rounded-lg border-border/80 bg-card pl-9 text-sm"
                    />
                  </div>
                  <span className="text-xs text-muted-foreground">{t("members.phoneSync.cadence")}</span>
                </div>

                <div className="overflow-x-auto rounded-xl border border-border/80 bg-card">
                  <table className="w-full min-w-[760px] text-sm">
                    <thead>
                      <tr
                        className={
                          "border-b border-border/60 bg-muted/40 text-left text-xs font-medium " +
                          "uppercase tracking-wide text-muted-foreground"
                        }
                      >
                        <th className="px-4 py-2.5">{t("members.phoneSync.columns.member")}</th>
                        <th className="px-4 py-2.5">{t("members.phoneSync.columns.state")}</th>
                        <th className="px-4 py-2.5 text-right">{t("members.phoneSync.columns.waiting")}</th>
                        <th className="px-4 py-2.5">{t("members.phoneSync.columns.oldest")}</th>
                        <th className="px-4 py-2.5 text-right">{t("members.phoneSync.columns.files")}</th>
                        <th className="px-4 py-2.5">{t("members.phoneSync.columns.lastSent")}</th>
                        <th className="px-4 py-2.5">{t("members.phoneSync.columns.app")}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border/60 tabular-nums">
                      {visible.map((r) => {
                        const p = personById.get(r.userId)
                        const isSelected = selected?.userId === r.userId
                        return (
                          <tr
                            key={r.userId}
                            onClick={() => setSelectedId(r.userId)}
                            onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && setSelectedId(r.userId)}
                            tabIndex={0}
                            aria-selected={isSelected}
                            className={cn(
                              "cursor-pointer outline-none transition-colors hover:bg-accent/40 focus-visible:bg-accent/40",
                              isSelected && "bg-primary/5",
                            )}
                          >
                            <td className="px-4 py-3">
                              <div className="flex items-center gap-3">
                                <UserAvatar
                                  firstName={p?.firstName ?? "?"}
                                  lastName={p?.lastName ?? ""}
                                  avatarUrl={p?.avatarUrl ?? null}
                                  seed={r.userId}
                                  size="md"
                                />
                                <div className="min-w-0">
                                  <div className="truncate font-medium text-foreground">{nameOf(r.userId)}</div>
                                  {p?.position && (
                                    <div className="truncate text-xs text-muted-foreground">{p.position}</div>
                                  )}
                                </div>
                              </div>
                            </td>
                            <td className="px-4 py-3">
                              <StatePill state={r.state} />
                            </td>
                            <td className="px-4 py-3 text-right">{r.state === "silent" ? "—" : r.waiting}</td>
                            <td className="px-4 py-3 text-muted-foreground">
                              {r.oldestWaitingAt && r.waiting > 0
                                ? `${when(r.oldestWaitingAt)} · ${formatAge(r.oldestWaitingAt, now, locale)}`
                                : "—"}
                            </td>
                            <td className="px-4 py-3 text-right text-muted-foreground">
                              {r.filesWaiting > 0
                                ? `${r.filesWaiting} · ${formatFileSize(r.bytesWaiting, locale)}`
                                : "—"}
                            </td>
                            <td className="px-4 py-3 text-muted-foreground">{when(r.lastSuccessAt)}</td>
                            <td className="px-4 py-3 font-mono text-xs text-muted-foreground">{r.appVersion}</td>
                          </tr>
                        )
                      })}
                      {visible.length === 0 && (
                        <tr>
                          <td colSpan={7} className="px-4 py-10 text-center text-sm text-muted-foreground">
                            {t("members.phoneSync.noMatch")}
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
                <p className="mt-3 text-xs text-muted-foreground">{t("members.phoneSync.footnote")}</p>
              </div>

              {selected && (
                <DetailPanel row={selected} name={nameOf(selected.userId)} now={now} locale={locale} when={when} />
              )}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
