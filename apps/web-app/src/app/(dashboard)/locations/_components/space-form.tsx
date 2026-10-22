"use client"

import { useState, useCallback, useRef } from "react"
import { useTranslation } from "react-i18next"
import { useQuery, useMutation } from "@tanstack/react-query"
import { Boxes, MapPin } from "lucide-react"
import type { LatLng } from "@hbcfield/shared/client"
import { DEFAULT_ORG_MODULES } from "@hbcfield/shared/client"
import { useAuth } from "@/contexts/auth-context"
import { keys } from "@/lib/query-keys"
import { locationsApi, workflowsApi, type CreateLocationInput } from "@/lib/api"
import { notify } from "@/lib/toast"
import { cn } from "@/lib/utils"
import { Input, Button, Label } from "@/components/ui"
import { fetchTimezone } from "@/components/common/timezone-combobox"
import { OwnershipKindPicker, ownershipKindOptions } from "./ownership-kind-picker"
import { WorkflowSelector } from "./workflow-selector"
import { SpaceModulesPicker } from "./space-modules-picker"
import { SpaceSiteFields, GEO_MIN, GEO_MAX, GEO_DEFAULT } from "./space-site-fields"

/**
 * Shared "create a space" form — name, workspace/physical type, location +
 * geofence (physical only), workflow, and modules (with presets). Used by BOTH
 * the New-Space dialog on /locations and the first-space setup on /welcome, so
 * the two flows never drift. The caller only supplies the container + callbacks.
 */

export function SpaceForm({
  onCreated,
  onCancel,
  submitLabel,
  autoFocus = false,
}: {
  onCreated: () => void
  onCancel?: () => void
  submitLabel?: string
  autoFocus?: boolean
}) {
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
  // Auto-derived from the picked coordinates (admin can override with the
  // searchable picker); backend also auto-derives if this is empty.
  const [timezone, setTimezone] = useState("")
  const lastTzCoords = useRef<string>("")
  const [workflowId, setWorkflowId] = useState("")
  const [enabledModules, setEnabledModules] = useState<string[]>([...DEFAULT_ORG_MODULES])

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
      geofenceRadius: isPhysical ? Math.min(GEO_MAX, Math.max(GEO_MIN, parseInt(radius) || GEO_DEFAULT)) : undefined,
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

  const KIND_OPTIONS = ownershipKindOptions(t)

  return (
    <div className="space-y-5">
      {/* Name */}
      <div className="space-y-2">
        <Label htmlFor="space-name">
          {t("locations.name")} <span className="text-red-500">*</span>
        </Label>
        <Input
          id="space-name"
          data-tour="spaces-dialog-name"
          placeholder={t("locations.form.namePlaceholder")}
          value={name}
          onChange={(e) => setName(e.target.value)}
          autoFocus={autoFocus}
        />
      </div>

      {/* Type — workspace vs physical */}
      <div className="space-y-2" data-tour="spaces-form-type">
        <Label>{t("locations.form.type")}</Label>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <button
            type="button"
            onClick={() => setType("workspace")}
            className={cn(
              "rounded-xl border p-4 text-left transition-all",
              !isPhysical
                ? "border-blue-600 bg-blue-50 dark:bg-blue-900/20 ring-1 ring-blue-200 dark:ring-blue-800"
                : "border-border hover:border-muted-foreground/30",
            )}
          >
            <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
              <Boxes className="h-4 w-4 text-blue-600" /> {t("locations.form.workspace")}
            </div>
            <p className="mt-1 text-xs text-muted-foreground">{t("locations.form.workspaceHint")}</p>
          </button>
          <button
            type="button"
            data-tour="spaces-form-type-physical"
            onClick={() => setType("physical")}
            className={cn(
              "rounded-xl border p-4 text-left transition-all",
              isPhysical
                ? "border-blue-600 bg-blue-50 dark:bg-blue-900/20 ring-1 ring-blue-200 dark:ring-blue-800"
                : "border-border hover:border-muted-foreground/30",
            )}
          >
            <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
              <MapPin className="h-4 w-4 text-blue-600" /> {t("locations.form.physical")}
            </div>
            <p className="mt-1 text-xs text-muted-foreground">{t("locations.form.physicalHint")}</p>
          </button>
        </div>
      </div>

      {/* Ownership — my project / my company / customer company (separate axis) */}
      <div className="space-y-2" data-tour="spaces-form-ownership">
        <Label>{t("locations.form.ownership", "Ownership")}</Label>
        <OwnershipKindPicker options={KIND_OPTIONS} kind={kind} onPick={setKind} />
      </div>

      {/* Customer-company only: contact details */}
      {kind === "CUSTOMER" && (
        <div className="space-y-3 rounded-xl border border-border bg-muted/30 p-4">
          <p className="text-xs font-medium text-muted-foreground">
            {t("locations.form.customerContact", "Customer contact")}
          </p>
          <div className="space-y-2">
            <Label htmlFor="cust-contact-name">{t("locations.form.contactName", "Contact name")}</Label>
            <Input id="cust-contact-name" value={contactName} onChange={(e) => setContactName(e.target.value)} />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="cust-contact-email">{t("locations.form.contactEmail", "Contact email")}</Label>
              <Input
                id="cust-contact-email"
                type="email"
                value={contactEmail}
                onChange={(e) => setContactEmail(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="cust-contact-phone">{t("locations.form.contactPhone", "Contact phone")}</Label>
              <Input id="cust-contact-phone" value={contactPhone} onChange={(e) => setContactPhone(e.target.value)} />
            </div>
          </div>
        </div>
      )}

      {/* Physical-only: address + map + geofence */}
      <SpaceSiteFields
        isPhysical={isPhysical}
        address={address}
        setAddress={setAddress}
        polygon={polygon}
        setPolygon={setPolygon}
        lat={lat}
        lng={lng}
        radius={radius}
        setRadius={setRadius}
        handleLocationChange={handleLocationChange}
        timezone={timezone}
        setTimezone={setTimezone}
      />

      {/* Workflow */}
      <div data-tour="spaces-form-workflow">
        {/*
        Choosing a workflow is free; BUILDING one is the Option.

        `allowCreate` opened the builder from inside this form — a second way in
        that the workspace tab's gate never covered. Picking from the workflows
        the organization already has stays available either way, because that is
        not what was bought.
      */}
        <WorkflowSelector
          value={workflowId || defaultWorkflow?.id || ""}
          onChange={setWorkflowId}
          workflows={workflows}
          allowCreate={hasPlanFeature("workflows")}
        />
      </div>

      {/* Advanced — modules (collapsed; sensible defaults already set) */}
      <SpaceModulesPicker enabledModules={enabledModules} setEnabledModules={setEnabledModules} />

      {/* Footer */}
      <div className="flex justify-end gap-2 pt-1">
        {onCancel && (
          <Button variant="outline" onClick={onCancel} disabled={mutation.isPending}>
            {t("common.cancel")}
          </Button>
        )}
        <Button data-tour="spaces-form-submit" onClick={handleSubmit} disabled={mutation.isPending}>
          {mutation.isPending ? t("common.creating") : resolvedSubmitLabel}
        </Button>
      </div>
    </div>
  )
}
