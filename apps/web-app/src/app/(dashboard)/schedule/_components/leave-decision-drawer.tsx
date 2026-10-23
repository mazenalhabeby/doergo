"use client"

import { personName } from "@hbcfield/shared/client"
import Link from "next/link"
import { format, parseISO } from "date-fns"

import { type OrgTimeOffRequest } from "@/lib/api"
import { requestDetail, requestKindEffectKey, formatRequestMinutes } from "@/lib/requests"
import { RequestKindChip } from "@/components/requests/request-kind"
import { LeaveBalanceBreakdown } from "@/components/leave/leave-balance-breakdown"
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { cn } from "@/lib/utils"
import { coverDetail, coverTitle } from "../_lib/cover-labels"
import { useTranslation } from "react-i18next"
import { useRequestFacts } from "./use-request-facts"
import { Section, Fact } from "./drawer-section"
import { DrawerActions } from "./drawer-actions"
import type { PickedDay } from "./day-hours-form"

/**
 * The decision, with the reason to make it — for ANY kind of request.
 *
 * Leave keeps everything it had (working days, the allowance, cover day by day,
 * the jobs it would orphan). The other kinds show only what deciding THEM needs:
 * a remote day's workspace and whether the person may work away at all; a
 * changed day's new times beside their usual ones; the overtime asked for.
 * Approve and refuse are the same two buttons for every kind.
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
  onChangeHours,
}: {
  request: OrgTimeOffRequest | null
  canManage: boolean
  onClose: () => void
  /** Approved changed hours for one day can be changed again (rota permission). */
  onChangeHours?: (pick: Omit<PickedDay, "self">) => void
}) {
  const open = !!request

  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="right" className="w-full sm:max-w-md flex flex-col gap-0 p-0">
        {request && <DrawerBody request={request} canManage={canManage} onChangeHours={onChangeHours} />}
      </SheetContent>
    </Sheet>
  )
}

function DrawerBody({
  request,
  canManage,
  onChangeHours,
}: {
  request: OrgTimeOffRequest
  canManage: boolean
  onChangeHours?: (pick: Omit<PickedDay, "self">) => void
}) {
  const { t } = useTranslation()
  const { kind, leave, v, tone, span, days, pendingVacation, balance, usual, openJobs } = useRequestFacts(request)

  return (
    <>
      <SheetHeader className="border-b border-border px-5 py-4 space-y-1">
        <SheetTitle className="text-[17px] font-semibold tracking-tight">{personName(request.technician)}</SheetTitle>
        <p className="text-[12.5px] text-muted-foreground">
          {format(parseISO(request.startDate), "d MMM")}
          {request.startDate !== request.endDate && <> – {format(parseISO(request.endDate), "d MMM")}</>}
          {leave && (
            <>
              {" · "}
              {days !== span
                ? t("cover.drawer.workingDays", "{{count}} working days of {{total}}", { count: days, total: span })
                : t("cover.drawer.days", "{{count}} day", { count: days })}
            </>
          )}
          {" · "}
          {t("cover.drawer.asked", "asked {{date}}", { date: format(parseISO(request.createdAt), "d MMM") })}
        </p>
        <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
          <RequestKindChip kind={kind} />
          {leave && request.type && (
            <span
              className={
                "inline-flex items-center rounded-full border border-border px-2 py-0.5 " +
                "text-[11px] font-medium text-muted-foreground"
              }
            >
              {requestDetail(request, t)}
            </span>
          )}
          {request.technician.specialty && (
            <span
              className={
                "inline-flex w-fit items-center rounded-full border border-border px-2 " +
                "py-0.5 text-[11px] font-medium text-muted-foreground"
              }
            >
              {request.technician.specialty}
            </span>
          )}
        </div>
      </SheetHeader>

      <div className="flex-1 overflow-y-auto px-5 pb-5">
        {v && (
          <section className="pt-4">
            <div className={cn("flex gap-2.5 rounded-xl p-3 text-[13px]", tone!.bg, tone!.text)}>
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

        {!leave && (
          <Section title={t("requests.drawer.asked", "What is asked")}>
            <div className="overflow-hidden rounded-xl border border-border text-[13px]">
              {kind === "REMOTE" && (
                <>
                  <Fact label={t("requests.form.workspace")} value={request.space?.name ?? "—"} />
                  <Fact
                    label={t("requests.drawer.mayWorkAway")}
                    value={
                      request.mayWorkRemotely == null
                        ? t("requests.drawer.mayWorkAwayChecked")
                        : request.mayWorkRemotely
                          ? t("common.yes", "Yes")
                          : t("requests.drawer.mayWorkAwayNo")
                    }
                    warn={request.mayWorkRemotely === false}
                  />
                </>
              )}
              {kind === "HOURS" && (
                <>
                  <Fact label={t("requests.drawer.newHours")} value={requestDetail(request, t) ?? "—"} />
                  <Fact
                    label={t("requests.drawer.usualHours")}
                    value={
                      usual
                        ? t("requests.detail.hoursBoth", { start: usual.start, end: usual.end })
                        : t("requests.drawer.noUsualHours")
                    }
                  />
                </>
              )}
              {kind === "OVERTIME" && (
                <>
                  <Fact
                    label={t("requests.drawer.overtime")}
                    value={request.minutes ? formatRequestMinutes(request.minutes, t) : "—"}
                  />
                  {usual && (
                    <Fact
                      label={t("requests.drawer.usualHours")}
                      value={t("requests.detail.hoursBoth", { start: usual.start, end: usual.end })}
                    />
                  )}
                </>
              )}
              {kind === "OTHER" && <Fact label={t("requests.drawer.kind")} value={t("requests.kinds.OTHER.label")} />}
            </div>
            <p className="mt-2 text-[12px] leading-snug text-muted-foreground">{t(requestKindEffectKey(kind))}</p>
          </Section>
        )}

        {pendingVacation && balance && (balance.allowance > 0 || (balance.lines?.length ?? 0) > 1) && (
          <Section title={t("requests.drawer.balance", "Vacation allowance")}>
            {/* The same breakdown the member saw before sending — and what approving leaves. */}
            <LeaveBalanceBreakdown balance={balance} requestDays={days} />
          </Section>
        )}

        {request.reason && (
          <Section title={t("cover.drawer.theirReason", "Their reason")}>
            <p className="text-[13px] text-foreground">{request.reason}</p>
          </Section>
        )}

        {v?.days?.length ? (
          <Section title={t("cover.drawer.dayByDay", "Day by day, if you approve")}>
            <div className="overflow-hidden rounded-xl border border-border">
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

        {leave && request.status === "PENDING" && (
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
                      className={
                        "flex items-center gap-2.5 rounded-xl border border-border px-3 py-2 " +
                        "text-[12.5px] transition hover:bg-muted/50"
                      }
                    >
                      <span className="min-w-0 flex-1">
                        <b className="block truncate font-medium">{j.title}</b>
                        <span className="text-[11.5px] text-muted-foreground">
                          {j.status.replace(/_/g, " ").toLowerCase()}
                        </span>
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

      <DrawerActions request={request} canManage={canManage} onChangeHours={onChangeHours} />
    </>
  )
}
