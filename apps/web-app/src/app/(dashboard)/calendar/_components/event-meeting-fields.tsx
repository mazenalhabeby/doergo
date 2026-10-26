"use client"
// size-exempt: one form for an appointment's client and its how/where; the three modes share their state.

import { useTranslation } from "react-i18next"
import { MEETING_PROVIDER_NAMES } from "@hbcfield/shared/client"
import { Building2, Link2, MapPin, Phone, Video, X } from "lucide-react"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command"
import { cn } from "@/lib/utils"

import type { EventDialogProps, EventForm } from "./use-event-form"
import { useClients } from "@/hooks/use-clients"

/** An appointment's client and its how and where: in person (office, client site, address), online, by phone. */
export function EventMeetingFields({
  open,
  crm,
  offices,
  clientOpen,
  setClientOpen,
  customer,
  setCustomer,
  setAddressId,
  place,
  setLocation,
  clientQ,
  setClientQ,
  phone,
  setPhone,
  mode,
  setMode,
  setPlace,
  placeSpaceId,
  setPlaceSpaceId,
  room,
  setRoom,
  clientAddresses,
  addressId,
  location,
  meetingUrl,
  setMeetingUrl,
  provider,
  phoneOk,
  callDirection,
  setCallDirection,
}: Pick<
  EventForm,
  | "clientOpen"
  | "setClientOpen"
  | "customer"
  | "setCustomer"
  | "setAddressId"
  | "place"
  | "setLocation"
  | "clientQ"
  | "setClientQ"
  | "phone"
  | "setPhone"
  | "mode"
  | "setMode"
  | "setPlace"
  | "placeSpaceId"
  | "setPlaceSpaceId"
  | "room"
  | "setRoom"
  | "clientAddresses"
  | "addressId"
  | "location"
  | "meetingUrl"
  | "setMeetingUrl"
  | "provider"
  | "phoneOk"
  | "callDirection"
  | "setCallDirection"
> & { open: boolean; crm: boolean; offices: NonNullable<EventDialogProps["offices"]> }) {
  const { t } = useTranslation()
  const { data: clientPage } = useClients(
    { search: clientQ || undefined, includeUnfiled: true, limit: 20 },
    { enabled: open && crm && clientOpen },
  )
  return (
    <div className="space-y-3">
      {crm && (
        <div className="space-y-1.5">
          <Label>{t("calendar.client")}</Label>
          <Popover open={clientOpen} onOpenChange={setClientOpen}>
            <PopoverTrigger asChild>
              <button
                type="button"
                className={
                  "flex h-10 w-full items-center gap-2 rounded-md border border-input " +
                  "bg-background px-3 text-left text-sm"
                }
              >
                <Building2 className="h-4 w-4 text-muted-foreground" />
                <span className={cn("flex-1 truncate", !customer && "text-muted-foreground")}>
                  {customer?.name ?? t("calendar.clientNone")}
                </span>
                {customer && (
                  <X
                    className="h-4 w-4 text-muted-foreground"
                    onClick={(e) => {
                      e.stopPropagation()
                      setCustomer(null)
                      setAddressId("")
                      if (place === "CLIENT_SITE") setLocation("")
                    }}
                  />
                )}
              </button>
            </PopoverTrigger>
            <PopoverContent className="w-80 p-0" align="start">
              <Command shouldFilter={false}>
                <CommandInput value={clientQ} onValueChange={setClientQ} placeholder={t("calendar.clientSearch")} />
                <CommandList>
                  <CommandEmpty>{t("calendar.noClients")}</CommandEmpty>
                  <CommandGroup>
                    {(clientPage?.data ?? []).map((c) => (
                      <CommandItem
                        key={c.id}
                        value={c.id}
                        onSelect={() => {
                          setCustomer({
                            id: c.id,
                            name: c.name,
                            address: c.address ?? null,
                            phone: (c as { phone?: string | null }).phone ?? null,
                          })
                          setAddressId("")
                          setClientOpen(false)
                          setClientQ("")
                          if (!phone.trim() && (c as { phone?: string | null }).phone)
                            setPhone((c as { phone?: string | null }).phone!)
                        }}
                      >
                        <span className="truncate">{c.name}</span>
                      </CommandItem>
                    ))}
                  </CommandGroup>
                </CommandList>
              </Command>
            </PopoverContent>
          </Popover>
        </div>
      )}

      <div className="space-y-2">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          {t("calendar.how")}
        </span>
        <div role="tablist" className="grid grid-cols-3 gap-0.5 rounded-full bg-shell-chip p-1">
          {(
            [
              ["IN_PERSON", MapPin],
              ["ONLINE", Video],
              ["PHONE", Phone],
            ] as const
          ).map(([m, Icon]) => (
            <button
              key={m}
              type="button"
              role="tab"
              aria-selected={mode === m}
              onClick={() => setMode(m)}
              className={cn(
                "inline-flex h-8 items-center justify-center gap-1.5 rounded-full px-2 " +
                  "text-[13.5px] font-medium text-muted-foreground transition",
                mode === m && "bg-card font-semibold text-foreground shadow-shell",
              )}
            >
              <Icon className="h-4 w-4" />
              {t(`calendar.mode.${m}`)}
            </button>
          ))}
        </div>

        {mode === "IN_PERSON" && (
          <div className="space-y-2.5">
            <div className="flex flex-wrap gap-1.5">
              {(["OFFICE", "CLIENT_SITE", "ADDRESS"] as const)
                .filter((k) => (k !== "OFFICE" || offices.length > 0) && (k !== "CLIENT_SITE" || crm))
                .map((k) => (
                  <button
                    key={k}
                    type="button"
                    aria-pressed={place === k}
                    onClick={() => {
                      setPlace(k)
                      if (k !== place) {
                        setLocation("")
                        setAddressId("")
                      }
                    }}
                    className={cn(
                      "rounded-full border px-3 py-1 text-xs transition",
                      place === k
                        ? "border-primary/50 bg-primary/10 text-primary"
                        : "text-muted-foreground hover:bg-accent",
                    )}
                  >
                    {t(`calendar.place.${k}`)}
                  </button>
                ))}
            </div>
            {place === "OFFICE" && (
              <div className="grid gap-3 sm:grid-cols-[1fr_200px]">
                <select
                  aria-label={t("calendar.place.OFFICE")}
                  value={placeSpaceId}
                  onChange={(e) => setPlaceSpaceId(e.target.value)}
                  className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                >
                  {offices.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.name}
                    </option>
                  ))}
                </select>
                <Input
                  value={room}
                  onChange={(e) => setRoom(e.target.value)}
                  maxLength={80}
                  placeholder={t("calendar.roomPlaceholder")}
                  aria-label={t("calendar.room")}
                />
                <p className="text-xs text-muted-foreground sm:col-span-2">{t("calendar.officeAddressAuto")}</p>
              </div>
            )}
            {place === "CLIENT_SITE" &&
              (!customer ? (
                <p className="text-xs text-shell-warn">{t("calendar.pickClientFirst")}</p>
              ) : clientAddresses.length > 0 ? (
                <select
                  aria-label={t("calendar.whichAddress")}
                  value={addressId}
                  onChange={(e) => {
                    const a = clientAddresses.find((x) => x.id === e.target.value)
                    setAddressId(e.target.value)
                    setLocation(a?.address ?? a?.name ?? "")
                  }}
                  className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                >
                  <option value="" disabled>
                    {t("calendar.whichAddress")}
                  </option>
                  {clientAddresses.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                      {a.address && a.address !== a.name ? ` · ${a.address}` : ""}
                    </option>
                  ))}
                </select>
              ) : (
                <Input
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                  maxLength={200}
                  placeholder={t("calendar.addressPlaceholder")}
                  aria-label={t("calendar.where")}
                />
              ))}
            {place === "ADDRESS" && (
              <Input
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                maxLength={200}
                placeholder={t("calendar.addressPlaceholder")}
                aria-label={t("calendar.where")}
              />
            )}
          </div>
        )}

        {mode === "ONLINE" && (
          <div className="space-y-1.5">
            <div className="relative">
              <Link2 className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={meetingUrl}
                onChange={(e) => setMeetingUrl(e.target.value)}
                placeholder="https://teams.microsoft.com/…"
                inputMode="url"
                className="pl-9"
                aria-label={t("calendar.meetingLink")}
              />
            </div>
            {provider && (
              <span
                className={
                  "inline-flex rounded-full bg-shell-accent-soft px-2.5 py-0.5 text-xs " +
                  "font-medium text-shell-accent"
                }
              >
                {t("calendar.linkRecognised", { name: MEETING_PROVIDER_NAMES[provider] })}
              </span>
            )}
          </div>
        )}

        {mode === "PHONE" && (
          <div className="space-y-2">
            <Input
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              inputMode="tel"
              maxLength={30}
              placeholder="+43 1 234 5678"
              aria-label={t("calendar.phone")}
              aria-invalid={!phoneOk}
              className={cn(!phoneOk && "border-destructive")}
            />
            {!phoneOk && <p className="text-xs text-destructive">{t("calendar.phoneInvalid")}</p>}
            <div className="flex gap-1.5">
              {(["OUTGOING", "INCOMING"] as const).map((d) => (
                <button
                  key={d}
                  type="button"
                  aria-pressed={callDirection === d}
                  onClick={() => setCallDirection(d)}
                  className={cn(
                    "rounded-full border px-3 py-1 text-xs transition",
                    callDirection === d
                      ? "border-primary/50 bg-primary/10 text-primary"
                      : "text-muted-foreground hover:bg-accent",
                  )}
                >
                  {t(`calendar.call.${d}`)}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
