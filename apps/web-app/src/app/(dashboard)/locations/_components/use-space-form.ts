"use client"

import { keys } from "@/lib/query-keys"
import { useState, useCallback, useRef } from "react"
import { useAuth } from "@/contexts/auth-context"
import { useTranslation } from "react-i18next"
import { useQuery, useMutation } from "@tanstack/react-query"
import { Briefcase, Building2, Handshake } from "lucide-react"
import type { LatLng } from "@hbcfield/shared/client"
import { ATTENDANCE_CONSTANTS, DEFAULT_ORG_MODULES } from "@hbcfield/shared/client"
import { locationsApi, workflowsApi, type CreateLocationInput } from "@/lib/api"
import { notify } from "@/lib/toast"
import { fetchTimezone } from "@/components/timezone-combobox"

export const { MIN_GEOFENCE_RADIUS: GEO_MIN, MAX_GEOFENCE_RADIUS: GEO_MAX, DEFAULT_GEOFENCE_RADIUS: GEO_DEFAULT } = ATTENDANCE_CONSTANTS

/** SpaceForm's state and handlers — everything before its markup, moved here unchanged. */
export function useSpaceForm({
  onCreated,
  onCancel,
  submitLabel,
  autoFocus = false,
}: Pick<{
  onCreated: () => void
  onCancel?: () => void
  submitLabel?: string
  autoFocus?: boolean
}, 'onCreated' | 'onCancel' | 'submitLabel' | 'autoFocus'>) {
  const { hasPlanFeature } = useAuth()
  const { t } = useTranslation()
  const resolvedSubmitLabel = submitLabel ?? t("locations.createSpace")
  // Workflows are fetched here (cached key shared with /locations, so no extra
  // request) — keeps both call sites a one-liner.
  const { data: workflows = [] } = useQuery({
    queryKey: keys.workflows.lists(),
    queryFn: () => workflowsApi.list(),
    staleTime: 60000,
  })

  const [name, setName] = useState("")
  const [type, setType] = useState<"workspace" | "physical">("workspace")
  // Ownership classification — orthogonal to workspace/physical. CUSTOMER reveals
  // contact fields (a customer-company space you do work for).
  const [kind, setKind] = useState<"PROJECT" | "COMPANY" | "CUSTOMER">("COMPANY")
  const [contactName, setContactName] = useState("")
  const [contactEmail, setContactEmail] = useState("")
  const [contactPhone, setContactPhone] = useState("")
  const [address, setAddress] = useState("")
  const [lat, setLat] = useState<number | null>(null)
  const [lng, setLng] = useState<number | null>(null)
  const [radius, setRadius] = useState(String(GEO_DEFAULT))
  const [polygon, setPolygon] = useState<LatLng[] | null>(null)
  /** A drawn boundary supersedes the radius — the check never reads it. */
  const hasBoundary = (polygon?.length ?? 0) >= 3
  // Auto-derived from the picked coordinates (admin can override with the
  // searchable picker); backend also auto-derives if this is empty.
  const [timezone, setTimezone] = useState("")
  const lastTzCoords = useRef<string>("")
  const [workflowId, setWorkflowId] = useState("")
  const [enabledModules, setEnabledModules] = useState<string[]>([...DEFAULT_ORG_MODULES])
  const [showAdvanced, setShowAdvanced] = useState(false)

  const isPhysical = type === "physical"
  const defaultWorkflow = workflows.find((w) => w.isDefault)

  const mutation = useMutation({
    mutationFn: (data: CreateLocationInput) => locationsApi.create(data),
    onSuccess: () => {
      notify.success(t("locations.toast.created"))
      onCreated()
    },
    onError: (err: Error) => notify.error(err.message || t("locations.toast.createFailed")),
  })

  const toggleModule = useCallback((key: string) => {
    setEnabledModules((prev) => (prev.includes(key) ? prev.filter((m) => m !== key) : [...prev, key]))
  }, [])

  // Dropping a pin / searching updates coords AND auto-fills the timezone from
  // the map (admin can still override with the searchable picker below).
  const handleLocationChange = useCallback((newLat: number, newLng: number) => {
    setLat(newLat)
    setLng(newLng)
    const key = `${newLat.toFixed(4)},${newLng.toFixed(4)}`
    if (key === lastTzCoords.current) return
    lastTzCoords.current = key
    void fetchTimezone(newLat, newLng).then((tz) => {
      if (tz) setTimezone(tz)
    })
  }, [])

  const handleSubmit = () => {
    if (!name.trim()) return notify.error(t("locations.nameRequired"))
    mutation.mutate({
      name: name.trim(),
      address: address.trim() || undefined,
      // Logical workspaces have no coords; only physical sites need lat/lng for
      // attendance geofencing.
      lat: lat ?? undefined,
      lng: lng ?? undefined,
      // Geofence only matters for a physical site; clamp to the backend's
      // allowed range so the value can never be rejected. Workspaces omit it
      // (the backend defaults it).
      geofenceRadius: isPhysical
        ? Math.min(GEO_MAX, Math.max(GEO_MIN, parseInt(radius) || GEO_DEFAULT))
        : undefined,
      // A drawn boundary replaces the radius. Only sent for a physical site —
      // a workspace with no coordinates has nothing to enclose.
      geofencePolygon: isPhysical && polygon && polygon.length >= 3 ? polygon : undefined,
      // Empty → backend auto-derives from coordinates (or its own default).
      timezone: timezone || undefined,
      enabledModules,
      workflowId: workflowId || defaultWorkflow?.id || undefined,
      // Ownership kind + customer contact fields (only sent for CUSTOMER).
      kind,
      contactName: kind === "CUSTOMER" ? contactName.trim() || undefined : undefined,
      contactEmail: kind === "CUSTOMER" ? contactEmail.trim() || undefined : undefined,
      contactPhone: kind === "CUSTOMER" ? contactPhone.trim() || undefined : undefined,
    })
  }

  const KIND_OPTIONS = [
    { value: "PROJECT" as const, icon: Briefcase, label: t("locations.form.kindProject", "My project") },
    { value: "COMPANY" as const, icon: Building2, label: t("locations.form.kindCompany", "My company") },
    { value: "CUSTOMER" as const, icon: Handshake, label: t("locations.form.kindCustomer", "Customer company") },
  ]

  return {
    hasPlanFeature,
    t,
    resolvedSubmitLabel,
    workflows,
    name,
    setName,
    type,
    setType,
    kind,
    setKind,
    contactName,
    setContactName,
    contactEmail,
    setContactEmail,
    contactPhone,
    setContactPhone,
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
    workflowId,
    setWorkflowId,
    enabledModules,
    setEnabledModules,
    showAdvanced,
    setShowAdvanced,
    isPhysical,
    defaultWorkflow,
    mutation,
    toggleModule,
    handleLocationChange,
    handleSubmit,
    KIND_OPTIONS,
  }
}

/** What SpaceForm and its sections read. */
export type SpaceFormState = ReturnType<typeof useSpaceForm>
