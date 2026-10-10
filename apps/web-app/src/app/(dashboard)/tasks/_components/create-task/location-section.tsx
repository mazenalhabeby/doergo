"use client"

import { lazy, Suspense } from "react"
import { useTranslation } from "react-i18next"
import { Building2, Loader2, MapPin } from "lucide-react"
import { Label } from "@/components/ui/label"
import { CollapsibleSection } from "./collapsible-section"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { type CreateTaskForm } from "./use-create-task-form"

const LocationPicker = lazy(() =>
  import("@/components/location-picker").then((m) => ({ default: m.LocationPicker }))
)

/** Where: a client visit (CRM workspaces) and the place on the map. */
export function LocationSection({ form }: { form: CreateTaskForm }) {
  const { t } = useTranslation()
  const {
    defaultCustomerId,
    spaceId,
    hasModule,
    customerId,
    setCustomerId,
    visitAddressId,
    visitClients,
    visitAddressOptions,
    pinnedClient,
    applyVisitAddress,
    locationAddress,
    setLocationAddress,
    locationLat,
    setLocationLat,
    locationLng,
    setLocationLng,
    locationIndicator,
    isSubmitting,
  } = form

  return (
    <CollapsibleSection icon={MapPin} label={t("tasks.sidebar.location")} indicator={locationIndicator}>
      {/*
        A visit starts with a client. Pick them and the map below is
        already pointing at their door, which is the whole difference
        between "a task with GPS" and "a visit somebody can navigate to".
        Only where the workspace runs CRM — elsewhere this is a plain
        location and the picker would be noise.
      */}
      {/*
        Shown whenever the workspace runs CRM, EVEN WITH NO CLIENTS.

        ⚠️ It used to hide itself on an empty list, which is the same
        thing on screen as the feature not existing: a workspace with
        CRM and nothing filed to it showed no picker and no reason, and
        the only available conclusion was that visits were not built.
        An empty list is an answer and it says so below.
      */}
      {hasModule("crm") && spaceId !== "none" && (
        <div className="space-y-2 rounded-lg border border-border bg-muted/40 p-2.5">
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">
              {t("tasks.create.visitClient", "Client to visit")}
            </Label>
            <Select
              value={customerId}
              onValueChange={(v) => { setCustomerId(v); void applyVisitAddress(null) }}
              disabled={isSubmitting || !!defaultCustomerId}
            >
              <SelectTrigger className="h-9 rounded-lg border-border bg-card text-sm">
                <SelectValue placeholder={t("tasks.create.visitClientNone", "No client")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">{t("tasks.create.visitClientNone", "No client")}</SelectItem>
                {pinnedClient && !visitClients.some((c) => c.id === pinnedClient.id) && (
                  <SelectItem value={pinnedClient.id}>
                    <div className="flex items-center gap-2">
                      <Building2 className="size-3 text-muted-foreground" />
                      {pinnedClient.name}
                    </div>
                  </SelectItem>
                )}
                {visitClients.map((c: { id: string; name: string; spaceId?: string | null; address?: string | null }) => (
                  <SelectItem key={c.id} value={c.id}>
                    <div className="flex items-center gap-2">
                      <Building2 className="size-3 text-muted-foreground" />
                      <span>{c.name}</span>
                      {/* Which book they came from, and whether there is
                          anywhere to go — both decide-at-a-glance facts. */}
                      {!c.spaceId && (
                        <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
                          {t("tasks.create.visitClientUnfiled", "no workspace")}
                        </span>
                      )}
                      {!c.address && (
                        <span className="text-[10px] uppercase tracking-wide text-amber-600 dark:text-amber-500">
                          {t("tasks.create.visitClientNoAddress", "no address")}
                        </span>
                      )}
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {customerId !== "none" && visitAddressOptions.length > 0 && (
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">
                {t("tasks.create.visitAddress", "Which address")}
              </Label>
              <Select
                value={visitAddressId}
                onValueChange={(v) =>
                  void applyVisitAddress(visitAddressOptions.find((a) => a.id === v) ?? null)
                }
                disabled={isSubmitting}
              >
                <SelectTrigger className="h-9 rounded-lg border-border bg-card text-sm">
                  <SelectValue placeholder={t("tasks.create.visitAddressPick", "Pick a site")} />
                </SelectTrigger>
                <SelectContent>
                  {visitAddressOptions.map((a) => (
                    <SelectItem key={a.id} value={a.id}>
                      <div className="flex items-center gap-2">
                        <MapPin className="size-3 text-muted-foreground" />
                        <span>{a.name}</span>
                        {a.isPrimary && (
                          <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
                            {t("tasks.create.visitAddressPrimary", "primary")}
                          </span>
                        )}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Said plainly, because it is the difference between a route
              and a line on a map. */}
          {customerId !== "none" && visitAddressId !== "none" && locationLat === null && (
            <p className="text-xs text-amber-600 dark:text-amber-500">
              {t(
                "tasks.create.visitAddressNoPin",
                "This address has no map point yet, so the route cannot be tracked. Set it on the map below.",
              )}
            </p>
          )}
          {customerId !== "none" && visitAddressOptions.length === 0 && (
            <p className="text-xs text-muted-foreground">
              {t("tasks.create.visitNoAddresses", "This client has no address on file. Set the place on the map below.")}
            </p>
          )}
          {customerId === "none" && visitClients.length === 0 && (
            <p className="text-xs text-muted-foreground">
              {t("tasks.create.visitNoClients", "No clients in this workspace yet. Add one in CRM, or set the place on the map below.")}
            </p>
          )}
        </div>
      )}

      <Suspense
        fallback={
          <div className="h-[200px] rounded-lg border border-border bg-muted flex items-center justify-center">
            <Loader2 className="size-5 text-muted-foreground animate-spin" />
          </div>
        }
      >
        <LocationPicker
          address={locationAddress}
          lat={locationLat}
          lng={locationLng}
          variant="address"
          onLocationChange={(lat, lng) => { setLocationLat(lat); setLocationLng(lng) }}
          onAddressChange={setLocationAddress}
          onClear={() => { setLocationLat(null); setLocationLng(null) }}
          disabled={isSubmitting}
        />
      </Suspense>
    </CollapsibleSection>
  )
}
