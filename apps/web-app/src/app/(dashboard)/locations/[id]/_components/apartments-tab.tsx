"use client"

import { useRouter } from "next/navigation"
import { useTranslation } from "react-i18next"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { Home, Plus, Trash2, Pencil, User, Smartphone } from "lucide-react"

import { spaceUnitsApi, spacePortalApi, isApartmentPortal, type SpaceUnit } from "@/lib/api"
import { notify } from "@/lib/toast"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { SectionHeader, EmptyState } from "./section-header"
import { ApartmentDialog } from "./apartment-dialog"

export function ApartmentsTab({ spaceId, hasB2C }: { spaceId: string; hasB2C?: boolean }) {
  const { t } = useTranslation()
  const router = useRouter()
  const qc = useQueryClient()
  const unitsQ = useQuery({ queryKey: ["space-units-dir", spaceId], queryFn: () => spaceUnitsApi.list(spaceId) })
  const units = unitsQ.data ?? []
  // Active portals whose entity is Apartment → a unit can host a client resident.
  // Guard on hasB2C: React Query keeps the cached list after the query is
  // disabled, so without this the Clients tab would linger once B2C is turned off.
  const portalsQ = useQuery({ queryKey: ["space-portals", spaceId], queryFn: () => spacePortalApi.listPortals(spaceId), enabled: !!hasB2C })
  const apartmentPortalIds = hasB2C ? (portalsQ.data ?? []).filter((p) => p.isActive && isApartmentPortal(p)).map((p) => p.id) : []
  const invalidate = () => qc.invalidateQueries({ queryKey: ["space-units-dir", spaceId] })

  const del = useMutation({
    mutationFn: (unitId: string) => spaceUnitsApi.remove(spaceId, unitId),
    onSuccess: () => { notify.success(t("apartments.removed", "Removed")); invalidate() },
  })

  return (
    <div className="space-y-5">
      <SectionHeader
        icon={Home}
        accent="sky"
        title={t("apartments.title", "Apartments / Units")}
        description={t("apartments.introHousing", "Apartments this space owns. Give one to a member to live in — or, with a client portal, to a client. Work on them is handled by tasks.")}
        action={<ApartmentDialog spaceId={spaceId} apartmentPortalIds={apartmentPortalIds} onSaved={invalidate} trigger={
          <Button size="sm"><Plus className="mr-1.5 h-4 w-4" /> {t("apartments.add", "Add apartment")}</Button>
        } />}
      />

      {unitsQ.isLoading ? (
        <div className="space-y-2">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-16 w-full rounded-xl" />)}</div>
      ) : units.length === 0 ? (
        <EmptyState icon={Home} title={t("apartments.empty", "No apartments yet")} />
      ) : (
        <div className="space-y-2">
          {units.map((u: SpaceUnit) => (
            <div key={u.id} className="group flex items-center gap-3 rounded-xl border border-border bg-card p-3 transition-colors hover:border-primary/40">
              <button onClick={() => router.push(`/apartments/${u.id}`)} className="flex min-w-0 flex-1 items-center gap-3 text-left">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-cyan-500/15 text-cyan-600 dark:text-cyan-400"><Home className="h-4 w-4" /></span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-foreground group-hover:text-primary">{u.name}</p>
                  {u.address && u.address !== u.name && <p className="truncate text-xs text-muted-foreground">{u.address}</p>}
                </div>
              </button>
              <ResidentBadge unit={u} />
              <ApartmentDialog spaceId={spaceId} apartmentPortalIds={apartmentPortalIds} existing={u} onSaved={invalidate} trigger={
                <button className="rounded p-1 text-muted-foreground opacity-0 transition-opacity hover:text-foreground group-hover:opacity-100"><Pencil className="h-4 w-4" /></button>
              } />
              <button onClick={() => del.mutate(u.id)} className="rounded p-1 text-muted-foreground opacity-0 transition-opacity hover:text-destructive group-hover:opacity-100"><Trash2 className="h-4 w-4" /></button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function ResidentBadge({ unit }: { unit: SpaceUnit }) {
  const { t } = useTranslation()
  if (unit.residentUser) {
    return <Badge variant="secondary" className="gap-1"><User className="h-3 w-3" /> {`${unit.residentUser.firstName} ${unit.residentUser.lastName}`.trim()}</Badge>
  }
  if (unit.customer) {
    return <Badge className="gap-1 bg-emerald-100 text-emerald-700 hover:bg-emerald-100 dark:bg-emerald-950/50 dark:text-emerald-300"><Smartphone className="h-3 w-3" /> {unit.customer.name}</Badge>
  }
  return <Badge variant="outline" className="text-muted-foreground">{t("apartments.vacant", "Vacant")}</Badge>
}
