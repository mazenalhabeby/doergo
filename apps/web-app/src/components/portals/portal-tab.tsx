"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { useTranslation } from "react-i18next"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { Plus, LayoutGrid, Loader2, Lock, Blocks } from "lucide-react"

import { spacePortalApi, type PortalSummary } from "@/lib/api"
import { portalTile } from "@/lib/portal-ui"
import { accessAllows, isAdmin } from "@hbcfield/shared/client"
import { useAuth } from "@/contexts/auth-context"
import { notify } from "@/lib/toast"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Skeleton } from "@/components/ui/skeleton"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { EmptyState } from "@/components/ui/empty-state"
import { Icon } from "@/components/ui/icon"
import { PortalCard } from "./portal-card"
import { TEMPLATES } from "./portal-templates"
import { keys } from "@/lib/query-keys"

export function PortalTab({
  spaceId,
  hasApartments,
  onOpenModules,
}: {
  spaceId: string
  hasApartments?: boolean
  onOpenModules?: () => void
}) {
  const { t } = useTranslation()
  const router = useRouter()
  const qc = useQueryClient()
  const portalsQ = useQuery({
    queryKey: keys.spaces.portals(spaceId),
    queryFn: () => spacePortalApi.listPortals(spaceId),
  })
  const portals = portalsQ.data ?? []
  const [createOpen, setCreateOpen] = useState(false)
  /*
    Creating a portal is a manager's act (`canManagePortals` here or org-wide) —
    and a workspace's second portal is a billed line. Somebody who only reads or
    answers this workspace's portal (an external member included) sees the
    portals, never the way to make one.
  */
  const { user } = useAuth()
  const mayCreate =
    !!user &&
    (isAdmin(user) || user.canManagePortals === true || accessAllows(user.access as never, "canManagePortals", spaceId))

  return (
    <div className="space-y-3.5">
      {/* What a portal is, said once, with the way to make one beside it (Clients.dc.html — the `puone` line). */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex min-w-0 flex-1 items-start gap-2.5 rounded-[14px] bg-shell-chip px-3.5 py-3 text-[13px] text-muted-foreground">
          <Icon name="info" size={18} className="shrink-0 text-shell-accent" />
          <span>
            {t(
              "portal.introMulti",
              "This space's B2C portals. Clients you invite log in to order & follow. " + "Run as many as you need.",
            )}
          </span>
        </div>
        {mayCreate && portals.length > 0 && (
          <Button size="pillLg" onClick={() => setCreateOpen(true)}>
            <Plus /> {t("portal.createPortal", "Create portal")}
          </Button>
        )}
      </div>

      {portalsQ.isLoading ? (
        <div className="grid gap-3.5 sm:grid-cols-[repeat(auto-fill,minmax(340px,1fr))]">
          {[0, 1].map((i) => (
            <Skeleton key={i} className="h-40 w-full rounded-[22px]" />
          ))}
        </div>
      ) : portals.length === 0 ? (
        mayCreate ? (
          <EmptyState
            icon={LayoutGrid}
            title={t("portal.emptyTitle", "No portals yet")}
            description={t(
              "portal.emptyHintSpace",
              "Create a portal for this workspace — pick a type, then invite your " + "clients.",
            )}
            action={
              <Button size="pill" onClick={() => setCreateOpen(true)}>
                <Plus /> {t("portal.createPortal", "Create portal")}
              </Button>
            }
          />
        ) : (
          <EmptyState
            icon={LayoutGrid}
            title={t("portal.noPortalYetTitle")}
            description={t("portal.noPortalYetHint")}
          />
        )
      ) : (
        <div className="grid gap-3.5 sm:grid-cols-[repeat(auto-fill,minmax(340px,1fr))]">
          {portals.map((p: PortalSummary) => (
            <PortalCard key={p.id} p={p} onOpen={() => router.push(`/locations/${spaceId}/portals/${p.id}`)} />
          ))}
        </div>
      )}

      {mayCreate && (
        <CreatePortalDialog
          spaceId={spaceId}
          hasApartments={hasApartments}
          onOpenModules={onOpenModules}
          open={createOpen}
          onOpenChange={setCreateOpen}
          onCreated={(id) => {
            qc.invalidateQueries({
              queryKey: keys.spaces.portals(spaceId),
            })
            router.push(`/locations/${spaceId}/portals/${id}`)
          }}
        />
      )}
    </div>
  )
}

function CreatePortalDialog({
  spaceId,
  hasApartments,
  onOpenModules,
  open,
  onOpenChange,
  onCreated,
}: {
  spaceId: string
  hasApartments?: boolean
  onOpenModules?: () => void
  open: boolean
  onOpenChange: (o: boolean) => void
  onCreated: (id: string) => void
}) {
  const { t } = useTranslation()
  // Default to a type the space can actually create: Apartment (rental) needs the
  // Apartments module, so start elsewhere when it's off.
  const [tpl, setTpl] = useState(hasApartments ? "rental" : "logistics")
  const [name, setName] = useState("")
  const rentalLocked = !hasApartments

  const create = useMutation({
    mutationFn: () => spacePortalApi.createPortal(spaceId, tpl, name.trim() || undefined),
    onSuccess: (p) => {
      onOpenChange(false)
      setName("")
      setTpl("rental")
      onCreated(p.id)
    },
    onError: (e: Error) => notify.error(e.message || "Could not create"),
  })

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onOpenChange(false)}>
      <DialogContent className="max-h-[88vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t("portal.createPortal", "Create portal")}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <Label>{t("portal.portalName", "Portal name")}</Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t("portal.namePlaceholder", "Rivergate Rentals")}
            />
          </div>
          <div>
            <Label>{t("portal.pickType", "Type")}</Label>
            <div className="mt-1.5 space-y-2">
              {TEMPLATES.map((x) => {
                const active = tpl === x.key
                const locked = x.key === "rental" && rentalLocked
                return (
                  <button
                    key={x.key}
                    type="button"
                    disabled={locked}
                    onClick={() => setTpl(x.key)}
                    className={cn(
                      "relative flex w-full items-start gap-3 rounded-xl border p-3 text-left transition-colors",
                      locked
                        ? "cursor-not-allowed border-dashed border-shell-warn"
                        : active
                          ? "border-primary bg-shell-accent-soft ring-1 ring-inset ring-primary/20"
                          : "border-border hover:border-border/80 hover:bg-accent/30",
                    )}
                  >
                    <span
                      className={cn(
                        "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-[11px] " + "font-semibold",
                        locked ? "bg-shell-chip text-shell-warn" : portalTile(x.accent),
                      )}
                    >
                      {locked ? <Lock className="h-4 w-4" /> : t(`portal.type.${x.key}`, x.badge).slice(0, 2)}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-2">
                        <span
                          className={cn(
                            "block text-sm font-medium",
                            locked ? "text-muted-foreground" : "text-foreground",
                          )}
                        >
                          {t(`portal.tpl.${x.key}`, x.label)}
                        </span>
                        {locked && (
                          <span
                            className={
                              "rounded-full bg-shell-chip px-1.5 py-0.5 text-[10px] font-semibold " +
                              "uppercase tracking-wide text-shell-warn"
                            }
                          >
                            {t("portal.locked", "Locked")}
                          </span>
                        )}
                      </span>
                      <span className="mt-0.5 block text-xs text-muted-foreground">
                        {locked
                          ? t(
                              "portal.apartmentModuleNeeded",
                              "Needs the Assets module — this portal manages apartments, and apartments " +
                                "are assets.",
                            )
                          : t(`portal.blurb.${x.key}`, x.blurb)}
                      </span>
                    </span>
                  </button>
                )
              })}
            </div>

            {/* Actionable hint when Apartment type is locked — jump to Modules. */}
            {rentalLocked && (
              <div className="mt-2 flex items-center gap-2.5 rounded-[14px] bg-shell-chip px-3 py-2.5">
                <Lock className="h-4 w-4 shrink-0 text-shell-warn" />
                <p className="min-w-0 flex-1 text-xs text-shell-warn">
                  {t(
                    "portal.apartmentLockHint",
                    "To create a Rental / Property (Apartment) portal, turn on the Apartments " +
                      "module for this workspace first.",
                  )}
                </p>
                {onOpenModules && (
                  <button
                    type="button"
                    onClick={() => {
                      onOpenChange(false)
                      onOpenModules()
                    }}
                    className={
                      "inline-flex h-8 shrink-0 items-center gap-1 rounded-full border border-border bg-card " +
                      "px-3 text-xs font-semibold text-foreground hover:bg-accent"
                    }
                  >
                    <Blocks className="h-3.5 w-3.5" /> {t("portal.enableInModules", "Enable in Modules")}
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            {t("common.cancel", "Cancel")}
          </Button>
          <Button disabled={create.isPending || (tpl === "rental" && rentalLocked)} onClick={() => create.mutate()}>
            {create.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {t("portal.createPortal", "Create portal")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
