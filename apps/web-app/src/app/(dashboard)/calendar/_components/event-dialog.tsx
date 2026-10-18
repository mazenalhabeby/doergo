"use client"

import { Dialog } from "@/components/ui/dialog";
import { useEventDialog, type Props } from "./use-event-dialog";
import { EventDialogEditTitle } from "./event-dialog-edit-title"

/** One form for an appointment or a reminder: a start and an end, the duration follows. */
export function EventDialog({ open, onOpenChange, start, event, spaceId, offices = [], crm = false, onNewJob, onTimeOff }: Props) {
  const vm = useEventDialog({ open, onOpenChange, start, event, spaceId, offices, crm, onNewJob, onTimeOff })
  const {
    t,
    editing,
    kind,
    setKind,
    title,
    setTitle,
    allDay,
    setAllDay,
    date,
    setDate,
    time,
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
    freq,
    setFreq,
    visibility,
    setVisibility,
    pickOpen,
    setPickOpen,
    q,
    setQ,
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
    duration,
    problem,
    setStart,
    candidates,
    windowFrom,
    windowTo,
    ids,
    avail,
    clashes,
    findTime,
    save,
    toggleReminder,
    fmtTime,
  } = vm

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <EventDialogEditTitle vm={vm} onTimeOff={onTimeOff} onOpenChange={onOpenChange} onNewJob={onNewJob} crm={crm} offices={offices} />
    </Dialog>
  )
}
