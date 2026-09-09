"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useTranslation } from "react-i18next"
import { format, parseISO, differenceInCalendarDays } from "date-fns"
import { Check, Loader2, X } from "lucide-react"

import { employeesApi, type OrgTimeOffRequest } from "@/lib/api"
import { notify } from "@/lib/toast"
import { invalidateTimeOff } from "@/lib/query-keys"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { cn } from "@/lib/utils"
import { COVER_TONE, coverDetail, coverTitle } from "../_lib/cover-labels"

/**
 * The decision, with the reason to make it.
 *
 * A drawer over the same page rather than a route of its own: the chart behind
 * it stays visible and its footer shows the projection live, so approving is
 * done while looking at what it costs. That adjacency is the entire redesign —
 * the old flow put the request and its consequences on two different tabs.
 */
export function LeaveDecisionDrawer({
  request,
  canManage,
  onClose,
}: {
  request: OrgTimeOffRequest | null
  canManage: boolean
  onClose: () => void
}) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const [rejecting, setRejecting] = useState(false)
  const [reason, setReason] = useState("")

  // A fresh request is a fresh decision — never inherit the last one's typing.
  useEffect(() => {
    setRejecting(false)
    setReason("")
  }, [request?.id])

  const decide = useMutation({
    mutationFn: ({ approved, why }: { approved: boolean; why?: string }) =>
      employeesApi.approveTimeOff(request!.id, approved, why),
    onSuccess: (_, vars) => {
      notify.success(
        vars.approved
          ? t("cover.decision.approved", "Approved — they are told now")
          : t("cover.decision.rejected", "Not approved — they are told now"),
      )
      invalidateTimeOff(queryClient)
      // The chart footer, the live panel and the calendar all move with it.
      queryClient.invalidateQueries({ queryKey: ["cover-range"] })
      queryClient.invalidateQueries({ queryKey: ["floor-now"] })
      queryClient.invalidateQueries({ queryKey: ["employees-availability"] })
      onClose()
    },
    onError: (e: Error) => notify.error(e.message || t("technicians.availabilityPage.failedToProcess")),
  })

  const open = !!request

  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="right" className="w-full sm:max-w-md flex flex-col gap-0 p-0">
        {request && (
          <DrawerBody
            request={request}
            canManage={canManage}
            rejecting={rejecting}
            reason={reason}
            setReason={setReason}
            onApprove={() => decide.mutate({ approved: true })}
            onReject={() => {
              if (!rejecting) {
                setRejecting(true)
                return
              }
              decide.mutate({ approved: false, why: reason.trim() || undefined })
            }}
            pending={decide.isPending}
          />
        )}
      </SheetContent>
    </Sheet>
  )
}

function DrawerBody({
  request,
  canManage,
  rejecting,
  reason,
  setReason,
  onApprove,
  onReject,
  pending,
}: {
  request: OrgTimeOffRequest
  canManage: boolean
  rejecting: boolean
  reason: string
  setReason: (v: string) => void
  onApprove: () => void
  onReject: () => void
  pending: boolean
}) {
  const { t } = useTranslation()
  const v = request.cover
  const tone = v ? COVER_TONE[v.level] : null
  const days = differenceInCalendarDays(parseISO(request.endDate), parseISO(request.startDate)) + 1

  /*
    The jobs already booked inside the window.

    No leave tool knows this and this product does: approving the days is what
    makes those visits somebody else's problem, so they belong in the decision
    rather than in a surprise on the morning.
  */
  const { data: jobs = [] } = useQuery({
    queryKey: ["employee-tasks-window", request.technicianId, request.startDate, request.endDate],
    queryFn: () =>
      employeesApi.getTasks(request.technicianId, {
        startDate: request.startDate.slice(0, 10),
        endDate: request.endDate.slice(0, 10),
        limit: 20,
      }),
    staleTime: 60_000,
    enabled: request.status === "PENDING",
  })

  // Only work that still needs doing. A job already finished inside the window
  // is not a handover, and listing it would inflate the number that matters.
  const openJobs = jobs.filter(
    (j) => j.status !== "COMPLETED" && j.status !== "CLOSED" && j.status !== "CANCELED",
  )

  return (
    <>
      <SheetHeader className="border-b border-border px-5 py-4 space-y-1">
        <SheetTitle className="text-[17px] font-semibold tracking-tight">
          {request.technician.firstName} {request.technician.lastName}
        </SheetTitle>
        <p className="text-[12.5px] text-muted-foreground">
          {format(parseISO(request.startDate), "d MMM")}
          {request.startDate !== request.endDate && <> – {format(parseISO(request.endDate), "d MMM")}</>}
          {" · "}
          {t("cover.drawer.days", "{{count}} day", { count: days })}
          {" · "}
          {t("cover.drawer.asked", "asked {{date}}", { date: format(parseISO(request.createdAt), "d MMM") })}
        </p>
        {request.technician.specialty && (
          <span className="inline-flex w-fit items-center rounded-md bg-muted px-2 py-0.5 text-[11.5px] font-medium text-muted-foreground">
            {request.technician.specialty}
          </span>
        )}
      </SheetHeader>

      <div className="flex-1 overflow-y-auto px-5 pb-5">
        {v && (
          <section className="pt-4">
            <div className={cn("flex gap-2.5 rounded-lg p-3 text-[13px]", tone!.bg, tone!.text)}>
              <span className="shrink-0 text-[15px] leading-tight">
                {v.level === "ok" ? "✓" : v.level === "tight" ? "!" : "▲"}
              </span>
              <span>
                <b className="block">{coverTitle(v, t)}</b>
                <span className="opacity-90">{coverDetail(v, t)}</span>
              </span>
            </div>
            {!v.rotaKnown && (
              <p className="mt-2 text-[11.5px] text-muted-foreground">
                {t("cover.noRota.hint", "Nobody here has a working week set, so this counts heads rather than a rota.")}
              </p>
            )}
          </section>
        )}

        {request.reason && (
          <Section title={t("cover.drawer.theirReason", "Their reason")}>
            <p className="text-[13px] text-foreground">{request.reason}</p>
          </Section>
        )}

        {v?.days?.length ? (
          <Section title={t("cover.drawer.dayByDay", "Day by day, if you approve")}>
            <div className="overflow-hidden rounded-lg border border-border">
              {v.days.map((d) => (
                <div
                  key={d.day}
                  className={cn(
                    "grid grid-cols-[3.9rem_1fr_auto] items-center gap-2.5 border-b border-border px-3 py-2 text-[12.5px] last:border-b-0",
                    (d.breach || d.skillGap) && "bg-red-500/5",
                  )}
                >
                  <span className="text-[12px] font-semibold tabular-nums">
                    {format(parseISO(d.day), "d MMM")}
                    <span className="block text-[10.5px] font-normal uppercase tracking-wider text-muted-foreground">
                      {format(parseISO(d.day), "EEE")}
                    </span>
                  </span>
                  <span className="min-w-0 text-[12px] leading-snug text-muted-foreground">
                    {d.working.length ? (
                      d.working.map((w, i) => (
                        <span key={w.id}>
                          {i > 0 && ", "}
                          {w.firstName}
                          {w.specialty && <span className="text-muted-foreground/60"> ({w.specialty})</span>}
                        </span>
                      ))
                    ) : (
                      <em>{t("cover.drawer.nobodyLeft", "nobody left")}</em>
                    )}
                    {d.away.length > 0 && (
                      <span className="block text-muted-foreground/60 line-through">
                        {d.away.map((w) => w.firstName).join(", ")} {t("cover.drawer.alreadyOff", "already off")}
                      </span>
                    )}
                  </span>
                  <span
                    className={cn(
                      "whitespace-nowrap text-right text-[12.5px] font-semibold tabular-nums",
                      d.breach || d.skillGap ? "text-red-600 dark:text-red-400" : "text-foreground",
                    )}
                  >
                    {d.now}
                    <span className="mx-0.5 font-normal text-muted-foreground">→</span>
                    {d.then}
                  </span>
                </div>
              ))}
            </div>
          </Section>
        ) : null}

        {request.status === "PENDING" && (
          <Section
            title={t("cover.drawer.jobsBooked", "Jobs already booked for {{name}}", {
              name: request.technician.firstName,
            })}
          >
            {openJobs.length ? (
              <>
                <div className="flex flex-col gap-1.5">
                  {openJobs.slice(0, 8).map((j) => (
                    <Link
                      key={j.id}
                      href={`/tasks/${j.id}`}
                      className="flex items-center gap-2.5 rounded-lg border border-border px-3 py-2 text-[12.5px] transition hover:bg-muted/50"
                    >
                      <span className="min-w-0 flex-1">
                        <b className="block truncate font-medium">{j.title}</b>
                        <span className="text-[11.5px] text-muted-foreground">{j.status.replace(/_/g, " ").toLowerCase()}</span>
                      </span>
                      {j.dueDate && (
                        <span className="whitespace-nowrap text-[11.5px] tabular-nums text-muted-foreground">
                          {format(parseISO(j.dueDate), "d MMM")}
                        </span>
                      )}
                    </Link>
                  ))}
                </div>
                <p className="mt-2 text-[12.5px] text-muted-foreground">
                  {t("cover.drawer.jobsNote", "Approving this leaves {{count}} job needing another person.", {
                    count: openJobs.length,
                  })}
                </p>
              </>
            ) : (
              <p className="text-[12.5px] text-muted-foreground">
                {t("cover.drawer.noJobs", "Nothing booked in this window — nothing to hand over.")}
              </p>
            )}
          </Section>
        )}
      </div>

      {canManage && request.status === "PENDING" && (
        <div className="flex flex-col gap-2.5 border-t border-border px-5 py-3.5">
          {rejecting && (
            <Textarea
              autoFocus
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="min-h-[4.2rem] text-[13px]"
              placeholder={t(
                "cover.drawer.reasonPlaceholder",
                "Why not? This is sent to them with the refusal — a reason beats a bare “rejected”.",
              )}
            />
          )}
          <div className="flex gap-2">
            <Button className="flex-1" onClick={onApprove} disabled={pending}>
              {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
              {t("technicians.availabilityPage.approve")}
            </Button>
            <Button variant="outline" className="flex-1" onClick={onReject} disabled={pending}>
              <X className="h-4 w-4" />
              {rejecting ? t("cover.drawer.confirmRefusal", "Confirm refusal") : t("technicians.availabilityPage.reject")}
            </Button>
          </div>
        </div>
      )}
    </>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="pt-4">
      <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{title}</h3>
      {children}
    </section>
  )
}
