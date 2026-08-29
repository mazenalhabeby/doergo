"use client"

import { useMemo, useState } from "react"
import { useTranslation } from "react-i18next"
import { useQuery } from "@tanstack/react-query"
import { useRouter } from "next/navigation"
import { ShieldCheck, ShieldAlert, ShieldX, ArrowLeft, Inbox } from "lucide-react"
import { documentsApi, type ComplianceRow } from "@/lib/api"
import { cn } from "@/lib/utils"

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
    queryKey: ["credential-compliance"],
    queryFn: () => documentsApi.compliance(),
  })

  const counts = useMemo(() => ({
    valid: rows.filter((r) => r.standing === "VALID").length,
    expiring: rows.filter((r) => r.standing === "EXPIRING").length,
    expired: rows.filter((r) => r.standing === "EXPIRED").length,
    blocked: rows.filter((r) => r.blocksDispatch).length,
  }), [rows])

  const visible = useMemo(() => rows.filter((r) =>
    filter === "all" ? true : filter === "blocked" ? r.blocksDispatch : r.standing === "EXPIRING",
  ), [rows, filter])

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-6 sm:px-6 lg:px-8">
      <button
        onClick={() => router.push("/documents")}
        className="mb-4 inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-800 dark:hover:text-slate-200"
      >
        <ArrowLeft className="h-4 w-4" />
        {t("documents.issue.title")}
      </button>

      <header className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900 dark:text-slate-100">
          {t("documents.compliance.title")}
        </h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          {t("documents.compliance.subtitle")}
        </p>
      </header>

      {/* Tiles double as filters — a count you cannot click is a count you have
          to go and find yourself. */}
      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Tile label={t("documents.standing.valid")} value={counts.valid}
          active={false} onClick={() => setFilter("all")} />
        <Tile label={t("documents.compliance.expiringSoon")} value={counts.expiring} tone="warn"
          active={filter === "expiring"} onClick={() => setFilter(filter === "expiring" ? "all" : "expiring")} />
        <Tile label={t("documents.standing.expired")} value={counts.expired} tone="bad"
          active={false} onClick={() => setFilter("all")} />
        <Tile label={t("documents.compliance.blocked")} value={counts.blocked} tone="bad"
          active={filter === "blocked"} onClick={() => setFilter(filter === "blocked" ? "all" : "blocked")} />
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {[0, 1, 2].map((i) => <div key={i} className="h-14 animate-pulse rounded-lg bg-slate-100 dark:bg-slate-800" />)}
        </div>
      ) : visible.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 py-14 text-center dark:border-slate-700">
          <Inbox className="mx-auto h-8 w-8 text-slate-300 dark:text-slate-600" />
          <p className="mt-3 text-sm font-medium text-slate-700 dark:text-slate-300">
            {rows.length === 0 ? t("documents.compliance.empty") : t("documents.compliance.noneInFilter")}
          </p>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            {rows.length === 0 ? t("documents.compliance.emptyHint") : ""}
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-800">
          <table className="w-full min-w-[620px] text-sm">
            <thead>
              <tr className="bg-slate-50 dark:bg-slate-900/60">
                {["member", "credential", "expires", "effect"].map((k) => (
                  <th key={k} className="px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                    {t(`documents.compliance.columns.${k}`)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {visible.map((r) => (
                <tr key={r.id} className={cn(r.blocksDispatch && "bg-red-50 dark:bg-red-950/30")}>
                  <td className="px-3 py-2 font-medium text-slate-900 dark:text-slate-100">
                    {r.member.firstName} {r.member.lastName}
                  </td>
                  <td className="px-3 py-2 text-slate-600 dark:text-slate-400">{r.credential}</td>
                  <td className="px-3 py-2 tabular-nums text-slate-600 dark:text-slate-400">
                    {r.expiresOn ? new Date(r.expiresOn).toLocaleDateString() : "—"}
                  </td>
                  <td className="px-3 py-2">
                    <Effect row={r} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
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
      <span className="inline-flex items-center gap-1.5 rounded-full bg-red-100 px-2.5 py-1 text-[11px] font-semibold text-red-700 dark:bg-red-950 dark:text-red-400">
        <ShieldX className="h-3.5 w-3.5" />
        {t("documents.compliance.removedFromDispatch")}
      </span>
    )
  }
  if (row.standing === "EXPIRED") {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-semibold text-slate-600 dark:bg-slate-800 dark:text-slate-400">
        <ShieldX className="h-3.5 w-3.5" />
        {t("documents.compliance.expiredNoGate")}
      </span>
    )
  }
  if (row.standing === "EXPIRING") {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-100 px-2.5 py-1 text-[11px] font-semibold text-amber-700 dark:bg-amber-950 dark:text-amber-400">
        <ShieldAlert className="h-3.5 w-3.5" />
        {t("documents.compliance.reminderSent", { count: row.daysLeft ?? 0 })}
      </span>
    )
  }
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-green-100 px-2.5 py-1 text-[11px] font-semibold text-green-700 dark:bg-green-950 dark:text-green-400">
      <ShieldCheck className="h-3.5 w-3.5" />
      {t("documents.compliance.noAction")}
    </span>
  )
}

function Tile({
  label, value, tone, active, onClick,
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
        "rounded-xl border p-4 text-left transition-colors",
        tone === "bad" && value > 0
          ? "border-red-200 bg-red-50 dark:border-red-900 dark:bg-red-950/40"
          : tone === "warn" && value > 0
            ? "border-amber-200 bg-amber-50 dark:border-amber-900 dark:bg-amber-950/40"
            : "border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900",
        active && "ring-2 ring-blue-500",
      )}
    >
      <div className={cn(
        "font-mono text-[10px] font-bold uppercase tracking-wider",
        tone === "bad" && value > 0 ? "text-red-700 dark:text-red-400"
          : tone === "warn" && value > 0 ? "text-amber-700 dark:text-amber-400"
            : "text-slate-500",
      )}>
        {label}
      </div>
      <div className={cn(
        "mt-1 text-3xl font-semibold tabular-nums tracking-tight",
        tone === "bad" && value > 0 ? "text-red-700 dark:text-red-400"
          : tone === "warn" && value > 0 ? "text-amber-700 dark:text-amber-400"
            : "text-slate-900 dark:text-slate-100",
      )}>
        {value}
      </div>
    </button>
  )
}
