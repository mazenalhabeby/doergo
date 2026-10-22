"use client"

import { useTranslation } from "react-i18next"
import { useMutation } from "@tanstack/react-query"
import { X } from "lucide-react"
import type { TimeOffRequest } from "@hbcfield/shared"
import { cn } from "@/lib/utils"
import { employeesApi } from "@/lib/api"
import { notify } from "@/lib/toast"
import { serverErrorMessage } from "@/lib/server-error"
import { isAbsence, requestDetail } from "@/lib/requests"
import { RequestKindChip } from "@/components/requests/request-kind"
import { toneChip, type Tone } from "@/lib/status-tones"
import { fmt } from "../_lib/request-calendar"

/** A request's state as one of the six tones (lib/status-tones). */
const STATUS_TONE: Record<string, Tone> = {
  PENDING: "warning",
  APPROVED: "success",
  REJECTED: "danger",
  CANCELED: "neutral",
}

/** The member's own requests, newest first, with where each got to — a pending one can be cancelled. */
export function RequestHistory({
  isLoading,
  list,
  manyKinds,
  onChanged,
}: {
  isLoading: boolean
  list: TimeOffRequest[]
  /** More than one kind of request is offered — then every row names its kind. */
  manyKinds: boolean
  /** Re-read the requests and balance after one is cancelled. */
  onChanged: () => void
}) {
  const { t } = useTranslation()

  const STATUS_LABELS: Record<string, string> = {
    PENDING: t("common.pending"),
    APPROVED: t("common.approved"),
    REJECTED: t("common.rejected"),
    CANCELED: t("common.canceled"),
  }

  const cancelMut = useMutation({
    mutationFn: (id: string) => employeesApi.cancelTimeOff(id),
    onSuccess: () => {
      notify.success(t("timeOff.my.canceledToast"))
      onChanged()
    },
    onError: (e) => notify.error(serverErrorMessage(e, t) || t("timeOff.my.cancelError")),
  })

  return (
    <section className="mt-6">
      <h2 className="mb-3 text-sm font-semibold text-foreground">{t("timeOff.my.myRequests")}</h2>
      {isLoading ? (
        <div className="space-y-2">
          {[0, 1].map((i) => (
            <div key={i} className="h-16 animate-pulse rounded-xl bg-muted" />
          ))}
        </div>
      ) : list.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-border px-4 py-10 text-center text-sm text-muted-foreground">
          {t("timeOff.my.noRequests")}
        </p>
      ) : (
        <ul className="space-y-2">
          {list.map((r) => (
            <li
              key={r.id}
              className={
                "flex items-start justify-between gap-3 rounded-xl border border-border " +
                "bg-card px-4 py-3 transition-colors hover:border-primary/30"
              }
            >
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-sm font-medium text-foreground">
                    {fmt(r.startDate)}
                    {r.endDate.slice(0, 10) !== r.startDate.slice(0, 10) && <> → {fmt(r.endDate)}</>}
                  </p>
                  {(manyKinds || !isAbsence(r.kind)) && <RequestKindChip kind={r.kind} />}
                  {!isAbsence(r.kind) && requestDetail(r, t) && (
                    <span className="text-xs text-muted-foreground">{requestDetail(r, t)}</span>
                  )}
                </div>
                {r.reason && <p className="mt-0.5 truncate text-xs text-muted-foreground">{r.reason}</p>}
                {r.status === "REJECTED" && r.rejectionReason && (
                  <p className="mt-1 text-xs text-red-600 dark:text-red-400">
                    {/* The string carries its own "Rejected:" prefix AND a
                        {{reason}} placeholder. Calling t() without the value
                        and appending the reason by hand printed the literal
                        placeholder, then the reason, after a second colon. */}
                    {t("timeOff.my.rejectedReason", { reason: r.rejectionReason })}
                  </p>
                )}
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <span
                  className={cn(
                    "rounded-full px-2 py-0.5 text-[11px] font-medium",
                    toneChip(STATUS_TONE[r.status] ?? "neutral"),
                  )}
                >
                  {STATUS_LABELS[r.status] ?? r.status}
                </span>
                {r.status === "PENDING" && (
                  <button
                    type="button"
                    aria-label={t("common.cancel")}
                    onClick={() => cancelMut.mutate(r.id)}
                    disabled={cancelMut.isPending}
                    className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
                  >
                    <X className="size-4" />
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
