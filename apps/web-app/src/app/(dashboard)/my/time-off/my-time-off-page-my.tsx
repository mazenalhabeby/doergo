"use client"

import { X } from "lucide-react"
import { cn } from "@/lib/utils"
import { isAbsence, requestDetail } from "@/lib/requests"
import { RequestKindChip } from "@/components/requests/request-kind"
import { STATUS_TONE, fmt } from "./my-time-off-page-helpers"
import type { MyTimeOffPageState } from "./use-my-time-off-page"
import { toneChip } from "@/lib/status-tones"

/** Part of MyTimeOffPage's markup, moved here unchanged; it reads the page's state from `vm`. */
export function MyTimeOffPageMy({ vm }: { vm: MyTimeOffPageState }) {
  const { t, isLoading, list, options, STATUS_LABELS, cancelMut } = vm
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
                  {(options.kinds.length > 1 || !isAbsence(r.kind)) && <RequestKindChip kind={r.kind} />}
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
