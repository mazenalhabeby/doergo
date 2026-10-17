"use client"

import { keys } from "@/lib/query-keys"
import { useState, useRef } from "react"
import { useTranslation } from "react-i18next"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { Building2, Briefcase, Handshake, Contact, Package, LayoutTemplate, FileText } from "lucide-react"
import { notify } from "@/lib/toast"
import { locationsApi, rateHistoryApi, type CompanyLocation, type UpdateLocationInput } from "@/lib/api"
import { ATTENDANCE_CONSTANTS, parseGeofencePolygon, type LatLng } from "@hbcfield/shared/client"
import { fetchTimezone } from "@/components/timezone-combobox"
import { useAuth } from "@/contexts/auth-context"
import { useRouteAccess } from "@/hooks/use-route-access"

export const { MIN_GEOFENCE_RADIUS: GEO_MIN, MAX_GEOFENCE_RADIUS: GEO_MAX, DEFAULT_GEOFENCE_RADIUS: GEO_DEFAULT } =
  ATTENDANCE_CONSTANTS

/** GeneralTab's state and handlers — everything before its markup, moved here unchanged. */
export function useGeneralTab({ space }: Pick<{ space: CompanyLocation }, 'space'>) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const { hasPlanFeature, user } = useAuth()
  const access = useRouteAccess()
  const orgCurrency = user?.orgCurrency ?? "EUR"
  // This workspace's rates and their history, read only where they are shown (a client).
  const { data: spaceRates } = useQuery({
    queryKey: keys.rates.history("SPACE", space.id),
    queryFn: () => rateHistoryApi.list({ target: "SPACE", targetId: space.id }),
    enabled: space.kind === "CUSTOMER",
  })
  const saveSpaceRate = async (patch: UpdateLocationInput) => {
    await locationsApi.update(space.id, patch)
    queryClient.invalidateQueries({ queryKey: keys.locations.detail(space.id) })
    queryClient.invalidateQueries({ queryKey: keys.rates.history("SPACE", space.id) })
  }

  const [makingDefault, setMakingDefault] = useState(false)
  const [name, setName] = useState(space.name)
  // Type is derived from whether the space has coordinates (same implicit model
  // as the New-Space form — a physical site has a pin, a workspace doesn't).
  const [type, setType] = useState<"workspace" | "physical">(
    space.lat != null && space.lng != null ? "physical" : "workspace",
  )
  const [address, setAddress] = useState(space.address || "")
  const [lat, setLat] = useState<number | null>(space.lat ?? null)
  const [lng, setLng] = useState<number | null>(space.lng ?? null)
  const [radius, setRadius] = useState(space.geofenceRadius.toString())
  // The drawn outline. `parseGeofencePolygon` rather than a cast: the column is
  // JSON and may hold anything an older build or a restored backup left there.
  const [polygon, setPolygon] = useState<LatLng[] | null>(
    parseGeofencePolygon((space as { geofencePolygon?: unknown }).geofencePolygon),
  )
  /** A drawn boundary supersedes the radius — see the note by the field. */
  const hasBoundary = (polygon?.length ?? 0) >= 3
  const [timezone, setTimezone] = useState(space.timezone || "Europe/Berlin")
  // Ownership classification (separate axis from workspace/physical).
  const [kind, setKind] = useState<"PROJECT" | "COMPANY" | "CUSTOMER">(
    (space.kind as "PROJECT" | "COMPANY" | "CUSTOMER") || "COMPANY",
  )
  const [contactName, setContactName] = useState(space.contactName || "")
  const [contactEmail, setContactEmail] = useState(space.contactEmail || "")
  const [contactPhone, setContactPhone] = useState(space.contactPhone || "")

  const isPhysical = type === "physical"
  const KIND_OPTIONS = [
    { value: "PROJECT" as const, icon: Briefcase, label: t("locations.form.kindProject", "My project") },
    { value: "COMPANY" as const, icon: Building2, label: t("locations.form.kindCompany", "My company") },
    { value: "CUSTOMER" as const, icon: Handshake, label: t("locations.form.kindCustomer", "Customer company") },
  ]
  const clampRadius = () => Math.min(GEO_MAX, Math.max(GEO_MIN, parseInt(radius) || GEO_DEFAULT))

  // Remember the last coords we auto-derived a timezone for, so a save/re-render
  // doesn't refetch and clobber a manual override.
  const lastTzCoords = useRef<string>("")

  const mutation = useMutation({
    mutationFn: (data: UpdateLocationInput) => locationsApi.update(space.id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: keys.locations.detail(space.id) })
      queryClient.invalidateQueries({ queryKey: keys.locations.lists() })
      notify.success(t("locations.toast.updated"))
    },
    onError: (err: Error) => notify.error(err.message || t("locations.toast.updateFailed")),
  })

  // Dropping a pin / searching updates coords AND auto-fills the timezone from
  // the map (the admin can still override with the searchable picker below).
  const handleLocationChange = (newLat: number, newLng: number) => {
    setLat(newLat)
    setLng(newLng)
    const key = `${newLat.toFixed(4)},${newLng.toFixed(4)}`
    if (key === lastTzCoords.current) return
    lastTzCoords.current = key
    void fetchTimezone(newLat, newLng).then((tz) => {
      if (tz) setTimezone(tz)
    })
  }

  const handleSave = () => {
    if (!name.trim()) return notify.error(t("locations.nameRequired"))
    mutation.mutate({
      name: name.trim(),
      timezone,
      // Ownership kind + customer contact fields (cleared when not CUSTOMER).
      kind,
      contactName: kind === "CUSTOMER" ? contactName.trim() || null : null,
      contactEmail: kind === "CUSTOMER" ? contactEmail.trim() || null : null,
      contactPhone: kind === "CUSTOMER" ? contactPhone.trim() || null : null,
      // Rates are not part of this Save — each has its own dated Change (below).
      // Physical → persist the pin/address/geofence. Workspace → clear the
      // physical attributes (null) so the space becomes a logical one.
      ...(isPhysical
        ? {
            address: address.trim() || undefined,
            lat: lat ?? undefined,
            lng: lng ?? undefined,
            geofenceRadius: clampRadius(),
            // Sent on every physical save so clearing a boundary persists;
            // `null` returns the site to its radius.
            geofencePolygon: polygon,
          }
        : { address: null, lat: null, lng: null, geofencePolygon: null }),
    })
  }

  /*
    What this workspace HAS, as links rather than tabs.

    Clients, assets and portals moved to their own pages — they are content, not
    settings, and this page is settings. The path from a workspace survives as
    one row: the same screens, pre-filtered to this one, a click away. Only what
    the workspace actually runs appears.
  */
  const mods = (space.enabledModules ?? []) as string[]
  // …and only where the page behind the link would open for this reader (the route table).
  const contentLinks = [
    { href: "/clients", label: t("customers.title", "Customers"), Icon: Contact, show: mods.includes("crm") && access.may("/clients") },
    { href: "/assets", label: t("assetKinds.title", "Assets"), Icon: Package, show: mods.includes("assets") && access.may("/assets") },
    { href: "/portals", label: t("portal.title", "Client portal"), Icon: LayoutTemplate, show: mods.includes("b2c_portal") && access.may("/portals") },
    /*
      ⚠️ Invoicing is an organization OPTION, not a per-space module, so it is
      not in `mods` — and what decides whether this workspace can be billed is
      what it IS. You invoice a customer site, never your own warehouse.
    */
    {
      href: "/invoices",
      label: t("invoices.title"),
      Icon: FileText,
      show: space.kind === "CUSTOMER" && hasPlanFeature("invoicing"),
    },
  ].filter((l) => l.show)

  return {
    t,
    queryClient,
    orgCurrency,
    spaceRates,
    saveSpaceRate,
    makingDefault,
    setMakingDefault,
    name,
    setName,
    type,
    setType,
    address,
    setAddress,
    lat,
    lng,
    radius,
    setRadius,
    polygon,
    setPolygon,
    hasBoundary,
    timezone,
    setTimezone,
    kind,
    setKind,
    contactName,
    setContactName,
    contactEmail,
    setContactEmail,
    contactPhone,
    setContactPhone,
    isPhysical,
    KIND_OPTIONS,
    clampRadius,
    mutation,
    handleLocationChange,
    handleSave,
    contentLinks,
  }
}

/** What GeneralTab and its sections read. */
export type GeneralTabState = ReturnType<typeof useGeneralTab>
