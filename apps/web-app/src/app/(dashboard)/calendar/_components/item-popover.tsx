"use client"

import Link from "next/link"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useTranslation } from "react-i18next"
import { toast } from "sonner"
import { MEETING_PROVIDER_NAMES, meetingProvider, telHref, type CalendarItem } from "@hbcfield/shared/client"
import {
  Bell,
  Building2,
  CalendarClock,
  Check,
  Clock,
  ExternalLink,
  Flag,
  HelpCircle,
  MapPin,
  Navigation,
  Pencil,
  Phone,
  Trash2,
  Video,
  X,
} from "lucide-react"
import { Popover, PopoverAnchor, PopoverContent } from "@/components/ui/popover"
import { Button } from "@/components/ui/button"
import { Chip } from "@/components/page/page-kit"
import { calendarApi } from "@/lib/api"
import { keys } from "@/lib/query-keys"
import { serverErrorMessage } from "@/lib/server-error"
import { KIND_COLOR } from "../_lib/kinds"
import { Inbox } from "lucide-react"
import { offsetLabel, whenText } from "../_lib/item-text"
import { ItemAttendees } from "./item-attendees"

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
    queryKey: keys.calendar.event(eventId),
    queryFn: () => calendarApi.event(eventId!),
    enabled: !!eventId,
  })
  const respond = useMutation({
    mutationFn: (r: "ACCEPTED" | "MAYBE" | "DECLINED") => calendarApi.respond(eventId!, r),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: keys.calendar.all() })
      qc.invalidateQueries({ queryKey: keys.calendar.event(eventId) })
    },
    onError: (e) => toast.error(serverErrorMessage(e, t)),
  })
  const cancel = useMutation({
    mutationFn: () => calendarApi.cancel(eventId!),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: keys.calendar.all() })
      toast.success(t("calendar.canceledToast"))
      onClose()
    },
    onError: (e) => toast.error(serverErrorMessage(e, t)),
  })

  const timeOffId = item?.ref?.type === "timeOff" ? item.ref.id : null
  if (!item || !anchor) return null
  const othersLeave = item.kind === "leave" && !!item.personId && item.personId !== myId
  const mayDecide = othersLeave && item.status === "PENDING" && !!canDecideLeave && !!timeOffId
  const leaveHref = item.kind !== "leave" ? null : othersLeave ? (scheduleAccess ? "/schedule" : null) : "/my/time-off"
  const color = KIND_COLOR[item.kind]

  return (
    <Popover open onOpenChange={(o) => !o && onClose()}>
      <PopoverAnchor virtualRef={{ current: anchor }} />
      <PopoverContent
        side="right"
        align="start"
        sideOffset={10}
        collisionPadding={16}
        className="w-[320px] rounded-[22px] border-border bg-card/95 p-4 shadow-shell-pop backdrop-blur-xl"
      >
        <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider" style={{ color }}>
          <span className="h-2 w-2 rounded-[3px]" style={{ background: color }} />
          {t(`calendar.kind.${item.kind}`)}
          {item.kind === "holiday" && item.status === "ESTIMATED" && (
            <Chip tone="warn" className="ml-1 h-5 px-2 text-[10.5px] normal-case tracking-normal">
              {t("calendar.estimated")}
            </Chip>
          )}
          {item.kind === "leave" && item.status === "PENDING" && (
            <Chip tone="warn" className="ml-1 h-5 px-2 text-[10.5px] normal-case tracking-normal">
              {t("calendar.requested")}
            </Chip>
          )}
        </div>
        <h4 className="mt-2 text-base font-semibold leading-snug tracking-tight">{ev?.title ?? item.title}</h4>

        <div className="mt-3 space-y-2 text-[13px] text-muted-foreground">
          <div className="flex items-center gap-2.5">
            <Clock className="h-4 w-4 shrink-0" />
            <span className="text-foreground">{whenText(item)}</span>
          </div>
          {item.kind === "leave" && item.note && (
            <div className="flex items-center gap-2.5">
              <Flag className="h-4 w-4 shrink-0" />
              {t(`calendar.leaveType.${item.note}`, item.note)}
            </div>
          )}
          {item.kind === "shift" && item.note && (
            <div className="flex items-center gap-2.5">
              <MapPin className="h-4 w-4 shrink-0" />
              {item.note}
            </div>
          )}
          {ev?.meetingMode === "IN_PERSON" && ev.placeKind === "OFFICE" && ev.placeSpace && (
            <div className="flex items-center gap-2.5">
              <Building2 className="h-4 w-4 shrink-0" />
              <span className="truncate text-foreground">
                {ev.placeSpace.name}
                {ev.room ? ` · ${ev.room}` : ""}
              </span>
            </div>
          )}
          {(ev?.location || item.location) && ev?.meetingMode !== "PHONE" && (
            <div className="flex items-center gap-2.5">
              <MapPin className="h-4 w-4 shrink-0" />
              <span className="truncate text-foreground">{ev?.location ?? item.location}</span>
            </div>
          )}
          {ev?.meetingMode === "ONLINE" && ev.meetingUrl && meetingProvider(ev.meetingUrl) && (
            <div className="flex items-center gap-2.5">
              <Video className="h-4 w-4 shrink-0" />
              {MEETING_PROVIDER_NAMES[meetingProvider(ev.meetingUrl)!]}
            </div>
          )}
          {ev?.meetingMode === "PHONE" && ev.phone && (
            <div className="flex items-center gap-2.5">
              <Phone className="h-4 w-4 shrink-0" />
              <span className="text-foreground">{ev.phone}</span>
              <span>· {t(`calendar.call.${ev.callDirection ?? "OUTGOING"}`)}</span>
            </div>
          )}
          {ev && ev.attendees.length > 1 && <ItemAttendees attendees={ev.attendees} />}
          {ev?.reminders?.length ? (
            <div className="flex items-center gap-2.5">
              <Bell className="h-4 w-4 shrink-0" />
              {ev.reminders.map((m) => t("calendar.reminderBefore", { label: offsetLabel(m, t) })).join(", ")}
            </div>
          ) : null}
          {ev?.description && (
            <p className="whitespace-pre-wrap border-t border-border pt-2 text-[13px] text-foreground/90">
              {ev.description}
            </p>
          )}
        </div>

        {ev?.meetingUrl && (
          <a href={ev.meetingUrl} target="_blank" rel="noopener noreferrer" className="mt-3 inline-flex">
            <Button size="sm" className="gap-1.5 rounded-full">
              <Video className="h-4 w-4" />
              {t("calendar.join")}
            </Button>
          </a>
        )}
        {ev?.meetingMode === "PHONE" && ev.phone && (
          <a href={telHref(ev.phone)} className="mt-3 inline-flex">
            <Button size="sm" className="gap-1.5 rounded-full">
              <Phone className="h-4 w-4" />
              {t("calendar.callNow")}
            </Button>
          </a>
        )}
        {ev?.meetingMode === "IN_PERSON" && ev.location && (
          <a
            href={`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(ev.location)}`}
            target="_blank"
            rel="noopener noreferrer"
            className="ml-2 mt-3 inline-flex"
          >
            <Button size="sm" variant="outline" className="gap-1.5 rounded-full">
              <Navigation className="h-4 w-4" />
              {t("calendar.directions")}
            </Button>
          </a>
        )}

        {ev && !ev.canEdit && (
          <div className="mt-3 flex gap-1.5">
            {RSVP.map(({ v, icon: Icon, key }) => (
              <Button
                key={v}
                size="sm"
                variant={ev.myResponse === v ? "default" : "outline"}
                className="flex-1 gap-1 rounded-full"
                disabled={respond.isPending}
                onClick={() => respond.mutate(v)}
              >
                <Icon className="h-3.5 w-3.5" />
                {t(key)}
              </Button>
            ))}
          </div>
        )}

        {/* Leave is decided in Approvals — the one place. */}
        {mayDecide && (
          <Button asChild size="sm" className="mt-3 w-full gap-1 rounded-full">
            <Link href={`/approvals?kind=request&id=${encodeURIComponent(timeOffId!)}`}>
              <Inbox className="h-3.5 w-3.5" />
              {t("approvals.decideInApprovals")}
            </Link>
          </Button>
        )}

        <div className="mt-3 flex gap-2 border-t border-border pt-3">
          {ev?.canEdit && (
            <>
              <Button
                size="sm"
                variant="outline"
                className="flex-1 gap-1.5 rounded-full"
                onClick={() => {
                  onEdit(ev.id)
                  onClose()
                }}
              >
                <Pencil className="h-3.5 w-3.5" />
                {t("common.edit", "Edit")}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="gap-1.5 rounded-full text-destructive hover:text-destructive"
                disabled={cancel.isPending}
                onClick={() => cancel.mutate()}
              >
                <Trash2 className="h-3.5 w-3.5" />
                {t("calendar.cancelEvent")}
              </Button>
            </>
          )}
          {item.ref?.type === "task" && (
            <Link href={`/tasks/${item.ref.id}`} className="flex-1">
              <Button size="sm" className="w-full gap-1.5 rounded-full">
                <ExternalLink className="h-3.5 w-3.5" />
                {t("calendar.openJob")}
              </Button>
            </Link>
          )}
          {item.ref?.type === "customer" && (
            <Link href={`/clients/${item.ref.id}`} className="flex-1">
              <Button size="sm" className="w-full gap-1.5 rounded-full">
                <ExternalLink className="h-3.5 w-3.5" />
                {t("calendar.openClient")}
              </Button>
            </Link>
          )}
          {item.ref?.type === "document" && (
            <Link href="/documents" className="flex-1">
              <Button size="sm" variant="outline" className="w-full rounded-full">
                {t("calendar.openDocuments")}
              </Button>
            </Link>
          )}
          {leaveHref && (
            <Link href={leaveHref} className="flex-1">
              <Button size="sm" variant="outline" className="w-full gap-1.5 rounded-full">
                <CalendarClock className="h-3.5 w-3.5" />
                {t(othersLeave ? "calendar.openSchedule" : "calendar.openTimeOff")}
              </Button>
            </Link>
          )}
        </div>
      </PopoverContent>
    </Popover>
  )
}
