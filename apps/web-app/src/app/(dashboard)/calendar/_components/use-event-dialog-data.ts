"use client"

import { keys } from "@/lib/query-keys"
import { useEffect, useMemo, useState } from "react"
import { useDebouncedValue } from "@/hooks/use-debounced-value"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { useTranslation } from "react-i18next"
import {
  cleanPhone,
  meetingProvider,
  type CallDirection,
  type MeetingMode,
  type PlaceKind,
  type RepeatFreq,
  type EventVisibility,
} from "@hbcfield/shared/client"
import { customersApi, type CalendarEventDetail, type CalendarPerson } from "@/lib/api"
import { useClientAddresses } from "@/hooks/use-client-addresses"
import { dayKey } from "../_lib/layout"

export interface Props {
  open: boolean
  onOpenChange: (o: boolean) => void
  /** Prefill a start (double-click on the grid). */
  start?: Date | null
  /** Edit an existing event. */
  event?: CalendarEventDetail | null
  spaceId?: string | null
  /** Workspaces the person works in — "our office" offers these. */
  offices?: { id: string; name: string }[]
  /** May name a client (CRM access). */
  crm?: boolean
  /** New › Job opens the existing New Task with this moment (shown only with canCreateTasks + Tasks). */
  onNewJob?: (at: Date) => void
  /** New › Time off opens the existing request on this day (shown only with the Time off module). */
  onTimeOff?: (day: string) => void
}

const pad = (n: number) => String(n).padStart(2, "0")

export const hm = (d: Date) => `${pad(d.getHours())}:${pad(d.getMinutes())}`

export function at(date: string, time: string): Date {
  const [y, m, d] = date.split("-").map(Number)
  const [h, mi] = time.split(":").map(Number)
  return new Date(y!, m! - 1, d!, h ?? 0, mi ?? 0)
}

function roundUp(d: Date): Date {
  const x = new Date(d)
  x.setMinutes(Math.ceil((x.getMinutes() + 1) / 30) * 30, 0, 0)
  return x
}

/** useEventDialog's state and handlers — everything before its markup, moved here unchanged. */
export function useEventDialogData(
  {
    open,
    onOpenChange,
    start,
    event,
    spaceId,
    offices = [],
    crm = false,
    onNewJob,
    onTimeOff
  }: Pick<Pick<Props, 'open' | 'onOpenChange' | 'start' | 'event' | 'spaceId' | 'offices' | 'crm' | 'onNewJob' | 'onTimeOff'>,
    | 'open'
    | 'onOpenChange'
    | 'start'
    | 'event'
    | 'spaceId'
    | 'offices'
    | 'crm'
    | 'onNewJob'
    | 'onTimeOff'
  >) {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const editing = !!event
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone

  const [kind, setKind] = useState<"APPOINTMENT" | "REMINDER">("APPOINTMENT")
  const [title, setTitle] = useState("")
  const [allDay, setAllDay] = useState(false)
  const [date, setDate] = useState(dayKey(new Date()))
  const [time, setTime] = useState("09:00")
  // The end, as a day and a time. All-day uses the day alone (inclusive).
  const [endDate, setEndDate] = useState(dayKey(new Date()))
  const [endTime, setEndTime] = useState("09:30")
  const [meetingUrl, setMeetingUrl] = useState("")
  const [location, setLocation] = useState("")
  const [description, setDescription] = useState("")
  const [people, setPeople] = useState<CalendarPerson[]>([])
  const [reminders, setReminders] = useState<number[]>([10])
  const [freq, setFreq] = useState<RepeatFreq | "NONE">("NONE")
  const [visibility, setVisibility] = useState<EventVisibility>("BUSY")
  const [pickOpen, setPickOpen] = useState(false)
  const [q, setQ] = useState("")
  const debouncedQ = useDebouncedValue(q, 300)
  // How and where (shared calendar/meeting.ts — the server keeps only what the mode uses).
  const [mode, setMode] = useState<MeetingMode>("IN_PERSON")
  const [place, setPlace] = useState<PlaceKind>("OFFICE")
  const [placeSpaceId, setPlaceSpaceId] = useState<string>("")
  const [room, setRoom] = useState("")
  const [phone, setPhone] = useState("")
  const [callDirection, setCallDirection] = useState<CallDirection>("OUTGOING")
  const [customer, setCustomer] = useState<{ id: string; name: string; address?: string | null; phone?: string | null } | null>(null)
  const [clientQ, setClientQ] = useState("")
  const [clientOpen, setClientOpen] = useState(false)
  const [addressId, setAddressId] = useState("")

  // Fill from the event being edited, or from where the grid was double-clicked.
  useEffect(() => {
    if (!open) return
    if (event) {
      const s = new Date(event.startAt), e = new Date(event.endAt)
      setKind(event.kind); setTitle(event.title); setAllDay(event.allDay)
      setDate(dayKey(s)); setTime(hm(s))
      setEndDate(
        dayKey(
          event.allDay
            ? new Date(e.getTime() - 1)
            : e)); setEndTime(hm(e)); setMeetingUrl(event.meetingUrl ?? ""); setLocation(event.location ?? "")
      setDescription(event.description ?? ""); setReminders(event.reminders); setFreq(event.repeat?.freq ?? "NONE")
      setVisibility(event.visibility)
      setMode(event.meetingMode ?? (event.meetingUrl ? "ONLINE" : "IN_PERSON"))
      setPlace(event.placeKind ?? (event.meetingMode ? "OFFICE" : "ADDRESS"))
      setPlaceSpaceId(event.placeSpace?.id ?? ""); setRoom(event.room ?? ""); setPhone(event.phone ?? "")
      setCallDirection(event.callDirection ?? "OUTGOING"); setCustomer(event.customer ?? null); setAddressId("")
      setPeople(
        event.attendees.filter((a) => !a.isOrganizer).map((a) => ({
          id: a.userId,
          firstName: a.firstName,
          lastName: a.lastName,
          avatarUrl: a.avatarUrl
        })))
    } else {
      const s = start ?? roundUp(new Date())
      const e = new Date(s.getTime() + 30 * 60000)
      setKind("APPOINTMENT"); setTitle(""); setAllDay(false); setDate(dayKey(s)); setTime(hm(s))
      setEndDate(dayKey(e)); setEndTime(hm(e)); setMeetingUrl(""); setLocation(""); setDescription(""); setPeople([]); setReminders([10])
      setFreq("NONE"); setVisibility("BUSY")
      // A new appointment starts "in person at our office" — the workspace on screen, else the first.
      const office = offices.find((o) => o.id === spaceId) ?? offices[0]
      setMode("IN_PERSON"); setPlace(office ? "OFFICE" : "ADDRESS"); setPlaceSpaceId(office?.id ?? "")
      setRoom(""); setPhone(""); setCallDirection("OUTGOING"); setCustomer(null); setAddressId("")
    }
  }, [open, event, start]) // eslint-disable-line react-hooks/exhaustive-deps -- offices/spaceId seed a NEW form only

  const { data: clientPage } = useQuery({
    queryKey: keys.customers.list({ search: clientQ || undefined, includeUnfiled: true, limit: 20 }),
    queryFn: () => customersApi.list({ search: clientQ || undefined, includeUnfiled: true, limit: 20 }),
    enabled: open && crm && clientOpen,
    staleTime: 60_000,
  })
  const {
    options: clientAddresses
  } = useClientAddresses(customer?.id ?? null, { enabled: open && crm && place === "CLIENT_SITE", known: customer })
  // The client's address is chosen for you when there is only one it could be.
  useEffect(() => {
    if (place !== "CLIENT_SITE" || addressId || !clientAddresses.length) return
    const pick = clientAddresses.find((a) => a.isPrimary) ?? (clientAddresses.length === 1 ? clientAddresses[0] : null)
    if (pick) { setAddressId(pick.id); setLocation(pick.address ?? pick.name) }
  }, [place, addressId, clientAddresses])
  const provider = meetingProvider(meetingUrl.trim())
  const phoneOk = !phone.trim() || !!cleanPhone(phone)

  const startAt = useMemo(() => at(date, time), [date, time])
  const endAt = useMemo(() => at(endDate, endTime), [endDate, endTime])

  return {
    t,
    qc,
    editing,
    tz,
    kind,
    setKind,
    title,
    setTitle,
    allDay,
    setAllDay,
    date,
    setDate,
    time,
    setTime,
    endDate,
    setEndDate,
    endTime,
    setEndTime,
    meetingUrl,
    setMeetingUrl,
    location,
    setLocation,
    description,
    setDescription,
    people,
    setPeople,
    reminders,
    setReminders,
    freq,
    setFreq,
    visibility,
    setVisibility,
    pickOpen,
    setPickOpen,
    q,
    setQ,
    debouncedQ,
    mode,
    setMode,
    place,
    setPlace,
    placeSpaceId,
    setPlaceSpaceId,
    room,
    setRoom,
    phone,
    setPhone,
    callDirection,
    setCallDirection,
    customer,
    setCustomer,
    clientQ,
    setClientQ,
    clientOpen,
    setClientOpen,
    addressId,
    setAddressId,
    clientPage,
    clientAddresses,
    provider,
    phoneOk,
    startAt,
    endAt,
  }
}
