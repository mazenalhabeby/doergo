"use client"

import { personName } from "@hbcfield/shared/client"
import { useMemo, useState } from "react"
import { useTranslation } from "react-i18next"
import { useQuery } from "@tanstack/react-query"
import { useRouter } from "next/navigation"
import { ShieldCheck, ShieldAlert, ShieldX, ArrowLeft, Inbox } from "lucide-react"
import { documentsApi, type ComplianceRow } from "@/lib/api"
import { cn } from "@/lib/utils"
import { keys } from "@/lib/query-keys"
import { dateLocale } from "@/lib/format-date"
import { UserAvatar } from "@/components/common/user-avatar"
import { PAGE_SHELL } from "@/components/ui/page-width"
import { Chip, PageHeader, Panel } from "@/components/page/page-kit"

/*
  The compliance board.

  Not a list of certificates — a list of CONSEQUENCES. The right-hand column
  says what has actually changed for the dispatcher, because "expired" on its
  own sends somebody hunting through settings to work out whether it matters.

  The distinction it draws: a lapsed certificate that gates no task type is a
  reminder; one that gates a task type has already removed somebody from the
  assignable pool. Those need different reactions and should not look alike.

  Nothing here opens a document. Validity and dates only — reading the
  certificate itself is a separate permission, and a dispatcher planning next
  week does not need it.
*/

type Filter = "all" | "blocked" | "expiring"

export default function CompliancePage() {
  const { t } = useTranslation()
  const router = useRouter()
  const [filter, setFilter] = useState<Filter>("all")

  const { data: rows = [], isLoading } = useQuery<ComplianceRow[]>({
    queryKey: keys.documents.compliance(),
    queryFn: () => documentsApi.compliance(),
  })

  const counts = useMemo(
    () => ({
      valid: rows.filter((r) => r.standing === "VALID").length,
      expiring: rows.filter((r) => r.standing === "EXPIRING").length,
      expired: rows.filter((r) => r.standing === "EXPIRED").length,
      blocked: rows.filter((r) => r.blocksDispatch).length,
    }),
    [rows],
  )

  const visible = useMemo(
    () =>
      rows.filter((r) =>
        filter === "all" ? true : filter === "blocked" ? r.blocksDispatch : r.standing === "EXPIRING",
      ),
    [rows, filter],
  )

  return (
    <div className={PAGE_SHELL}>
      <button
        onClick={() => router.push("/documents")}
        className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        {t("documents.issue.title")}
      </button>

      <PageHeader title={t("documents.compliance.title")} subtitle={t("documents.compliance.subtitle")} />

      {/* Tiles double as filters — a count you cannot click is a count you have
          to go and find yourself. */}
      <div className="mb-3.5 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Tile
          label={t("documents.standing.valid")}
          value={counts.valid}
          active={false}
          onClick={() => setFilter("all")}
        />
        <Tile
          label={t("documents.compliance.expiringSoon")}
          value={counts.expiring}
          tone="warn"
          active={filter === "expiring"}
          onClick={() => setFilter(filter === "expiring" ? "all" : "expiring")}
        />
        <Tile
          label={t("documents.standing.expired")}
          value={counts.expired}
          tone="bad"
          active={false}
          onClick={() => setFilter("all")}
        />
        <Tile
          label={t("documents.compliance.blocked")}
          value={counts.blocked}
          tone="bad"
          active={filter === "blocked"}
          onClick={() => setFilter(filter === "blocked" ? "all" : "blocked")}
        />
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-14 animate-pulse rounded-[14px] bg-muted" />
          ))}
        </div>
      ) : visible.length === 0 ? (
        <Panel className="py-14 text-center">
          <Inbox className="mx-auto h-8 w-8 text-muted-foreground/70" />
          <p className="mt-3 text-sm font-semibold text-foreground">
            {rows.length === 0 ? t("documents.compliance.empty") : t("documents.compliance.noneInFilter")}
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            {rows.length === 0 ? t("documents.compliance.emptyHint") : ""}
          </p>
        </Panel>
      ) : (
        <Panel className="overflow-x-auto p-1.5">
          <table className="w-full min-w-[620px] text-sm">
            <thead>
              <tr>
                {["member", "credential", "expires", "effect"].map((k) => (
                  <th key={k} className="h-10 px-3.5 text-left text-xs font-medium text-muted-foreground">
                    {t(`documents.compliance.columns.${k}`)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border border-t border-border">
              {visible.map((r) => (
                <tr key={r.id}>
                  <td className="px-3.5 py-3">
                    <span className="flex items-center gap-3 font-semibold text-foreground">
                      <UserAvatar {...r.member} seed={r.member.id} size="md" soft />
                      {personName(r.member)}
                    </span>
                  </td>
                  <td className="px-3.5 py-3 font-semibold text-foreground">{r.credential}</td>
                  <td className="px-3.5 py-3 tabular-nums text-muted-foreground">
                    {r.expiresOn ? new Date(r.expiresOn).toLocaleDateString(dateLocale()) : "—"}
                  </td>
                  <td className="px-3.5 py-3">
                    <Effect row={r} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Panel>
      )}
    </div>
  )
}

/**
 * The consequence, written as one.
 *
 * "Removed from electrical dispatch" tells a dispatcher what changed.
 * "Expired" tells them a date passed and leaves the rest to them.
 */
function Effect({ row }: { row: ComplianceRow }) {
  const { t } = useTranslation()

  if (row.blocksDispatch) {
    return (
      <Chip tone="crit">
        <ShieldX className="h-3.5 w-3.5" />
        {t("documents.compliance.removedFromDispatch")}
      </Chip>
    )
  }
  if (row.standing === "EXPIRED") {
    return (
      <Chip>
        <ShieldX className="h-3.5 w-3.5" />
        {t("documents.compliance.expiredNoGate")}
      </Chip>
    )
  }
  if (row.standing === "EXPIRING") {
    return (
      <Chip tone="warn">
        <ShieldAlert className="h-3.5 w-3.5" />
        {t("documents.compliance.reminderSent", { count: row.daysLeft ?? 0 })}
      </Chip>
    )
  }
  return (
    <Chip tone="accent">
      <ShieldCheck className="h-3.5 w-3.5" />
      {t("documents.compliance.noAction")}
    </Chip>
  )
}

/** A count that is also a filter — the board's `dctile`: the number in red or amber only when it matters. */
function Tile({
  label,
  value,
  tone,
  active,
  onClick,
}: {
  label: string
  value: number
  tone?: "warn" | "bad"
  active: boolean
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "flex flex-col gap-1 rounded-[22px] border border-border bg-card px-[18px] py-4 text-left shadow-shell",
        "transition-colors hover:bg-accent",
        active && "ring-2 ring-inset ring-foreground",
      )}
    >
      <span className="text-[12.5px] text-muted-foreground">{label}</span>
      <span
        className={cn(
          "text-[28px] font-semibold leading-none tabular-nums tracking-[-0.04em]",
          tone === "bad" && value > 0
            ? "text-shell-crit"
            : tone === "warn" && value > 0
              ? "text-shell-warn"
              : "text-foreground",
        )}
      >
        {value}
      </span>
    </button>
  )
}
