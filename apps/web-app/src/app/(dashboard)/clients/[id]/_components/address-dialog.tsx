"use client"

import { useState } from "react"
import dynamic from "next/dynamic"
import { useTranslation } from "react-i18next"
import { useMutation } from "@tanstack/react-query"
import { customersApi, type CustomerAddress } from "@/lib/api"
import { notify } from "@/lib/toast"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Checkbox } from "@/components/ui/checkbox"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from "@/components/ui/dialog"

const LocationPicker = dynamic(() => import("@/components/map/location-picker"), {
  ssr: false,
  loading: () => <div className="h-64 w-full animate-pulse rounded-lg bg-muted" />,
})

/** Add or edit one of a client's addresses: a name, the place on the map, a contact on site, primary or not. */
export function AddressDialog({
  customerId,
  existing,
  isFirst,
  onSaved,
  trigger,
}: {
  customerId: string
  existing?: CustomerAddress
  isFirst?: boolean
  onSaved: () => void
  trigger: React.ReactNode
}) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const [name, setName] = useState(existing?.name ?? "")
  const [address, setAddress] = useState(existing?.address ?? "")
  const [lat, setLat] = useState<number | null>(existing?.lat ?? null)
  const [lng, setLng] = useState<number | null>(existing?.lng ?? null)
  const [contactName, setContactName] = useState(existing?.contactName ?? "")
  const [contactPhone, setContactPhone] = useState(existing?.contactPhone ?? "")
  const [makePrimary, setMakePrimary] = useState(existing?.isPrimary ?? !!isFirst)

  const save = useMutation({
    mutationFn: async () => {
      const contact = { contactName: contactName.trim() || null, contactPhone: contactPhone.trim() || null }
      if (existing) {
        await customersApi.updateAddress(customerId, existing.id, {
          name: name.trim() || address,
          address,
          lat: lat ?? undefined,
          lng: lng ?? undefined,
          ...contact,
        })
        if (makePrimary && !existing.isPrimary) await customersApi.setPrimaryAddress(customerId, existing.id)
      } else {
        await customersApi.addAddress(customerId, {
          name: name.trim() || address,
          address,
          lat: lat ?? undefined,
          lng: lng ?? undefined,
          isPrimary: makePrimary,
          ...contact,
        })
      }
    },
    onSuccess: () => {
      notify.success(
        existing ? t("customers.addressUpdated", "Address updated") : t("customers.addressAdded", "Address added"),
      )
      onSaved()
      setOpen(false)
    },
    onError: (e: Error) => notify.error(e.message || "Could not save"),
  })

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {existing ? t("customers.editAddress", "Edit address") : t("customers.addAddress", "Add address")}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1">
            <Label>{t("customers.addressLabel", "Label")}</Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t("customers.addressLabelPh", "e.g. HQ, Apartment 4B")}
            />
          </div>
          <div className="space-y-1">
            <Label>{t("customers.address", "Address")}</Label>
            <LocationPicker
              lat={lat}
              lng={lng}
              address={address}
              onLocationChange={(la, ln) => {
                setLat(la)
                setLng(ln)
              }}
              onAddressChange={(a) => setAddress(a)}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>{t("customers.contactPerson", "Contact person")}</Label>
              <Input
                value={contactName}
                onChange={(e) => setContactName(e.target.value)}
                placeholder={t("customers.contactPersonPh", "On-site contact")}
              />
            </div>
            <div className="space-y-1">
              <Label>{t("customers.contactPhone", "Contact phone")}</Label>
              <Input value={contactPhone} onChange={(e) => setContactPhone(e.target.value)} placeholder="+43 …" />
            </div>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <Checkbox
              checked={makePrimary}
              onCheckedChange={(v) => setMakePrimary(!!v)}
              disabled={existing?.isPrimary}
            />
            {t("customers.setPrimary", "Primary address (shown on the map)")}
          </label>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            {t("common.cancel", "Cancel")}
          </Button>
          <Button disabled={!address.trim() || save.isPending} onClick={() => save.mutate()}>
            {save.isPending ? t("common.saving", "Saving…") : t("common.save", "Save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
