"use client"

import { useEffect, useMemo, useState } from "react"
import { useTranslation } from "react-i18next"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import {
  CalendarDays, ChevronLeft, ChevronRight, Check, X,
  Loader2, AlertTriangle, Clock3,
} from "lucide-react"
import { useAuth } from "@/contexts/auth-context"
import { calendarApi, employeesApi } from "@/lib/api"
import { Button } from "@/components/ui/button"
import { ProgressRing } from "@/components/progress-ring"
import { notify } from "@/lib/toast"
import { cn } from "@/lib/utils"
import { hasAccessModule, localDateKey, type LeaveType, leaveCostInBalanceYear } from "@hbcfield/shared/client"
import type { TimeOffRequest } from "@hbcfield/shared"
import { keys } from "@/lib/query-keys"
import { formatDayMonth, formatMediumDate, formatMonthYear } from "@/lib/format-date"
import { serverErrorMessage } from "@/lib/server-error"
import { useRequestOptions } from "@/hooks/use-request-options"
import {
  LEAVE_TYPE_REASON_KEY, absencesOnly, draftToRequest, isAbsence, isOneDayKind, requestDetail, requestKindEffectKey,
  type RequestKind,
} from "@/lib/requests"
import { RequestKindChip, RequestKindPicker } from "@/components/requests/request-kind"
import { RequestFields, type RequestFieldsValue } from "@/components/requests/request-fields"
import { LeaveBalanceBreakdown } from "@/components/leave/leave-balance-breakdown"
import { balanceView, leaveYearLabel } from "@/lib/leave-ledger"
import { useMyTimeOffPage, toISO, sameDay, REASON_TYPES } from "./use-my-time-off-page"
import { STATUS_STYLES, fmt, Stat, Legend } from "./my-time-off-page-helpers"
import { MyTimeOffPageAllowanceTitleWork } from "./my-time-off-page-allowance-title-work"
import { MyTimeOffPageMy } from "./my-time-off-page-my"
import { MyTimeOffPageMy2 } from "./my-time-off-page-my2"
import { PageNotice } from "@/components/ui/empty-note"

/*
  Requests — this page grew from "time off" into everything a member asks the
  person responsible for them: leave, a remote day, a changed day, overtime
  agreed in advance, anything else. The kind is chosen FIRST; leave keeps every
  part of the old form (reason cards, working-day cost, clash warning), the
  other kinds swap in their own few fields. Validity is asked of the shared
  parser, so the button refuses exactly what the server would.
*/
export default function MyTimeOffPage() {
  const vm = useMyTimeOffPage()
  const {
    t,
    canSee,
    STATUS_LABELS,
    options,
    kind,
    fields,
    setFields,
    reasonType,
    setReasonType,
    notes,
    setNotes,
    rangeStart,
    rangeEnd,
    setHovered,
    cursor,
    setCursor,
    showLines,
    setShowLines,
    today,
    weeks,
    isLoading,
    balance,
    yearLabel,
    list,
    booked,
    stats,
    reset,
    chooseKind,
    createMut,
    cancelMut,
    pickDay,
    inRange,
    isEdge,
    dayCount,
    cost,
    clash,
    canSubmit,
    problem,
  } = vm

  // After every hook — an early return above them changes the hook order between renders.
  if (!canSee) {
    return (
      <PageNotice>
        {t("timeOff.my.noAccess")}
      </PageNotice>
    )
  }

  const weekdays = t("timeOff.my.weekdays", { defaultValue: "Mo,Tu,We,Th,Fr,Sa,Su" }).split(",")
  const monthLabel = formatMonthYear(cursor)

  return (
    <div>
      <header className="mb-5">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">{t("nav.timeOff")}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t("timeOff.my.subtitle")}</p>
      </header>

      {/* The allowance, and what is actually left of it. */}
      <MyTimeOffPageAllowanceTitleWork vm={vm} />
      {showLines && balance && (
        <LeaveBalanceBreakdown balance={balance} className="mb-5 bg-card sm:max-w-md" />
      )}

      <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_320px]">
        {/* ── Calendar ─────────────────────────────────────────────── */}
        <section className="rounded-2xl border border-border bg-card p-4 sm:p-5">
          <div className="flex items-center justify-between">
            <button type="button" aria-label={t("timeOff.my.prevMonth")}
              onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1))}
              className="rounded-lg p-2 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground">
              <ChevronLeft className="size-4" />
            </button>
            <span className="text-sm font-medium capitalize text-foreground">{monthLabel}</span>
            <button type="button" aria-label={t("timeOff.my.nextMonth")}
              onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1))}
              className="rounded-lg p-2 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground">
              <ChevronRight className="size-4" />
            </button>
          </div>

          <div className="mt-3 grid grid-cols-7 gap-y-1 text-center">
            {weekdays.map((w) => (
              <span key={w} className="pb-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{w}</span>
            ))}
            {weeks.flat().map((d, i) => {
              if (!d) return <span key={`x${i}`} />
              const iso = toISO(d)
              const past = d < today
              const edge = isEdge(d)
              const mid = inRange(d)
              const book = booked.get(iso)
              return (
                <button
                  key={iso}
                  type="button"
                  disabled={past}
                  onClick={() => pickDay(d)}
                  onMouseEnter={() => setHovered(d)}
                  onMouseLeave={() => setHovered(null)}
                  title={book?.reason ?? undefined}
                  className={cn(
                    "relative mx-auto flex size-10 flex-col items-center justify-center text-sm transition-all duration-150",
                    past && "cursor-not-allowed text-muted-foreground/35",
                    !past && !edge && !mid && "rounded-lg text-foreground hover:bg-accent",
                    mid && "bg-primary/15 text-foreground",
                    edge && "rounded-lg bg-primary font-semibold text-primary-foreground shadow-sm motion-safe:scale-105",
                    !past && sameDay(d, today) && !edge && !mid && "font-semibold text-primary",
                  )}
                >
                  {d.getDate()}
                  {/* Already booked — the answer to "what have I got?" shown
                      where the question is asked, not on a list further down. */}
                  {book && !edge && (
                    <span className={cn(
                      "absolute bottom-1 rounded-full",
                      isAbsence(book.kind)
                        ? cn("h-1 w-1", book.status === "APPROVED" ? "bg-green-500" : "bg-amber-500")
                        // Not a day off — a ring, so it never reads as leave.
                        : cn("h-1.5 w-1.5 border", book.status === "APPROVED" ? "border-green-500" : "border-amber-500"),
                    )} />
                  )}
                </button>
              )
            })}
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-border pt-3 text-[11px] text-muted-foreground">
            <Legend className="bg-green-500" label={t("timeOff.my.legendApproved")} />
            <Legend className="bg-amber-500" label={t("timeOff.my.legendPending")} />
            <Legend className="bg-primary" label={t("timeOff.my.legendSelected")} />
            {options.kinds.length > 1 && (
              <Legend className="border border-muted-foreground bg-transparent" label={t("requests.legendNotLeave")} />
            )}
          </div>
        </section>

        {/* ── Request ──────────────────────────────────────────────── */}
        <section className="rounded-2xl border border-border bg-card p-4 sm:p-5">
          {options.kinds.length > 1 && (
            <div className="mb-4 border-b border-border pb-4">
              <h2 className="mb-2.5 text-sm font-semibold text-foreground">{t("requests.form.kindQuestion")}</h2>
              <RequestKindPicker kinds={options.kinds} value={kind} onChange={chooseKind} />
            </div>
          )}
          {kind !== "LEAVE" ? (
            <RequestFields
              kind={kind}
              value={fields}
              onChange={(patch) => setFields((f) => ({ ...f, ...patch }))}
              remoteSpaces={options.remoteSpaces}
            />
          ) : (
          <>
          <h2 className="text-sm font-semibold text-foreground">{t("timeOff.my.stepReason")}</h2>
          <div className="mt-3 grid grid-cols-2 gap-2">
            {REASON_TYPES.map(({ key, glyph: Glyph }) => {
              const active = reasonType === key
              return (
                <button
                  key={key}
                  type="button"
                  aria-pressed={active}
                  onClick={() => setReasonType(active ? null : key)}
                  className={cn(
                    "group relative flex flex-col items-center gap-2 rounded-2xl border px-2 py-3.5 transition-all duration-200",
                    "motion-safe:hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                    active
                      ? "border-foreground bg-foreground text-background shadow-sm"
                      : "border-border text-muted-foreground hover:border-foreground/25 hover:text-foreground",
                  )}
                >
                  <Glyph
                    className={cn(
                      "size-6 stroke-current transition-transform duration-200",
                      active && "motion-safe:scale-110",
                    )}
                  />
                  <span className="text-[11px] font-medium leading-none">{t(`timeOff.reasonTypes.${key}`)}</span>
                </button>
              )
            })}
          </div>

          {/* Offered for every type: someone on vacation still wants to say
              "back Monday". Under "Other" it is the only identifying detail. */}
          <div className={cn("grid transition-all duration-300 ease-out",
            reasonType ? "mt-3 grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0")}>
            <div className="overflow-hidden">
              <input
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                maxLength={200}
                placeholder={reasonType === "other"
                  ? t("timeOff.my.notesRequiredPlaceholder")
                  : t("timeOff.my.notesPlaceholder")}
                className={"w-full rounded-xl border border-border bg-background px-3 py-2 text-sm " +
                  "outline-none transition-colors placeholder:text-muted-foreground " +
                  "focus:border-primary"}
              />
            </div>
          </div>
          </>
          )}

          <MyTimeOffPageMy2 vm={vm} />

          <div className="mt-4 flex items-center gap-2">
            <Button onClick={() => createMut.mutate()} disabled={!canSubmit} className="flex-1">
              {createMut.isPending
                ? <Loader2 className="mr-2 size-4 animate-spin" />
                : <Check className="mr-2 size-4" />}
              {t("requests.form.send")}
            </Button>
            {(reasonType || rangeStart || fields.reason) && (
              <Button variant="ghost" size="sm" onClick={reset} disabled={createMut.isPending}>
                {t("common.clear", { defaultValue: "Clear" })}
              </Button>
            )}
          </div>
          {!rangeStart && (
            <p className="mt-2 text-center text-xs text-muted-foreground">
              {isOneDayKind(kind) ? t("requests.form.pickDayHint") : t("timeOff.my.pickDaysHint")}
            </p>
          )}
        </section>
      </div>

      {/* ── History ──────────────────────────────────────────────────── */}
      <MyTimeOffPageMy vm={vm} />
    </div>
  )
}

/**
 * Remaining vacation as a ring.
 *
 * Only the APPROVED portion is filled. Pending days are reported next to it in
 * words rather than shaded in, because a half-shaded ring reads as "already
 * gone" for days a manager has not yet agreed to.
 */
