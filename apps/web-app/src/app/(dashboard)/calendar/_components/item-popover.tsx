"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useTranslation } from "react-i18next"
import { toast } from "sonner"
import { MEETING_PROVIDER_NAMES, meetingProvider, telHref, type CalendarItem } from "@hbcfield/shared/client"
import { Bell, Building2, CalendarClock, Check, Clock, ExternalLink, Flag, HelpCircle, MapPin, Navigation, Pencil, Phone, Trash2, Users, Video, X } from "lucide-react"
import { Popover, PopoverAnchor, PopoverContent } from "@/components/ui/popover"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { dateLocale } from "@/lib/format-date"
import { calendarApi, employeesApi } from "@/lib/api"
import { invalidateTimeOff } from "@/lib/query-keys"
import { Input } from "@/components/ui/input"
import { serverErrorMessage } from "@/lib/server-error"
import { KIND_COLOR } from "../_lib/kinds"
import { fromKey } from "../_lib/layout"

interface Props {
  item: CalendarItem | null
  anchor: HTMLElement | null
  onClose: () => void
  onEdit: (eventId: string) => void
  myId?: string
  /** May decide other people's leave (the approve route's permission; the server narrows it to whom they lead). */
  canDecideLeave?: boolean
  /** May open Schedule & Time Off — the only page a colleague's leave links to. */
  scheduleAccess?: boolean
}

function whenText(item: CalendarItem): string {
  const loc = dateLocale()
  if (item.allDay) {
    const s = fromKey(item.start), e = fromKey(item.end)
    const f = (d: Date) => d.toLocaleDateString(loc, { weekday: "short", day: "numeric", month: "short" })
    return item.start === item.end ? f(s) : `${f(s)} – ${f(e)}`
  }
  const s = new Date(item.start), e = new Date(item.end)
  return `${s.toLocaleDateString(loc, { weekday: "short", day: "numeric", month: "short" })} · ${s.toLocaleTimeString(loc, { hour: "2-digit", minute: "2-digit" })} – ${e.toLocaleTimeString(loc, { hour: "2-digit", minute: "2-digit" })}`
}

const RSVP = [
  { v: "ACCEPTED" as const, icon: Check, key: "calendar.rsvp.accept" },
  { v: "MAYBE" as const, icon: HelpCircle, key: "calendar.rsvp.maybe" },
  { v: "DECLINED" as const, icon: X, key: "calendar.rsvp.decline" },
]

/** The quick card for anything on the calendar — the full page is one click further. */
export function ItemPopover({ item, anchor, onClose, onEdit, myId, canDecideLeave, scheduleAccess }: Props) {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const eventId = item?.ref?.type === "event" ? item.ref.id : null
  const { data: ev } = useQuery({
    queryKey: ["calendar-event", eventId],
    queryFn: () => calendarApi.event(eventId!),
    enabled: !!eventId,
  })
  const respond = useMutation({
    mutationFn: (r: "ACCEPTED" | "MAYBE" | "DECLINED") => calendarApi.respond(eventId!, r),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["calendar"] })
      qc.invalidateQueries({ queryKey: ["calendar-event", eventId] })
    },
    onError: (e) => toast.error(serverErrorMessage(e, t)),
  })
  const cancel = useMutation({
    mutationFn: () => calendarApi.cancel(eventId!),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["calendar"] })
      toast.success(t("calendar.canceledToast"))
      onClose()
    },
    onError: (e) => toast.error(serverErrorMessage(e, t)),
  })

  const timeOffId = item?.ref?.type === "timeOff" ? item.ref.id : null
  const [declining, setDeclining] = useState(false)
  const [reason, setReason] = useState("")
  // A different leave is a different decision — never carry the last one's typing over.
  useEffect(() => { setDeclining(false); setReason("") }, [timeOffId])
  const decide = useMutation({
    mutationFn: ({ approved, why }: { approved: boolean; why?: string }) => employeesApi.approveTimeOff(timeOffId!, approved, why),
    onSuccess: (_, v) => {
      toast.success(v.approved ? t("cover.decision.approved", "Approved — they are told now") : t("cover.decision.rejected", "Not approved — they are told now"))
      invalidateTimeOff(qc)
      qc.invalidateQueries({ queryKey: ["calendar"] })
      qc.invalidateQueries({ queryKey: ["cover-range"] })
      qc.invalidateQueries({ queryKey: ["floor-now"] })
      onClose()
    },
    onError: (e) => toast.error(serverErrorMessage(e, t)),
  })

  if (!item || !anchor) return null
  const othersLeave = item.kind === "leave" && !!item.personId && item.personId !== myId
  const mayDecide = othersLeave && item.status === "PENDING" && !!canDecideLeave && !!timeOffId
  const leaveHref = item.kind !== "leave" ? null : othersLeave ? (scheduleAccess ? "/employees/availability" : null) : "/my/time-off"
  const color = KIND_COLOR[item.kind]
  const going = ev?.attendees.filter((a) => a.response === "ACCEPTED").length ?? 0

  return (
    <Popover open onOpenChange={(o) => !o && onClose()}>
      <PopoverAnchor virtualRef={{ current: anchor }} />
      <PopoverContent
        side="right"
        align="start"
        sideOffset={10}
        collisionPadding={16}
        className="w-[320px] rounded-2xl border-border/70 bg-popover/85 p-4 shadow-2xl backdrop-blur-xl"
      >
        <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider" style={{ color }}>
          <span className="h-2 w-2 rounded-[3px]" style={{ background: color }} />
          {t(`calendar.kind.${item.kind}`)}
          {item.kind === "holiday" && item.status === "ESTIMATED" && <span className="ml-1 rounded bg-amber-500/15 px-1.5 py-0.5 text-[10px] normal-case tracking-normal text-amber-600 dark:text-amber-300">{t("calendar.estimated")}</span>}
          {item.kind === "leave" && item.status === "PENDING" && <span className="ml-1 rounded bg-amber-500/15 px-1.5 py-0.5 text-[10px] normal-case tracking-normal text-amber-600 dark:text-amber-300">{t("calendar.requested")}</span>}
        </div>
        <h4 className="mt-2 text-base font-semibold leading-snug tracking-tight">{ev?.title ?? item.title}</h4>

        <div className="mt-3 space-y-2 text-[13px] text-muted-foreground">
          <div className="flex items-center gap-2.5"><Clock className="h-4 w-4 shrink-0" /><span className="text-foreground">{whenText(item)}</span></div>
          {item.kind === "leave" && item.note && (
            <div className="flex items-center gap-2.5"><Flag className="h-4 w-4 shrink-0" />{t(`calendar.leaveType.${item.note}`, item.note)}</div>
          )}
          {item.kind === "shift" && item.note && (
            <div className="flex items-center gap-2.5"><MapPin className="h-4 w-4 shrink-0" />{item.note}</div>
          )}
          {ev?.meetingMode === "IN_PERSON" && ev.placeKind === "OFFICE" && ev.placeSpace && (
            <div className="flex items-center gap-2.5"><Building2 className="h-4 w-4 shrink-0" /><span className="truncate text-foreground">{ev.placeSpace.name}{ev.room ? ` · ${ev.room}` : ""}</span></div>
          )}
          {(ev?.location || item.location) && ev?.meetingMode !== "PHONE" && (
            <div className="flex items-center gap-2.5"><MapPin className="h-4 w-4 shrink-0" /><span className="truncate text-foreground">{ev?.location ?? item.location}</span></div>
          )}
          {ev?.meetingMode === "ONLINE" && ev.meetingUrl && meetingProvider(ev.meetingUrl) && (
            <div className="flex items-center gap-2.5"><Video className="h-4 w-4 shrink-0" />{MEETING_PROVIDER_NAMES[meetingProvider(ev.meetingUrl)!]}</div>
          )}
          {ev?.meetingMode === "PHONE" && ev.phone && (
            <div className="flex items-center gap-2.5"><Phone className="h-4 w-4 shrink-0" /><span className="text-foreground">{ev.phone}</span><span>· {t(`calendar.call.${ev.callDirection ?? "OUTGOING"}`)}</span></div>
          )}
          {ev && ev.attendees.length > 1 && (
            <div className="flex items-start gap-2.5">
              <Users className="mt-0.5 h-4 w-4 shrink-0" />
              <div className="min-w-0 flex-1">
                <span className="text-foreground">{t("calendar.going", { count: going, total: ev.attendees.length })}</span>
                <div className="mt-1.5 flex flex-wrap gap-1">
                  {ev.attendees.map((a) => (
                    <span
                      key={a.userId}
                      title={`${a.firstName} ${a.lastName} · ${t(`calendar.rsvpState.${a.response}`)}`}
                      className={cn(
                        "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px]",
                        a.response === "ACCEPTED" && "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
                        a.response === "DECLINED" && "border-rose-500/30 text-muted-foreground line-through",
                        a.response === "MAYBE" && "border-amber-500/40 text-amber-700 dark:text-amber-300",
                      )}
                    >
                      {a.firstName}
                      {a.isOrganizer && <span className="text-[10px] opacity-70">· {t("calendar.organizer")}</span>}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          )}
          {ev?.reminders?.length ? (
            <div className="flex items-center gap-2.5"><Bell className="h-4 w-4 shrink-0" />{ev.reminders.map((m) => t("calendar.reminderBefore", { label: offsetLabel(m, t) })).join(", ")}</div>
          ) : null}
          {ev?.description && <p className="whitespace-pre-wrap border-t pt-2 text-[13px] text-foreground/90">{ev.description}</p>}
        </div>

        {ev?.meetingUrl && (
          <a href={ev.meetingUrl} target="_blank" rel="noopener noreferrer" className="mt-3 inline-flex">
            <Button size="sm" className="gap-1.5"><Video className="h-4 w-4" />{t("calendar.join")}</Button>
          </a>
        )}
        {ev?.meetingMode === "PHONE" && ev.phone && (
          <a href={telHref(ev.phone)} className="mt-3 inline-flex">
            <Button size="sm" className="gap-1.5"><Phone className="h-4 w-4" />{t("calendar.callNow")}</Button>
          </a>
        )}
        {ev?.meetingMode === "IN_PERSON" && ev.location && (
          <a href={`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(ev.location)}`} target="_blank" rel="noopener noreferrer" className="ml-2 mt-3 inline-flex">
            <Button size="sm" variant="outline" className="gap-1.5"><Navigation className="h-4 w-4" />{t("calendar.directions")}</Button>
          </a>
        )}

        {ev && !ev.canEdit && (
          <div className="mt-3 flex gap-1.5">
            {RSVP.map(({ v, icon: Icon, key }) => (
              <Button
                key={v}
                size="sm"
                variant={ev.myResponse === v ? "default" : "outline"}
                className="flex-1 gap-1"
                disabled={respond.isPending}
                onClick={() => respond.mutate(v)}
              >
                <Icon className="h-3.5 w-3.5" />{t(key)}
              </Button>
            ))}
          </div>
        )}

        {mayDecide && (
          <div className="mt-3 space-y-2">
            {declining && (
              <Input
                autoFocus
                value={reason}
                maxLength={500}
                onChange={(e) => setReason(e.target.value)}
                placeholder={t("calendar.declineReason")}
                className="h-8 text-[13px]"
              />
            )}
            <div className="flex gap-1.5">
              {declining ? (
                <>
                  <Button size="sm" variant="ghost" className="flex-1" disabled={decide.isPending} onClick={() => setDeclining(false)}>{t("common.cancel", "Cancel")}</Button>
                  <Button size="sm" variant="destructive" className="flex-1 gap-1" disabled={decide.isPending} onClick={() => decide.mutate({ approved: false, why: reason.trim() || undefined })}><X className="h-3.5 w-3.5" />{t("calendar.declineLeave")}</Button>
                </>
              ) : (
                <>
                  <Button size="sm" className="flex-1 gap-1" disabled={decide.isPending} onClick={() => decide.mutate({ approved: true })}><Check className="h-3.5 w-3.5" />{t("calendar.approveLeave")}</Button>
                  <Button size="sm" variant="outline" className="flex-1 gap-1" disabled={decide.isPending} onClick={() => setDeclining(true)}><X className="h-3.5 w-3.5" />{t("calendar.declineLeave")}</Button>
                </>
              )}
            </div>
          </div>
        )}

        <div className="mt-3 flex gap-2 border-t pt-3">
          {ev?.canEdit && (
            <>
              <Button size="sm" variant="outline" className="flex-1 gap-1.5" onClick={() => { onEdit(ev.id); onClose() }}><Pencil className="h-3.5 w-3.5" />{t("common.edit", "Edit")}</Button>
              <Button size="sm" variant="ghost" className="gap-1.5 text-destructive hover:text-destructive" disabled={cancel.isPending} onClick={() => cancel.mutate()}><Trash2 className="h-3.5 w-3.5" />{t("calendar.cancelEvent")}</Button>
            </>
          )}
          {item.ref?.type === "task" && <Link href={`/tasks/${item.ref.id}`} className="flex-1"><Button size="sm" className="w-full gap-1.5"><ExternalLink className="h-3.5 w-3.5" />{t("calendar.openJob")}</Button></Link>}
          {item.ref?.type === "customer" && <Link href={`/clients/${item.ref.id}`} className="flex-1"><Button size="sm" className="w-full gap-1.5"><ExternalLink className="h-3.5 w-3.5" />{t("calendar.openClient")}</Button></Link>}
          {item.ref?.type === "document" && <Link href="/documents" className="flex-1"><Button size="sm" variant="outline" className="w-full">{t("calendar.openDocuments")}</Button></Link>}
          {leaveHref && <Link href={leaveHref} className="flex-1"><Button size="sm" variant="outline" className="w-full gap-1.5"><CalendarClock className="h-3.5 w-3.5" />{t(othersLeave ? "calendar.openSchedule" : "calendar.openTimeOff")}</Button></Link>}
        </div>
      </PopoverContent>
    </Popover>
  )
}

export function offsetLabel(m: number, t: (k: string, o?: Record<string, unknown>) => string): string {
  if (m === 0) return t("calendar.atStart")
  if (m < 60) return t("calendar.minutes", { count: m })
  if (m < 1440) return t("calendar.hours", { count: m / 60 })
  if (m < 10080) return t("calendar.days", { count: m / 1440 })
  return t("calendar.weeks", { count: m / 10080 })
}
