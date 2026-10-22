"use client"

import { useState } from "react"
import dynamic from "next/dynamic"
import { useTranslation } from "react-i18next"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { MapPin, Plus, Star, Trash2, Pencil, ChevronDown, ChevronUp, Home, User, Phone } from "lucide-react"

import { customersApi, spacePortalApi, portalAdminApi, type CustomerAddress } from "@/lib/api"
import { notify } from "@/lib/toast"
import { cn } from "@/lib/utils"
import { Skeleton } from "@/components/ui/skeleton"
import { keys } from "@/lib/query-keys"
import { AssignDialog } from "./assign-unit-dialog"
import { AddressDialog } from "./address-dialog"

const AddressMap = dynamic(() => import("./address-map"), {
  ssr: false,
  loading: () => <div className="h-full w-full animate-pulse bg-muted" />,
})

/**
 * Addresses panel for a client record.
 *
 * For somebody IN a portal it takes that portal's vocabulary — a tenant's
 * addresses are "Apartments", and an apartment can be assigned from the space's
 * catalogue rather than typed.
 *
 * ⚠️ For everybody else it says "Addresses", and that had to be fixed: the space
 * portal was fetched for ANY client in a space that ran one, so a B2B company
 * with no portal at all found its addresses relabelled "Workspaces" because a
 * facilities portal existed elsewhere in the same space. A word belonging to
 * somebody else's product, on a record it has nothing to do with — and in this
 * case a word the product already uses for the space itself.
 */
export function AddressesPanel({
  customerId,
  spaceId,
  hasPortal,
  portalId,
  isPortalResident,
}: {
  customerId: string
  spaceId?: string
  hasPortal?: boolean
  portalId?: string
  isPortalResident?: boolean
}) {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const [showAll, setShowAll] = useState(false)

  const q = useQuery({
    queryKey: keys.customers.addresses(customerId),
    queryFn: () => customersApi.addresses(customerId),
  })
  /*
    The entity comes from the client's OWN portal — a space can run several with
    different entities.

    The fallback to the space's default portal is for a resident who has not been
    bound to a specific one, and ONLY for a resident: it used to run for every
    client in the space, which is how a company came to be told it had
    Workspaces. A client outside the portal has addresses, and that is all.
  */
  const custPortalQ = useQuery({
    queryKey: keys.portal.detail(portalId),
    queryFn: () => portalAdminApi.getPortal(portalId!),
    enabled: !!portalId,
  })
  const spacePortalQ = useQuery({
    queryKey: keys.spaces.portal(spaceId),
    queryFn: () => spacePortalApi.get(spaceId!),
    enabled: !portalId && !!spaceId && !!hasPortal && !!isPortalResident,
  })
  const portal = custPortalQ.data ?? spacePortalQ.data
  const addresses = q.data ?? []
  const primary = addresses.find((a) => a.isPrimary) ?? addresses[0] ?? null
  const others = addresses.filter((a) => a.id !== primary?.id)
  const invalidate = () => qc.invalidateQueries({ queryKey: keys.customers.addresses(customerId) })
  const entityLabel = portal?.entityLabel
  const label = entityLabel ? `${entityLabel}s` : t("customers.addresses", "Addresses")
  // "Assign from the catalog" only applies to the Apartment entity (the space's
  // managed apartment pool). Other entities (Order/Workspace) are added per-client.
  const isApartment = portal?.templateKey === "rental" || (entityLabel || "").toLowerCase().startsWith("apartment")
  // The apartment catalog lives in the PORTAL's space — scope assignment there so
  // apartments in other spaces are never offered (cross-space isolation).
  const assignSpaceId = custPortalQ.data?.spaceId ?? spaceId

  const setPrimary = useMutation({
    mutationFn: (unitId: string) => customersApi.setPrimaryAddress(customerId, unitId),
    onSuccess: invalidate,
  })
  const remove = useMutation({
    mutationFn: (unitId: string) => customersApi.removeAddress(customerId, unitId),
    onSuccess: () => {
      notify.success(t("customers.addressRemoved", "Address removed"))
      invalidate()
    },
  })

  return (
    <div className="overflow-hidden rounded-2xl border border-border/70 bg-card">
      <div className="flex items-center justify-between px-4 pt-4">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</p>
        <div className="flex items-center gap-3">
          {isApartment && assignSpaceId && (
            <AssignDialog
              spaceId={assignSpaceId}
              customerId={customerId}
              entityLabel={entityLabel!}
              onSaved={invalidate}
              trigger={
                <button
                  className={"inline-flex items-center gap-1 text-xs font-medium text-primary " + "hover:underline"}
                >
                  <Home className="h-3.5 w-3.5" /> {t("customers.assign", "Assign")}
                </button>
              }
            />
          )}
          <AddressDialog
            customerId={customerId}
            onSaved={invalidate}
            isFirst={addresses.length === 0}
            trigger={
              <button
                className={"inline-flex items-center gap-1 text-xs font-medium text-primary " + "hover:underline"}
              >
                <Plus className="h-3.5 w-3.5" /> {t("customers.addAddress", "Add")}
              </button>
            }
          />
        </div>
      </div>

      {q.isLoading ? (
        <div className="p-4">
          <Skeleton className="h-40 w-full rounded-lg" />
        </div>
      ) : !primary ? (
        <p className="px-4 py-6 text-center text-sm text-muted-foreground">
          {t("customers.noAddress", "No address yet. Add one to show it on the map.")}
        </p>
      ) : (
        <div className="p-4 pt-3">
          {/* Map for the primary address */}
          {primary.lat != null && primary.lng != null && (
            <div className="mb-3 h-40 overflow-hidden rounded-lg border border-border">
              <AddressMap lat={primary.lat} lng={primary.lng} />
            </div>
          )}
          {/* Primary address row */}
          <AddressRow
            addr={primary}
            isPrimary
            onRemove={others.length + 1 > 1 ? () => remove.mutate(primary.id) : undefined}
            customerId={customerId}
            onSaved={invalidate}
          />

          {/* Others */}
          {others.length > 0 && (
            <div className="mt-2">
              <button
                onClick={() => setShowAll((v) => !v)}
                className={
                  "flex items-center gap-1 text-xs font-medium text-muted-foreground " + "hover:text-foreground"
                }
              >
                {showAll ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                {showAll
                  ? t("customers.hide", "Hide")
                  : t("customers.moreAddresses", "+{{count}} more", { count: others.length })}
              </button>
              {showAll && (
                <div className="mt-2 space-y-1.5">
                  {others.map((a) => (
                    <AddressRow
                      key={a.id}
                      addr={a}
                      customerId={customerId}
                      onSaved={invalidate}
                      onMakePrimary={() => setPrimary.mutate(a.id)}
                      onRemove={() => remove.mutate(a.id)}
                    />
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function AddressRow({
  addr,
  isPrimary,
  customerId,
  onSaved,
  onMakePrimary,
  onRemove,
}: {
  addr: CustomerAddress
  isPrimary?: boolean
  customerId: string
  onSaved: () => void
  onMakePrimary?: () => void
  onRemove?: () => void
}) {
  const { t } = useTranslation()
  return (
    <div className="group flex items-start gap-2 rounded-lg border border-border/60 p-2.5">
      <MapPin className={cn("mt-0.5 h-4 w-4 shrink-0", isPrimary ? "text-primary" : "text-muted-foreground")} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <span className="truncate text-sm font-medium text-foreground">{addr.name}</span>
          {isPrimary && (
            <span
              className={
                "inline-flex items-center gap-0.5 rounded-full bg-primary/10 px-1.5 " +
                "py-0.5 text-[10px] font-semibold text-primary"
              }
            >
              <Star className="h-2.5 w-2.5 fill-current" /> {t("customers.primary", "Primary")}
            </span>
          )}
        </div>
        {addr.address && addr.address !== addr.name && (
          <p className="truncate text-xs text-muted-foreground">{addr.address}</p>
        )}
        {addr.contactName && (
          <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1">
              <User className="h-3 w-3" /> {addr.contactName}
            </span>
            {addr.contactPhone && (
              <a href={`tel:${addr.contactPhone}`} className="inline-flex items-center gap-1 hover:text-primary">
                <Phone className="h-3 w-3" /> {addr.contactPhone}
              </a>
            )}
          </p>
        )}
      </div>
      <div className="flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
        {onMakePrimary && (
          <button
            title={t("customers.makePrimary", "Make primary")}
            onClick={onMakePrimary}
            className="rounded p-1 text-muted-foreground hover:text-primary"
          >
            <Star className="h-3.5 w-3.5" />
          </button>
        )}
        <AddressDialog
          customerId={customerId}
          existing={addr}
          onSaved={onSaved}
          trigger={
            <button className="rounded p-1 text-muted-foreground hover:text-foreground">
              <Pencil className="h-3.5 w-3.5" />
            </button>
          }
        />
        {onRemove && (
          <button
            title={t("common.remove", "Remove")}
            onClick={onRemove}
            className="rounded p-1 text-muted-foreground hover:text-destructive"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
    </div>
  )
}
