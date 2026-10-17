"use client"

import { formatFileSize } from "@hbcfield/shared/client"
import { useTranslation } from "react-i18next"
import type { SyncHealthState, SyncMemberHealth } from "@hbcfield/shared/client"
import { cn } from "@/lib/utils"
import { formatAge, reasonsOf } from "@/lib/phone-sync"

export const TONE: Record<SyncHealthState, { pill: string; dot: string }> = {
  stuck: { pill: "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-400", dot: "bg-red-500" },
  needs_member: { pill: "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-400", dot: "bg-amber-500" },
  sending: { pill: "bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300", dot: "bg-blue-500" },
  silent: { pill: "bg-muted text-muted-foreground", dot: "bg-muted-foreground/60" },
  up_to_date: { pill: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400", dot: "bg-emerald-500" },
}

export function StatePill({ state }: { state: SyncHealthState }) {
  const { t } = useTranslation()
  return (
    <span className={cn("inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium", TONE[state].pill)}>
      <span className={cn("h-1.5 w-1.5 rounded-full", TONE[state].dot)} aria-hidden />
      {t(`members.phoneSync.states.${state}`)}
    </span>
  )
}

export function FilterChip({ active, onClick, count, label, dot }: { active: boolean; onClick: () => void; count: number; label: string; dot?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm transition-colors",
        active ? "border-primary bg-primary/5 text-primary" : "border-border/80 bg-card text-muted-foreground hover:text-foreground",
      )}
    >
      {dot && <span className={cn("h-2 w-2 rounded-full", dot)} aria-hidden />}
      <span className={cn("font-semibold tabular-nums", active ? "text-primary" : "text-foreground")}>{count}</span>
      {label}
    </button>
  )
}

export function DetailPanel({
  row,
  name,
  now,
  locale,
  when,
}: {
  row: SyncMemberHealth
  name: string
  now: number
  locale: string
  when: (ms: number | null) => string
}) {
  const { t } = useTranslation()
  const reasons = reasonsOf(row.codes)
  const parts = [
    { key: "pending", count: (row.byState.pending ?? 0) + (row.byState.awaiting_auth ?? 0), tone: "bg-blue-500" },
    { key: "inflight", count: row.byState.inflight ?? 0, tone: "bg-emerald-500" },
    { key: "retry", count: row.byState.retry ?? 0, tone: "bg-amber-500" },
    { key: "attention", count: row.attention, tone: "bg-red-500" },
  ].filter((p) => p.count > 0)
  const total = parts.reduce((n, p) => n + p.count, 0)

  const headline =
    row.state === "stuck" && row.oldestWaitingAt
      ? t("members.phoneSync.detail.stuckFor", { count: row.waiting, age: formatAge(row.oldestWaitingAt, now, locale) })
      : t(`members.phoneSync.states.${row.state}`)

  return (
    <section aria-label={name} className="rounded-xl border border-border/80 bg-card p-5 xl:sticky xl:top-6">
      <h2 className="text-base font-semibold text-foreground">{name}</h2>
      <p className="mt-0.5 text-xs text-muted-foreground">
        {t("members.phoneSync.detail.reported", { age: formatAge(row.receivedAt, now, locale), version: row.appVersion })}
      </p>
      <div className="mt-3">
        <span className={cn("inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium", TONE[row.state].pill)}>
          <span className={cn("h-1.5 w-1.5 rounded-full", TONE[row.state].dot)} aria-hidden />
          {headline}
        </span>
      </div>

      {total > 0 && (
        <>
          <h3 className="mt-5 mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{t("members.phoneSync.detail.whatWaits")}</h3>
          <div className="flex h-2 overflow-hidden rounded bg-muted" role="img" aria-label={parts.map((p) => `${p.count} ${t(`members.phoneSync.parts.${p.key}`)}`).join(", ")}>
            {parts.map((p) => (
              <span key={p.key} className={p.tone} style={{ width: `${(p.count / total) * 100}%` }} />
            ))}
          </div>
          <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
            {parts.map((p) => (
              <span key={p.key} className="inline-flex items-center gap-1.5">
                <span className={cn("h-2 w-2 rounded-full", p.tone)} aria-hidden />
                {p.count} {t(`members.phoneSync.parts.${p.key}`)}
              </span>
            ))}
          </div>
        </>
      )}

      <dl className="mt-4 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm tabular-nums">
        <dt className="text-muted-foreground">{t("members.phoneSync.columns.files")}</dt>
        <dd className="text-right">{row.filesWaiting > 0 ? `${row.filesWaiting} · ${formatFileSize(row.bytesWaiting, locale)}` : "—"}</dd>
        <dt className="text-muted-foreground">{t("members.phoneSync.detail.oldest")}</dt>
        <dd className="text-right">{row.waiting > 0 ? when(row.oldestWaitingAt) : "—"}</dd>
        <dt className="text-muted-foreground">{t("members.phoneSync.detail.lastSent")}</dt>
        <dd className="text-right">{when(row.lastSuccessAt)}</dd>
      </dl>

      {reasons.length > 0 && (
        <>
          <h3 className="mt-5 mb-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{t("members.phoneSync.detail.why")}</h3>
          <ul className="divide-y divide-border/60">
            {reasons.map((r) => (
              <li key={r.code} className="flex items-start justify-between gap-3 py-2 text-sm">
                <span className="text-foreground">{t(`members.phoneSync.reasons.${r.key}`, { code: r.code })}</span>
                <span className="font-semibold tabular-nums">{r.count}</span>
              </li>
            ))}
          </ul>
        </>
      )}

      <p className="mt-4 rounded-lg bg-muted/60 px-3 py-2.5 text-sm text-muted-foreground">
        <span className="font-medium text-foreground">{t("members.phoneSync.detail.helpsLabel")} </span>
        {t(`members.phoneSync.advice.${row.state}`, { name: name.split(" ")[0] })}
      </p>
    </section>
  )
}
