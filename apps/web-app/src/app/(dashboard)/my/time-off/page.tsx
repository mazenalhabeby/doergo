"use client"

import { useState } from "react"
import { useTranslation } from "react-i18next"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { CalendarPlus, X } from "lucide-react"
import { useAuth } from "@/contexts/auth-context"
import { employeesApi } from "@/lib/api"
import { Button } from "@/components/ui/button"
import { notify } from "@/lib/toast"
import { hasAccessModule } from "@hbcfield/shared/client"
import type { TimeOffRequest } from "@hbcfield/shared"

const STATUS_STYLES: Record<string, string> = {
  PENDING: "text-amber-600 bg-amber-100",
  APPROVED: "text-green-600 bg-green-100",
  REJECTED: "text-red-600 bg-red-100",
  CANCELED: "text-slate-500 bg-slate-100",
}

function fmt(iso?: string): string {
  if (!iso) return "—"
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })
}

export default function MyTimeOffPage() {
  const { t } = useTranslation()
  const { user } = useAuth()
  const qc = useQueryClient()
  const canSee = !user || hasAccessModule(user, "time_off")

  const STATUS_LABELS: Record<string, string> = {
    PENDING: t("common.pending"),
    APPROVED: t("common.approved"),
    REJECTED: t("common.rejected"),
    CANCELED: t("common.canceled"),
  }

  const [startDate, setStartDate] = useState("")
  const [endDate, setEndDate] = useState("")
  const [reason, setReason] = useState("")

  const { data: requests, isLoading } = useQuery({
    queryKey: ["my-time-off", user?.id],
    queryFn: () => employeesApi.getTimeOff(user!.id),
    enabled: canSee && !!user?.id,
  })

  const refetch = () => qc.invalidateQueries({ queryKey: ["my-time-off", user?.id] })

  const createMut = useMutation({
    mutationFn: () => employeesApi.requestTimeOff(user!.id, { startDate, endDate, reason: reason || undefined }),
    onSuccess: () => {
      notify.success(t("timeOff.my.requestedTitle"), t("timeOff.my.requestedDesc"))
      setStartDate(""); setEndDate(""); setReason("")
      refetch()
    },
    onError: (e) => notify.error(e instanceof Error ? e.message : t("timeOff.my.submitError")),
  })

  const cancelMut = useMutation({
    mutationFn: (id: string) => employeesApi.cancelTimeOff(id),
    onSuccess: () => { notify.success(t("timeOff.my.canceledToast")); refetch() },
    onError: (e) => notify.error(e instanceof Error ? e.message : t("timeOff.my.cancelError")),
  })

  if (!canSee) {
    return (
      <div className="mx-auto max-w-2xl px-6 py-16 text-center text-sm text-muted-foreground">
        {t("timeOff.my.noAccess")}
      </div>
    )
  }

  const list: TimeOffRequest[] = (requests as TimeOffRequest[]) ?? []
  const validRange = startDate && endDate && endDate >= startDate

  return (
    <div className="mx-auto max-w-3xl px-6 py-8">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-foreground">{t("timeOff.my.title")}</h1>
        <p className="text-sm text-muted-foreground">{t("timeOff.my.subtitle")}</p>
      </div>

      {/* Request form */}
      <div className="rounded-2xl border border-border bg-card p-5 mb-8">
        <h2 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
          <CalendarPlus className="h-4 w-4 text-primary" /> {t("timeOff.my.newRequest")}
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <label className="text-xs font-medium text-muted-foreground">
            {t("timeOff.my.from")}
            <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)}
              className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground" />
          </label>
          <label className="text-xs font-medium text-muted-foreground">
            {t("timeOff.my.to")}
            <input type="date" value={endDate} min={startDate || undefined} onChange={(e) => setEndDate(e.target.value)}
              className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground" />
          </label>
        </div>
        <textarea value={reason} onChange={(e) => setReason(e.target.value)} placeholder={t("timeOff.my.reasonPlaceholder")}
          className="mt-3 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground" rows={2} />
        <div className="mt-3 flex justify-end">
          <Button size="sm" disabled={!validRange || createMut.isPending} onClick={() => createMut.mutate()}>
            {createMut.isPending ? t("common.submitting") : t("timeOff.my.requestButton")}
          </Button>
        </div>
      </div>

      {/* My requests */}
      <h2 className="text-sm font-semibold text-foreground mb-3">{t("timeOff.my.myRequests")}</h2>
      {isLoading ? (
        <div className="rounded-2xl border border-border bg-card py-12 text-center text-sm text-muted-foreground">{t("common.loading")}</div>
      ) : list.length === 0 ? (
        <div className="rounded-2xl border border-border bg-card py-12 text-center text-sm text-muted-foreground">{t("timeOff.my.noRequests")}</div>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-border bg-card">
          {list.map((r, i) => (
            <div key={r.id} className={`flex items-center gap-4 px-5 py-3 ${i > 0 ? "border-t border-border" : ""}`}>
              <div className="flex-1">
                <div className="text-sm font-medium text-foreground">{fmt(r.startDate)} → {fmt(r.endDate)}</div>
                {r.reason && <div className="text-xs text-muted-foreground">{r.reason}</div>}
                {r.status === "REJECTED" && r.rejectionReason && (
                  <div className="text-xs text-red-600">{t("timeOff.my.rejectedReason", { reason: r.rejectionReason })}</div>
                )}
              </div>
              <span className={`shrink-0 rounded-full px-2.5 py-1 text-[10px] font-semibold ${STATUS_STYLES[r.status] ?? "text-slate-500 bg-slate-100"}`}>
                {STATUS_LABELS[r.status] ?? r.status}
              </span>
              {r.status === "PENDING" && (
                <button onClick={() => cancelMut.mutate(r.id)} disabled={cancelMut.isPending}
                  className="shrink-0 rounded-lg border border-border p-1.5 text-muted-foreground hover:text-red-600" title={t("common.cancel")}>
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
