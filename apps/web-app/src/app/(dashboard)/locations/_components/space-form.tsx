"use client"

import { useState, useCallback } from "react"
import dynamic from "next/dynamic"
import { useQuery, useMutation } from "@tanstack/react-query"
import { Boxes, MapPin, ChevronDown, ChevronRight, Loader2 } from "lucide-react"
import { AVAILABLE_MODULES, DEFAULT_ORG_MODULES, MODULE_GROUPS, MODULE_PRESETS } from "@hbcfield/shared/client"
import { locationsApi, workflowsApi, type CreateLocationInput } from "@/lib/api"
import { notify } from "@/lib/toast"
import { cn } from "@/lib/utils"
import { Input, Button, Label } from "@/components/ui"
import { WorkflowSelector } from "./workflow-selector"

const LocationPicker = dynamic(() => import("./location-picker"), {
  ssr: false,
  loading: () => (
    <div className="flex h-[200px] items-center justify-center rounded-lg border border-dashed border-border bg-muted/40">
      <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
    </div>
  ),
})

/**
 * Shared "create a space" form — name, workspace/physical type, location +
 * geofence (physical only), workflow, and modules (with presets). Used by BOTH
 * the New-Space dialog on /locations and the first-space setup on /welcome, so
 * the two flows never drift. The caller only supplies the container + callbacks.
 */
export function SpaceForm({
  onCreated,
  onCancel,
  submitLabel = "Create Space",
  autoFocus = false,
}: {
  onCreated: () => void
  onCancel?: () => void
  submitLabel?: string
  autoFocus?: boolean
}) {
  // Workflows are fetched here (cached key shared with /locations, so no extra
  // request) — keeps both call sites a one-liner.
  const { data: workflows = [] } = useQuery({
    queryKey: ["workflows"],
    queryFn: () => workflowsApi.list(),
    staleTime: 60000,
  })

  const [name, setName] = useState("")
  const [type, setType] = useState<"workspace" | "physical">("workspace")
  const [address, setAddress] = useState("")
  const [lat, setLat] = useState<number | null>(null)
  const [lng, setLng] = useState<number | null>(null)
  const [radius, setRadius] = useState("200")
  const [timezone] = useState("Europe/Berlin")
  const [workflowId, setWorkflowId] = useState("")
  const [enabledModules, setEnabledModules] = useState<string[]>([...DEFAULT_ORG_MODULES])
  const [showAdvanced, setShowAdvanced] = useState(false)

  const isPhysical = type === "physical"
  const defaultWorkflow = workflows.find((w) => w.isDefault)

  const mutation = useMutation({
    mutationFn: (data: CreateLocationInput) => locationsApi.create(data),
    onSuccess: () => {
      notify.success("Space created")
      onCreated()
    },
    onError: (err: Error) => notify.error(err.message || "Failed to create space"),
  })

  const toggleModule = useCallback((key: string) => {
    setEnabledModules((prev) => (prev.includes(key) ? prev.filter((m) => m !== key) : [...prev, key]))
  }, [])

  const handleSubmit = () => {
    if (!name.trim()) return notify.error("Name is required")
    mutation.mutate({
      name: name.trim(),
      address: address.trim() || undefined,
      // Logical workspaces have no coords; only physical sites need lat/lng for
      // attendance geofencing.
      lat: lat ?? undefined,
      lng: lng ?? undefined,
      geofenceRadius: parseInt(radius) || 200,
      timezone,
      enabledModules,
      workflowId: workflowId || defaultWorkflow?.id || undefined,
    })
  }

  return (
    <div className="space-y-5">
      {/* Name */}
      <div className="space-y-2">
        <Label htmlFor="space-name">Name <span className="text-red-500">*</span></Label>
        <Input
          id="space-name"
          placeholder="e.g. Main Office, Downtown Crew"
          value={name}
          onChange={(e) => setName(e.target.value)}
          autoFocus={autoFocus}
        />
      </div>

      {/* Type — workspace vs physical */}
      <div className="space-y-2">
        <Label>Type</Label>
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
              <Boxes className="h-4 w-4 text-blue-600" /> Workspace
            </div>
            <p className="mt-1 text-xs text-muted-foreground">A team or project — no physical location.</p>
          </button>
          <button
            type="button"
            onClick={() => setType("physical")}
            className={cn(
              "rounded-xl border p-4 text-left transition-all",
              isPhysical
                ? "border-blue-600 bg-blue-50 dark:bg-blue-900/20 ring-1 ring-blue-200 dark:ring-blue-800"
                : "border-border hover:border-muted-foreground/30",
            )}
          >
            <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
              <MapPin className="h-4 w-4 text-blue-600" /> Physical location
            </div>
            <p className="mt-1 text-xs text-muted-foreground">A site with an address — for attendance clock-in.</p>
          </button>
        </div>
      </div>

      {/* Physical-only: address + map + geofence */}
      {isPhysical && (
        <div className="space-y-3 rounded-xl border border-border bg-muted/30 p-4">
          <div className="space-y-2">
            <Label htmlFor="space-address">Address</Label>
            <Input
              id="space-address"
              placeholder="Street, city"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
            />
          </div>
          <LocationPicker
            lat={lat}
            lng={lng}
            radius={parseInt(radius) || 200}
            address={address}
            onLocationChange={(newLat, newLng) => { setLat(newLat); setLng(newLng) }}
            onAddressChange={setAddress}
          />
          <div className="space-y-2">
            <Label htmlFor="space-radius">Geofence radius</Label>
            <div className="flex items-center gap-3">
              <Input
                id="space-radius"
                type="number"
                min={5}
                max={500}
                value={radius}
                onChange={(e) => setRadius(e.target.value)}
                className="w-24"
              />
              <input
                type="range"
                min={5}
                max={500}
                value={radius}
                onChange={(e) => setRadius(e.target.value)}
                className="flex-1 accent-blue-600"
              />
              <span className="text-sm text-muted-foreground w-12 text-right">{radius}m</span>
            </div>
            <p className="text-xs text-muted-foreground">Workers can clock in within this distance of the pin.</p>
          </div>
        </div>
      )}

      {/* Workflow */}
      <WorkflowSelector
        value={workflowId || defaultWorkflow?.id || ""}
        onChange={setWorkflowId}
        workflows={workflows}
        allowCreate
      />

      {/* Advanced — modules (collapsed; sensible defaults already set) */}
      <div className="rounded-xl border border-border">
        <button
          type="button"
          onClick={() => setShowAdvanced(!showAdvanced)}
          className="flex w-full items-center justify-between px-4 py-3 text-sm hover:bg-muted/30 transition-colors rounded-xl"
        >
          <span className="font-medium text-foreground">Advanced — Modules</span>
          <span className="flex items-center gap-2 text-xs text-muted-foreground">
            {enabledModules.length} enabled
            {showAdvanced ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
          </span>
        </button>
        {showAdvanced && (
          <div className="border-t border-border p-3 space-y-3 max-h-[340px] overflow-y-auto">
            <p className="text-xs text-muted-foreground">
              Modules add optional features to this space&apos;s tasks (checklists, GPS tracking,
              sprints…). Start from a preset, then fine-tune below.
            </p>

            {/* Presets */}
            <div className="space-y-1.5">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Presets</p>
              <div className="flex flex-wrap gap-1.5">
                {MODULE_PRESETS.map((p) => {
                  const active =
                    p.modules.length === enabledModules.length &&
                    p.modules.every((m) => enabledModules.includes(m))
                  return (
                    <button
                      key={p.key}
                      type="button"
                      onClick={() => setEnabledModules([...p.modules])}
                      className={cn(
                        "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                        active
                          ? "border-blue-600 bg-blue-50 text-blue-700 dark:bg-blue-900/20 dark:text-blue-300"
                          : "border-border text-muted-foreground hover:bg-muted/50",
                      )}
                    >
                      {p.label}
                    </button>
                  )
                })}
              </div>
            </div>

            {/* Grouped modules */}
            {MODULE_GROUPS.map((grp) => (
              <div key={grp.key} className="space-y-1">
                <div className="px-1 pt-1">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{grp.label}</p>
                  <p className="text-[11px] text-muted-foreground/70">{grp.description}</p>
                </div>
                {AVAILABLE_MODULES.filter((m) => m.group === grp.key).map((mod) => (
                  <label
                    key={mod.key}
                    className="flex items-start gap-3 p-2.5 rounded-lg hover:bg-muted/50 cursor-pointer transition-colors"
                  >
                    <input
                      type="checkbox"
                      checked={enabledModules.includes(mod.key)}
                      onChange={() => toggleModule(mod.key)}
                      className="mt-0.5 rounded border-border text-blue-600 focus:ring-blue-500"
                    />
                    <div>
                      <span className="text-sm font-medium text-foreground">{mod.label}</span>
                      <p className="text-xs text-muted-foreground mt-0.5">{mod.description}</p>
                    </div>
                  </label>
                ))}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="flex justify-end gap-2 pt-1">
        {onCancel && (
          <Button variant="outline" onClick={onCancel} disabled={mutation.isPending}>Cancel</Button>
        )}
        <Button onClick={handleSubmit} disabled={mutation.isPending}>
          {mutation.isPending ? "Creating..." : submitLabel}
        </Button>
      </div>
    </div>
  )
}
