"use client"

import { keys } from "@/lib/query-keys"
import { useState, useCallback, useRef } from "react"
import { useAuth } from "@/contexts/auth-context"
import dynamic from "next/dynamic"
import { useTranslation } from "react-i18next"
import { useQuery, useMutation } from "@tanstack/react-query"
import { Boxes, MapPin, ChevronDown, ChevronRight, Loader2, Briefcase, Building2, Handshake } from "lucide-react"
import type { LatLng } from "@hbcfield/shared/client"
import {
  ATTENDANCE_CONSTANTS,
  AVAILABLE_MODULES,
  DEFAULT_ORG_MODULES,
  MODULE_GROUPS,
  MODULE_PRESETS,
  RADIUS_SLIDER_STEPS,
  radiusToSliderPosition,
  sliderPositionToRadius
} from "@hbcfield/shared/client"
import { locationsApi, workflowsApi, type CreateLocationInput } from "@/lib/api"
import { ExplainerButton } from "@/components/explainer/explainer-button"
import { notify } from "@/lib/toast"
import { cn } from "@/lib/utils"
import { Input, Button, Label } from "@/components/ui"
import { TimezoneCombobox, fetchTimezone } from "@/components/timezone-combobox"
import { WorkflowSelector } from "./workflow-selector"
import { useSpaceForm, GEO_MIN, GEO_MAX, GEO_DEFAULT } from "./use-space-form"
import { LocationPicker } from "./space-form-helpers"
import { SpaceFormForm } from "./space-form-form"
import { SpaceFormAddress } from "./space-form-address"

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
  const vm = useSpaceForm({ onCreated, onCancel, submitLabel, autoFocus })
  const {
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
  } = vm

  return (
    <div className="space-y-5">
      {/* Name */}
      <div className="space-y-2">
        <Label htmlFor="space-name">{t("locations.name")} <span className="text-red-500">*</span></Label>
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
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {KIND_OPTIONS.map((opt) => {
            const Icon = opt.icon
            const active = kind === opt.value
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => setKind(opt.value)}
                className={cn(
                  "rounded-xl border p-3 text-left transition-all",
                  active
                    ? "border-blue-600 bg-blue-50 dark:bg-blue-900/20 ring-1 ring-blue-200 dark:ring-blue-800"
                    : "border-border hover:border-muted-foreground/30",
                )}
              >
                <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
                  <Icon className="h-4 w-4 text-blue-600" /> {opt.label}
                </div>
              </button>
            )
          })}
        </div>
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
              <Input id="cust-contact-email" type="email" value={contactEmail} onChange={(e) => setContactEmail(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="cust-contact-phone">{t("locations.form.contactPhone", "Contact phone")}</Label>
              <Input id="cust-contact-phone" value={contactPhone} onChange={(e) => setContactPhone(e.target.value)} />
            </div>
          </div>
        </div>
      )}

      {/* Physical-only: address + map + geofence */}
      <SpaceFormAddress vm={vm} />

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
      <SpaceFormForm vm={vm} />

      {/* Footer */}
      <div className="flex justify-end gap-2 pt-1">
        {onCancel && (
          <Button variant="outline" onClick={onCancel} disabled={mutation.isPending}>{t("common.cancel")}</Button>
        )}
        <Button data-tour="spaces-form-submit" onClick={handleSubmit} disabled={mutation.isPending}>
          {mutation.isPending ? t("common.creating") : resolvedSubmitLabel}
        </Button>
      </div>
    </div>
  )
}
