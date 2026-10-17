"use client"

import { keys } from "@/lib/query-keys"
import { useState, useRef } from "react"
import dynamic from "next/dynamic"
import Link from "next/link"
import { useTranslation } from "react-i18next"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import {
  Boxes,
  Building2,
  CheckCircle2,
  Inbox,
  Loader2,
  MapPin,
  PauseCircle,
  Briefcase,
  Handshake,
  Contact,
  Package,
  LayoutTemplate,
  FileText,
  ChevronRight
} from "lucide-react"

import { notify } from "@/lib/toast"
import { cn } from "@/lib/utils"
import { locationsApi, rateHistoryApi, type CompanyLocation, type UpdateLocationInput } from "@/lib/api"
import { DatedRateField } from "@/components/rates/dated-rate"
import { CurrencySetting } from "@/components/rates/currency-setting"
import { CompanyField, companyName, useCompanies } from "@/components/companies/company-select"
import { serverErrorMessage } from "@/lib/server-error"
import { ATTENDANCE_CONSTANTS, parseGeofencePolygon, type LatLng } from "@hbcfield/shared/client"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { AuditTrail } from "@/components/audit-trail"
import { TimezoneCombobox, fetchTimezone } from "@/components/timezone-combobox"
import { DangerZone } from "./danger-zone"
import { useAuth } from "@/contexts/auth-context"
import { useRouteAccess } from "@/hooks/use-route-access"
import { useGeneralTab, GEO_MIN, GEO_MAX } from "./use-general-tab"
import { LocationPicker, WorkspaceCompanyField } from "./general-tab-helpers"
import { GeneralTabOwnershipSection } from "./general-tab-ownership-section"
import { GeneralTabLocationSection } from "./general-tab-location-section"

export function GeneralTab({ space }: { space: CompanyLocation }) {
  const vm = useGeneralTab({ space })
  const {
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
  } = vm

  return (
    <div className="max-w-3xl space-y-5">
      {contentLinks.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          {contentLinks.map(({ href, label, Icon }) => (
            <Link
              key={href}
              href={`${href}?space=${space.id}`}
              className={"inline-flex items-center gap-2 rounded-lg border border-border bg-card " +
                "px-3 py-2 text-sm font-medium text-foreground transition-colors " +
                "hover:bg-muted/60"}
            >
              <Icon className="h-4 w-4 text-muted-foreground" />
              {label}
              <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
            </Link>
          ))}
        </div>
      )}

      {/*
        Which workspace catches work that belongs to no particular one.

        The flag was set when the first space was created and could never move,
        so an organization whose first space turned out to be the wrong one was
        stuck — and the Danger zone refused to delete it with "make another
        space the default first", which nothing in the product could do.

        Here rather than in the Danger zone: choosing where unassigned work
        lands is an ordinary setting. It is the REFUSAL to delete that is
        dangerous, and that message now points at this card.
      */}
      <Card>
        <CardContent className="flex flex-wrap items-center justify-between gap-3 py-4">
          <div className="min-w-0">
            <p className="flex items-center gap-2 text-sm font-medium text-foreground">
              <Inbox className="h-4 w-4 text-muted-foreground" />
              {t("locations.default.title", "Default workspace")}
            </p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {space.isDefault
                ? t("locations.default.isCurrent", "Work that belongs to no particular workspace lands here.")
                : t("locations.default.canBe", "Make this the workspace that catches work belonging to no particular one.")}
            </p>
          </div>
          {space.isDefault ? (
            <span className="rounded-full bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary">
              {t("locations.default.badge", "Default")}
            </span>
          ) : (
            <Button
              variant="outline"
              size="sm"
              disabled={makingDefault || !!space.isRemote}
              onClick={async () => {
                setMakingDefault(true);
                try {
                  await locationsApi.makeDefault(space.id);
                  notify.success(t("locations.default.done", "{{name}} is now the default workspace.", { name: space.name }));
                  // The badge moves on ANOTHER space too, so the list is
                  // invalidated as well as this space.
                  queryClient.invalidateQueries({ queryKey: keys.locations.detail(space.id) });
                  queryClient.invalidateQueries({ queryKey: keys.locations.lists() });
                } catch (e) {
                  notify.error(e instanceof Error ? e.message : String(e));
                } finally {
                  setMakingDefault(false);
                }
              }}
            >
              {makingDefault && <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />}
              {t("locations.default.make", "Make default")}
            </Button>
          )}
        </CardContent>
      </Card>

      {/* ── Space details ── */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-start gap-3">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Building2 className="h-[18px] w-[18px]" />
            </span>
            <div>
              <CardTitle className="text-base">{t("locations.detailsSection")}</CardTitle>
              <CardDescription>{t("locations.detailsHint")}</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="cfg-name">{t("locations.name")}</Label>
            <Input id="cfg-name" value={name} onChange={(e) => setName(e.target.value)} placeholder={t("locations.name")} />
          </div>
          {/* Read-only status — archiving/restoring is done in the Danger zone below. */}
          <div className="flex items-center justify-between rounded-xl border bg-muted/30 px-4 py-3">
            <div className="pr-4">
              <div className="flex items-center gap-2">
                <p className="text-sm font-medium text-foreground">{t("locations.activeLabel")}</p>
                {space.isActive ? (
                  <Badge className={"gap-1 border-transparent bg-green-100 text-green-700 hover:bg-green-100 " + "dark:bg-green-950 dark:text-green-300"}>
                    <CheckCircle2 className="h-3 w-3" />
                    {t("common.active")}
                  </Badge>
                ) : (
                  <Badge variant="secondary" className="gap-1 text-muted-foreground">
                    <PauseCircle className="h-3 w-3" />
                    {t("locations.archived", "Archived")}
                  </Badge>
                )}
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">{t("locations.activeHint")}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ── Space type ── */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-start gap-3">
              <span className={"flex size-9 shrink-0 items-center justify-center rounded-lg " + "bg-violet-100 text-violet-600 dark:bg-violet-950 dark:text-violet-300"}>
                <Boxes className="h-[18px] w-[18px]" />
              </span>
              <div>
                <CardTitle className="text-base">{t("locations.typeSection")}</CardTitle>
                <CardDescription>{t("locations.typeHint")}</CardDescription>
              </div>
            </div>
            {/* Current definition at a glance */}
            <Badge
              variant="secondary"
              className={cn(
                "gap-1 shrink-0 border-transparent",
                isPhysical
                  ? "bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300"
                  : "bg-violet-100 text-violet-700 dark:bg-violet-950 dark:text-violet-300",
              )}
            >
              {isPhysical ? <MapPin className="h-3 w-3" /> : <Boxes className="h-3 w-3" />}
              {isPhysical ? t("locations.form.physical") : t("locations.form.workspace")}
            </Badge>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <button
              type="button"
              onClick={() => setType("workspace")}
              className={cn(
                "rounded-xl border p-4 text-left transition-all",
                !isPhysical
                  ? "border-blue-600 bg-blue-50 ring-1 ring-blue-200 dark:bg-blue-900/20 dark:ring-blue-800"
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
              onClick={() => setType("physical")}
              className={cn(
                "rounded-xl border p-4 text-left transition-all",
                isPhysical
                  ? "border-blue-600 bg-blue-50 ring-1 ring-blue-200 dark:bg-blue-900/20 dark:ring-blue-800"
                  : "border-border hover:border-muted-foreground/30",
              )}
            >
              <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
                <MapPin className="h-4 w-4 text-blue-600" /> {t("locations.form.physical")}
              </div>
              <p className="mt-1 text-xs text-muted-foreground">{t("locations.form.physicalHint")}</p>
            </button>
          </div>
        </CardContent>
      </Card>

      {/* ── Ownership (project / my company / customer company) ── */}
      <GeneralTabOwnershipSection vm={vm} space={space} />

      {/* ── Location & timezone ── */}
      <GeneralTabLocationSection vm={vm} />

      {/* ── Save ── */}
      <div className="flex justify-end">
        <Button onClick={handleSave} disabled={mutation.isPending} className="min-w-[120px]">
          {mutation.isPending ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              {t("common.saving")}
            </>
          ) : (
            t("common.save")
          )}
        </Button>
      </div>

      {/* Full accountability audit trail — managers only (self-gated). */}
      <AuditTrail resourceType="locations" resourceId={space.id} />

      {/* Danger zone — delete (archive) this space. */}
      <DangerZone space={space} />
    </div>
  )
}
