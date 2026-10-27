"use client"

import { useEffect, useMemo, useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useTranslation } from "react-i18next"
import { DELEGATION_MAX_DAYS, standInDatesProblem, type StandInView } from "@hbcfield/shared/client"

import { approvalsApi } from "@/lib/api"
import { keys } from "@/lib/query-keys"
import { notify } from "@/lib/toast"
import { formatMediumDate } from "@/lib/format-date"
import { Button } from "@/components/ui/button"
import { DatePicker } from "@/components/ui/date-picker"
import { Combobox } from "@/components/ui/combobox"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { GroupLabel, Panel } from "@/components/page/page-kit"
import { Skeleton } from "@/components/ui/skeleton"
import { ListTableError } from "@/components/common/list-page"
import { cn } from "@/lib/utils"
import { useConfirmPress } from "../_hooks/use-confirm-press"
import { useTodayKey } from "../_hooks/use-today-key"
import { ConfirmHint } from "./confirm-hint"

const day = (k: string) => formatMediumDate(`${k}T12:00:00Z`)

/**
 * The Stand-ins tab: hand your approvals to a colleague for some days (left), and who covers whom now and
 * later (right), with "end". What a stand-in may then decide is the server's (shared `access/delegation.ts`);
 * this only records who, to whom, which days.
 */
export function StandInsTab() {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: keys.approvals.standIns(),
    queryFn: approvalsApi.standIns,
  })

  const [toUserId, setTo] = useState("")
  const [fromUserId, setFrom] = useState("")
  const today = useTodayKey()
  const [startsOn, setStart] = useState(today)
  const [endsOn, setEnd] = useState(today)
  // A day that passed while the tab stayed open moves on to today (the server refuses a start in the past).
  useEffect(() => {
    setStart((v) => (v && v < today ? today : v))
    setEnd((v) => (v && v < today ? today : v))
  }, [today])
  const [note, setNote] = useState("")

  const refresh = () => {
    qc.invalidateQueries({ queryKey: keys.approvals.all() })
  }
  const create = useMutation({
    mutationFn: () =>
      approvalsApi.createStandIn({
        toUserId,
        startsOn,
        endsOn,
        note: note.trim() || null,
        fromUserId: fromUserId || null,
      }),
    onSuccess: (v) => {
      notify.success(t("approvals.standIn.created", { name: v.to.name, from: day(v.startsOn), to: day(v.endsOn) }))
      setTo("")
      setNote("")
      refresh()
    },
    onError: (e: Error) => notify.error(e.message),
  })
  const end = useMutation({
    mutationFn: (id: string) => approvalsApi.endStandIn(id),
    onSuccess: () => {
      notify.success(t("approvals.standIn.ended"))
      refresh()
    },
    onError: (e: Error) => notify.error(e.message),
  })

  const people = useMemo(
    () => (data?.candidates ?? []).filter((c) => c.id !== fromUserId).map((c) => ({ value: c.id, label: c.name })),
    [data, fromUserId],
  )
  const leaders = useMemo(
    () => [
      { value: "", label: t("approvals.standIn.me") },
      ...(data?.leaders ?? []).map((c) => ({ value: c.id, label: c.name })),
    ],
    [data, t],
  )

  const canFill = !!data && (data.mayHandOver || data.mayArrange)
  // Longer than a stand-in may run: said beside the dates, and never sent (the server refuses it too).
  const tooLong = standInDatesProblem(startsOn, endsOn, today, DELEGATION_MAX_DAYS) === "STAND_IN_TOO_LONG"
  const ready = !!toUserId && !!startsOn && !!endsOn && endsOn >= startsOn && !tooLong && !create.isPending

  if (isError) return <ListTableError title={t("approvals.loadFailed")} error={error} onRetry={() => refetch()} />
  if (isLoading)
    return (
      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,420px)_minmax(0,1fr)]">
        <Skeleton className="h-80 rounded-[22px]" />
        <Skeleton className="h-48 rounded-[22px]" />
      </div>
    )

  return (
    <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,420px)_minmax(0,1fr)]">
      <Panel className="flex flex-col gap-3 p-5">
        <div>
          <b className="text-base">{t("approvals.standIn.title")}</b>
          <p className="mt-1 text-sm text-muted-foreground">{t("approvals.standIn.intro")}</p>
        </div>

        {data && !canFill && <p className="text-sm text-muted-foreground">{t("approvals.standIn.nothing")}</p>}

        {canFill && (
          <div className="space-y-3">
            {data!.mayArrange && (
              <div className="space-y-1.5">
                <Label htmlFor="stand-in-whose">{t("approvals.standIn.whose")}</Label>
                <Combobox
                  id="stand-in-whose"
                  value={fromUserId}
                  // Nobody stands in for themselves: a stand-in who is now the one away is cleared.
                  onChange={(v) => {
                    setFrom(v)
                    if (v && v === toUserId) setTo("")
                  }}
                  options={leaders}
                  placeholder={t("approvals.standIn.me")}
                />
              </div>
            )}
            <div className="space-y-1.5">
              <Label htmlFor="stand-in-who">{t("approvals.standIn.who")}</Label>
              <Combobox
                id="stand-in-who"
                value={toUserId}
                onChange={setTo}
                options={people}
                placeholder={t("approvals.standIn.pickPerson")}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="stand-in-from">{t("approvals.standIn.firstDay")}</Label>
                <DatePicker
                  id="stand-in-from"
                  value={startsOn}
                  min={today}
                  // A first day after the last one moves the last one with it.
                  onChange={(v) => {
                    setStart(v)
                    if (v > endsOn) setEnd(v)
                  }}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="stand-in-to">{t("approvals.standIn.lastDay")}</Label>
                <DatePicker id="stand-in-to" value={endsOn} min={startsOn} onChange={setEnd} />
              </div>
            </div>
            <p aria-live="polite" className={cn("text-xs", tooLong ? "text-shell-crit" : "text-muted-foreground")}>
              {t(tooLong ? "approvals.standIn.tooLong" : "approvals.standIn.maxDays", { count: DELEGATION_MAX_DAYS })}
            </p>
            <div className="space-y-1.5">
              <Label htmlFor="stand-in-note">{t("approvals.standIn.note")}</Label>
              <Textarea
                id="stand-in-note"
                rows={2}
                maxLength={300}
                value={note}
                onChange={(e) => setNote(e.target.value)}
              />
            </div>
            <Button className="w-full rounded-lg" disabled={!ready} onClick={() => create.mutate()}>
              {t("approvals.standIn.save")}
            </Button>
          </div>
        )}
      </Panel>
      <Panel className="flex flex-col gap-4 p-5">
        {data && (
          <div className="space-y-4">
            <StandInList
              title={t("approvals.standIn.yours")}
              rows={data.given}
              show="to"
              onEnd={(id) => end.mutate(id)}
              busy={end.isPending}
            />
            <StandInList
              title={t("approvals.standIn.forYou")}
              rows={data.received}
              show="from"
              onEnd={(id) => end.mutate(id)}
              busy={end.isPending}
            />
            <StandInList
              title={t("approvals.standIn.others")}
              rows={data.others}
              show="both"
              onEnd={(id) => end.mutate(id)}
              busy={end.isPending}
            />
            {!data.given.length && !data.received.length && !data.others.length && (
              <p className="text-sm text-muted-foreground">{t("approvals.standIn.none")}</p>
            )}
          </div>
        )}
      </Panel>
    </div>
  )
}

function StandInList({
  title,
  rows,
  show,
  onEnd,
  busy,
}: {
  title: string
  rows: StandInView[]
  show: "to" | "from" | "both"
  onEnd: (id: string) => void
  busy: boolean
}) {
  const { t } = useTranslation()
  if (!rows.length) return null
  return (
    <div>
      <GroupLabel className="px-0 pt-0">{title}</GroupLabel>
      <ul className="divide-y divide-border rounded-lg border border-border">
        {rows.map((r) => {
          const who = show === "to" ? r.to.name : show === "from" ? r.from.name : `${r.from.name} → ${r.to.name}`
          const dates = t("approvals.standIn.from", { from: day(r.startsOn), to: day(r.endsOn) })
          return (
            <li key={r.id} className="flex items-center gap-3 px-3 py-2 text-sm">
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium text-foreground">{who}</p>
                <p className="text-xs text-muted-foreground">
                  {r.active ? `${t("approvals.standIn.now")} · ` : ""}
                  {dates}
                  {r.note ? ` · ${r.note}` : ""}
                </p>
              </div>
              {/* Each "End" says whose stand-in and which days — a list of identical buttons tells a screen reader nothing. */}
              {r.canEnd && <EndButton busy={busy} about={`${who}, ${dates}`} onEnd={() => onEnd(r.id)} />}
            </li>
          )
        })}
      </ul>
    </div>
  )
}

/** "End" acts on the second press — a stand-in is never ended by one stray tap. */
function EndButton({ busy, about, onEnd }: { busy: boolean; about: string; onEnd: () => void }) {
  const { t } = useTranslation()
  const { asking, press } = useConfirmPress(onEnd)
  const label = asking ? t("approvals.standIn.confirmEndLabel") : t("approvals.standIn.end")
  return (
    <>
      <Button
        variant="outline"
        size="sm"
        className={cn("rounded-lg", asking && "border-shell-crit text-shell-crit")}
        disabled={busy}
        onClick={press}
        aria-label={`${label} · ${about}`}
      >
        {asking ? t("approvals.standIn.confirmEnd") : t("approvals.standIn.end")}
      </Button>
      <ConfirmHint asking={asking} />
    </>
  )
}
