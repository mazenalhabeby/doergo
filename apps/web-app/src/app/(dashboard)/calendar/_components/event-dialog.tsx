"use client"

import { useTranslation } from "react-i18next"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { useEventDialog } from "./use-event-dialog"
import type { EventDialogProps } from "./use-event-form"
import { EventKindTabs } from "./event-kind-tabs"
import { EventWhenFields } from "./event-when-fields"
import { EventMeetingFields } from "./event-meeting-fields"
import { EventInvitees } from "./event-invitees"
import { EventClashes } from "./event-clashes"
import { EventRemindRepeat } from "./event-remind-repeat"

/** One form for an appointment or a reminder: a start and an end, the duration follows. */
export function EventDialog({
  open,
  onOpenChange,
  start,
  event,
  spaceId,
  offices = [],
  crm = false,
  onNewJob,
  onTimeOff,
}: EventDialogProps) {
  const { t } = useTranslation()
  const s = useEventDialog({ open, onOpenChange, start, event, spaceId, offices, crm })
  const {
    editing,
    kind,
    title,
    setTitle,
    description,
    setDescription,
    ids,
    save,
    mode,
    phoneOk,
    place,
    customer,
    location,
  } = s

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] gap-0 p-0 sm:min-w-[32rem]">
        <DialogHeader className="px-6 pb-0 pt-5">
          <DialogTitle className="text-lg tracking-tight">
            {editing ? t("calendar.editTitle") : t("calendar.newTitle")}
          </DialogTitle>
          <DialogDescription className="sr-only">{t("calendar.newHint")}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4 overflow-y-auto px-6 py-4">
          <EventKindTabs
            editing={editing}
            kind={kind}
            setKind={s.setKind}
            date={s.date}
            allDay={s.allDay}
            startAt={s.startAt}
            onOpenChange={onOpenChange}
            onTimeOff={onTimeOff}
            onNewJob={onNewJob}
          />

          <div className="space-y-1.5">
            <Label htmlFor="cal-title">{t("calendar.titleLabel")}</Label>
            <Input
              id="cal-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={140}
              placeholder={t("calendar.titlePlaceholder")}
            />
          </div>

          <EventWhenFields
            allDay={s.allDay}
            setAllDay={s.setAllDay}
            date={s.date}
            setDate={s.setDate}
            endDate={s.endDate}
            setEndDate={s.setEndDate}
            time={s.time}
            endTime={s.endTime}
            setEndTime={s.setEndTime}
            setStart={s.setStart}
            problem={s.problem}
            duration={s.duration}
          />

          {kind === "APPOINTMENT" && (
            <EventMeetingFields
              open={open}
              crm={crm}
              offices={offices}
              clientOpen={s.clientOpen}
              setClientOpen={s.setClientOpen}
              customer={customer}
              setCustomer={s.setCustomer}
              setAddressId={s.setAddressId}
              place={place}
              setLocation={s.setLocation}
              clientQ={s.clientQ}
              setClientQ={s.setClientQ}
              phone={s.phone}
              setPhone={s.setPhone}
              mode={mode}
              setMode={s.setMode}
              setPlace={s.setPlace}
              placeSpaceId={s.placeSpaceId}
              setPlaceSpaceId={s.setPlaceSpaceId}
              room={s.room}
              setRoom={s.setRoom}
              clientAddresses={s.clientAddresses}
              addressId={s.addressId}
              location={location}
              meetingUrl={s.meetingUrl}
              setMeetingUrl={s.setMeetingUrl}
              provider={s.provider}
              phoneOk={phoneOk}
              callDirection={s.callDirection}
              setCallDirection={s.setCallDirection}
            />
          )}

          {/* Invite */}
          <EventInvitees
            ids={ids}
            allDay={s.allDay}
            findTime={s.findTime}
            people={s.people}
            avail={s.avail}
            date={s.date}
            endAt={s.endAt}
            startAt={s.startAt}
            windowTo={s.windowTo}
            windowFrom={s.windowFrom}
            setPeople={s.setPeople}
            pickOpen={s.pickOpen}
            setPickOpen={s.setPickOpen}
            q={s.q}
            setQ={s.setQ}
          />

          <EventClashes clashes={s.clashes} findTime={s.findTime} setStart={s.setStart} />

          <EventRemindRepeat
            reminders={s.reminders}
            setReminders={s.setReminders}
            freq={s.freq}
            setFreq={s.setFreq}
            visibility={s.visibility}
            setVisibility={s.setVisibility}
          />

          <div className="space-y-1.5">
            <Label htmlFor="cal-notes">{t("calendar.notes")}</Label>
            <Textarea
              id="cal-notes"
              rows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              maxLength={2000}
            />
          </div>
        </div>

        <DialogFooter className="items-center gap-2 border-t bg-muted/20 px-6 py-3 sm:justify-between">
          <span className="hidden text-xs text-muted-foreground sm:block">
            {ids.length ? t("calendar.inviteeNote") : " "}
          </span>
          <div className="flex gap-2">
            <Button variant="ghost" onClick={() => onOpenChange(false)}>
              {t("common.cancel", "Cancel")}
            </Button>
            <Button
              disabled={
                !title.trim() ||
                !!s.problem ||
                save.isPending ||
                (kind === "APPOINTMENT" && mode === "PHONE" && !phoneOk) ||
                (kind === "APPOINTMENT" &&
                  mode === "IN_PERSON" &&
                  place === "CLIENT_SITE" &&
                  (!customer || !location.trim()))
              }
              onClick={() => save.mutate()}
            >
              {editing ? t("calendar.save") : ids.length ? t("calendar.saveAndInvite") : t("calendar.save")}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
