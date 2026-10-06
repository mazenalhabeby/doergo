"use client"

import Link from "next/link"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useTranslation } from "react-i18next"
import { toast } from "sonner"
import type { CalendarItem } from "@hbcfield/shared/client"
import { Bell, CalendarClock, Check, Clock, ExternalLink, Flag, HelpCircle, MapPin, Pencil, Trash2, Users, Video, X } from "lucide-react"
import { Popover, PopoverAnchor, PopoverContent } from "@/components/ui/popover"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { dateLocale } from "@/lib/format-date"
import { calendarApi } from "@/lib/api"
import { serverErrorMessage } from "@/lib/server-error"
import { KIND_COLOR } from "../_lib/kinds"
import { fromKey } from "../_lib/layout"

interface Props {
  item: CalendarItem | null
  anchor: HTMLElement | null
  onClose: () => void
  onEdit: (eventId: string) => void
  myId?: string
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
export function ItemPopover({ item, anchor, onClose, onEdit, myId }: Props) {
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

  if (!item || !anchor) return null
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
          {(ev?.location || item.location) && (
            <div className="flex items-center gap-2.5"><MapPin className="h-4 w-4 shrink-0" /><span className="truncate text-foreground">{ev?.location ?? item.location}</span></div>
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
          {item.kind === "leave" && <Link href={item.personId && item.personId !== myId ? "/employees/availability" : "/my/time-off"} className="flex-1"><Button size="sm" variant="outline" className="w-full gap-1.5"><CalendarClock className="h-3.5 w-3.5" />{t("calendar.openTimeOff")}</Button></Link>}
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
