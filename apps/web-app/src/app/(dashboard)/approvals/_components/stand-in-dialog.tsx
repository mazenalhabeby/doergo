"use client"

import { useEffect, useMemo, useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useTranslation } from "react-i18next"
import { DELEGATION_MAX_DAYS, type StandInView } from "@hbcfield/shared/client"

import { approvalsApi } from "@/lib/api"
import { keys } from "@/lib/query-keys"
import { notify } from "@/lib/toast"
import { formatMediumDate } from "@/lib/format-date"
import { Button } from "@/components/ui/button"
import { DatePicker } from "@/components/ui/date-picker"
import { Combobox } from "@/components/ui/combobox"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"

const todayKey = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
}
const day = (k: string) => formatMediumDate(`${k}T12:00:00Z`)

/**
 * Stand-ins: hand your approvals to a colleague for some days, see who covers
 * whom, end one. What a stand-in may then decide is the server's (shared
 * `access/delegation.ts`); this only records who, to whom, which days.
 */
export function StandInDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const { data } = useQuery({ queryKey: keys.approvals.standIns(), queryFn: approvalsApi.standIns, enabled: open })

  const [toUserId, setTo] = useState("")
  const [fromUserId, setFrom] = useState("")
  const [startsOn, setStart] = useState(todayKey())
  const [endsOn, setEnd] = useState(todayKey())
  const [note, setNote] = useState("")
  useEffect(() => {
    if (!open) return
    setTo("")
    setFrom("")
    setStart(todayKey())
    setEnd(todayKey())
    setNote("")
  }, [open])

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
  const ready = !!toUserId && !!startsOn && !!endsOn && endsOn >= startsOn && !create.isPending

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg rounded-xl">
        <DialogHeader>
          <DialogTitle>{t("approvals.standIn.title")}</DialogTitle>
          <DialogDescription>{t("approvals.standIn.intro")}</DialogDescription>
        </DialogHeader>

        {data && !canFill && <p className="text-sm text-muted-foreground">{t("approvals.standIn.nothing")}</p>}

        {canFill && (
          <div className="space-y-3">
            {data!.mayArrange && (
              <div className="space-y-1.5">
                <Label>{t("approvals.standIn.whose")}</Label>
                <Combobox
                  value={fromUserId}
                  onChange={setFrom}
                  options={leaders}
                  placeholder={t("approvals.standIn.me")}
                />
              </div>
            )}
            <div className="space-y-1.5">
              <Label>{t("approvals.standIn.who")}</Label>
              <Combobox
                value={toUserId}
                onChange={setTo}
                options={people}
                placeholder={t("approvals.standIn.pickPerson")}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="stand-in-from">{t("approvals.standIn.firstDay")}</Label>
                <DatePicker id="stand-in-from" value={startsOn} min={todayKey()} onChange={setStart} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="stand-in-to">{t("approvals.standIn.lastDay")}</Label>
                <DatePicker id="stand-in-to" value={endsOn} min={startsOn} onChange={setEnd} />
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              {t("approvals.standIn.maxDays", { count: DELEGATION_MAX_DAYS })}
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

        {data && (
          <div className="space-y-4 border-t border-border pt-4">
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
      </DialogContent>
    </Dialog>
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
      <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{title}</p>
      <ul className="divide-y divide-border rounded-lg border border-border">
        {rows.map((r) => (
          <li key={r.id} className="flex items-center gap-3 px-3 py-2 text-sm">
            <div className="min-w-0 flex-1">
              <p className="truncate font-medium text-foreground">
                {show === "to" ? r.to.name : show === "from" ? r.from.name : `${r.from.name} → ${r.to.name}`}
              </p>
              <p className="text-xs text-muted-foreground">
                {r.active ? `${t("approvals.standIn.now")} · ` : ""}
                {t("approvals.standIn.from", { from: day(r.startsOn), to: day(r.endsOn) })}
                {r.note ? ` · ${r.note}` : ""}
              </p>
            </div>
            {r.canEnd && (
              <Button variant="outline" size="sm" className="rounded-lg" disabled={busy} onClick={() => onEnd(r.id)}>
                {t("approvals.standIn.end")}
              </Button>
            )}
          </li>
        ))}
      </ul>
    </div>
  )
}
