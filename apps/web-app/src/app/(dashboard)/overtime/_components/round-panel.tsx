"use client"

import { useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useTranslation } from "react-i18next"
import { Loader2, MousePointerClick, X } from "lucide-react"
import { OVERTIME_ROUND_STATES, personName } from "@hbcfield/shared/client"
import { overtimeApi, type OvertimeRoundDetail } from "@/lib/api"
import { keys } from "@/lib/query-keys"
import { notify } from "@/lib/toast"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { UserAvatar } from "@/components/user-avatar"
import { clock, methodWords, mins, roundOf, STATE_PILL } from "../_lib/round-words"

type Step = { at: string; text: string; tone?: "end" | "warn" | "bad" }

/**
 * One round, start to finish: the shift it sat on, what was agreed, what it
 * counted, the steps in order on the workspace's clock, and the signature when
 * it was signed on the phone. "Take this overtime off" is the only action — it
 * removes the round as if it never was (the shift's end moves back).
 */
export function RoundPanel({ id, now, onClose }: { id: string | null; now: Date; onClose: () => void }) {
  const { t, i18n } = useTranslation()
  const qc = useQueryClient()
  const [confirming, setConfirming] = useState(false)

  const { data: r, isLoading } = useQuery({
    queryKey: keys.overtime.round(id ?? ""),
    queryFn: () => overtimeApi.getRound(id!),
    enabled: !!id,
  })

  const remove = useMutation({
    mutationFn: (rid: string) => overtimeApi.remove(rid),
    onSuccess: () => {
      notify.success(t("overtime.removed"))
      setConfirming(false)
      qc.invalidateQueries({ queryKey: keys.overtime.history() })
      qc.invalidateQueries({ queryKey: keys.overtime.summary() })
      qc.invalidateQueries({ queryKey: keys.invoices.gather() })
      onClose()
    },
    onError: (e: Error) => notify.error(e.message),
  })

  if (!id) {
    return (
      <section className="flex flex-col items-center gap-2 rounded-2xl border border-dashed border-border px-4 py-10 text-center">
        <MousePointerClick className="size-6 text-muted-foreground" />
        <p className="text-sm text-muted-foreground">{t("overtimePage.panel.pick")}</p>
      </section>
    )
  }
  if (isLoading || !r) {
    return <section className="space-y-3 rounded-2xl border border-border bg-card p-4">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-8 w-full" />)}</section>
  }

  const tz = r.location?.timezone
  const at = (v?: string | null) => clock(v, tz, i18n.language)
  const { state, worked, agreed, overBy } = roundOf(r, now)
  const shiftTotal = r.rounds.reduce((n, x) => n + x.worked, 0)
  const steps = timeline(t, r, state, overBy)
  const name = personName(r.technician)
  const [first, ...rest] = name.split(" ")

  return (
    <section className="flex flex-col gap-4 rounded-2xl border border-border bg-card p-4">
      <div className="flex items-start gap-3">
        <UserAvatar firstName={first} lastName={rest.join(" ")} avatarUrl={r.technician?.avatarUrl} seed={r.technicianId} size="md" />
        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold text-foreground">
            {name}
            {(r.cycle ?? 1) > 1 ? ` · ${t("overtimePage.round", { n: r.cycle })}` : ""}
          </p>
          <p className="truncate text-xs text-muted-foreground">{r.location?.name} · {clock(r.createdAt, tz, i18n.language, true)}</p>
        </div>
        <button type="button" onClick={onClose} className="rounded-md p-1 text-muted-foreground hover:bg-muted" aria-label={t("common.close", "Close")}>
          <X className="size-4" />
        </button>
      </div>

      <span className={cn("self-start rounded-full px-2.5 py-0.5 text-[11px] font-semibold", STATE_PILL[state])}>{t(`overtimePage.state.${state}`)}</span>

      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
        {r.timeEntry?.clockInAt && (
          <>
            <dt className="text-muted-foreground">{t("overtimePage.panel.shift")}</dt>
            <dd className="text-right tabular-nums">{t("overtimePage.panel.shiftValue", { from: at(r.timeEntry.clockInAt), to: at(r.overtimeStartAt) || "—" })}</dd>
          </>
        )}
        {agreed > 0 && (
          <>
            <dt className="text-muted-foreground">{t("overtimePage.panel.agreed")}</dt>
            <dd className="text-right tabular-nums">{t("overtimePage.panel.agreedValue", { minutes: mins(agreed), time: at(r.overtimeEndAt) })}</dd>
            <dt className="text-muted-foreground">{t(state === "RUNNING" || state === "OVER" ? "overtimePage.panel.workedSoFar" : "overtimePage.panel.worked")}</dt>
            <dd className="text-right font-semibold tabular-nums">{mins(worked)}</dd>
          </>
        )}
        {overBy > 0 && (
          <>
            <dt className="text-muted-foreground">{t("overtimePage.panel.pastAgreed")}</dt>
            <dd className="text-right tabular-nums text-amber-600 dark:text-amber-400">{t("overtimePage.panel.notCounted", { minutes: mins(overBy) })}</dd>
          </>
        )}
        {r.rounds.length > 1 && (
          <>
            <dt className="text-muted-foreground">{t("overtimePage.panel.thisShift")}</dt>
            <dd className="text-right tabular-nums">{t("overtimePage.panel.thisShiftValue", { count: r.rounds.length, minutes: mins(shiftTotal) })}</dd>
          </>
        )}
      </dl>

      <ol className="flex flex-col">
        {steps.map((s, i) => (
          <li key={i} className="grid grid-cols-[auto_14px_1fr] gap-2 pb-3 text-sm last:pb-0">
            <time className="whitespace-nowrap pt-px font-mono text-xs text-muted-foreground">{s.at === "now" ? t("overtimePage.panel.now") : at(s.at)}</time>
            <span className="relative">
              <span
                className={cn(
                  "absolute left-[3px] top-[5px] size-2 rounded-full",
                  s.tone === "end" ? "bg-emerald-500" : s.tone === "warn" ? "bg-amber-500" : s.tone === "bad" ? "bg-red-500" : "bg-primary",
                )}
              />
              {i < steps.length - 1 && <span className="absolute bottom-[-12px] left-[6.5px] top-[15px] w-px bg-border" />}
            </span>
            <span className="text-foreground [overflow-wrap:anywhere]">{s.text}</span>
          </li>
        ))}
      </ol>

      {r.signature && (
        <figure className="flex flex-col gap-1">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={r.signature} alt={t("overtimePage.panel.signatureAlt", { name: r.leaderName || "" })} className="h-20 w-full rounded-lg border border-border bg-white object-contain"
            // A picture that will not draw is left out, not shown broken.
            onError={(e) => { const f = e.currentTarget.closest("figure"); if (f) f.hidden = true }}
          />
          {r.leaderName && <figcaption className="text-xs text-muted-foreground">{t("overtimePage.panel.signedBy", { name: r.leaderName })}</figcaption>}
        </figure>
      )}

      {(r.status === "APPROVED" || r.status === "COMPLETED") && (
        <div className="flex flex-col gap-2 border-t border-border pt-3">
          {confirming ? (
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="destructive" disabled={remove.isPending} onClick={() => remove.mutate(r.id)}>
                {remove.isPending && <Loader2 className="size-3.5 animate-spin" />}
                {t("overtime.removeConfirm")}
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setConfirming(false)}>{t("common.cancel")}</Button>
            </div>
          ) : (
            <Button size="sm" variant="outline" className="self-start text-red-600 hover:text-red-600" onClick={() => setConfirming(true)}>
              {t("overtimePage.panel.takeOff")}
            </Button>
          )}
          <p className="text-xs text-muted-foreground">{t("overtimePage.panel.takeOffHelp", { time: at(r.overtimeStartAt) })}</p>
        </div>
      )}
    </section>
  )
}

/** The round's steps in order — each one a fact the record holds. */
function timeline(t: (k: string, o?: Record<string, unknown>) => string, r: OvertimeRoundDetail, state: string, overBy: number): Step[] {
  const name = personName(r.technician)
  const by = r.approvedBy ? personName(r.approvedBy) : r.leaderName || ""
  const steps: Step[] = []
  if (r.overtimeStartAt) steps.push({ at: r.overtimeStartAt, text: t("overtimePage.step.plannedEnd") })
  if (r.technicianRespondedAt) {
    steps.push({
      at: r.technicianRespondedAt,
      text: r.status === "CANCELED"
        ? t("overtimePage.step.declined", { name })
        : r.technicianReason
          ? t("overtimePage.step.askedWhy", { name, reason: r.technicianReason })
          : t("overtimePage.step.asked", { name }),
    })
  } else if (r.status === "PENDING_TECHNICIAN" || r.status === "EXPIRED_NO_RESPONSE") {
    steps.push({ at: r.createdAt, text: t("overtimePage.step.phoneAsked", { name }) })
  }
  if (r.status === "EXPIRED_NO_RESPONSE" && r.technicianTimeoutAt) steps.push({ at: r.technicianTimeoutAt, text: t("overtimePage.step.noReply", { name }), tone: "warn" })
  if (r.approvedAt && (r.status === "APPROVED" || r.status === "COMPLETED")) {
    const how = methodWords(t, r)
    const minutes = mins(r.maxDurationMinutes ?? 0)
    steps.push({ at: r.approvedAt, text: how ? t("overtimePage.step.agreedHow", { how: how.charAt(0).toUpperCase() + how.slice(1), minutes }) : t("overtimePage.step.agreed", { minutes }) })
  }
  if (r.status === "REJECTED") {
    steps.push({ at: r.rejectedAt ?? r.approvedAt ?? r.createdAt, text: r.rejectionReason ? t("overtimePage.step.refusedWhy", { by, reason: r.rejectionReason }) : t("overtimePage.step.refused", { by }), tone: "bad" })
  }
  if (r.status === "EXPIRED_NO_APPROVAL") steps.push({ at: r.approvalTimeoutAt ?? r.createdAt, text: t("overtimePage.step.noAnswer"), tone: "warn" })
  if (r.timeEntry?.clockOutAt) steps.push({ at: r.timeEntry.clockOutAt, text: t("overtimePage.step.clockedOut", { name }), tone: "end" })
  steps.sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime())
  if (state === "RUNNING") steps.push({ at: "now", text: t("overtimePage.step.counting"), tone: "end" })
  if (state === "OVER") steps.push({ at: "now", text: t("overtimePage.step.over", { minutes: mins(overBy) }), tone: "warn" })
  return steps
}

/** What each label means — the page's own key. */
export function StateLegend() {
  const { t } = useTranslation()
  return (
    <section className="rounded-2xl border border-border bg-card p-4">
      <h2 className="mb-3 text-sm font-semibold text-foreground">{t("overtimePage.legend.title")}</h2>
      <dl className="grid grid-cols-[auto_1fr] items-center gap-x-3 gap-y-2 text-xs">
        {OVERTIME_ROUND_STATES.map((s) => (
          <div key={s} className="contents">
            <dt><span className={cn("whitespace-nowrap rounded-full px-2.5 py-0.5 text-[11px] font-semibold", STATE_PILL[s])}>{t(`overtimePage.state.${s}`)}</span></dt>
            <dd className="text-muted-foreground">{t(`overtimePage.legend.${s}`)}</dd>
          </div>
        ))}
      </dl>
    </section>
  )
}
