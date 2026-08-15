"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { useTranslation } from "react-i18next"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { Building2, Plus, Users, ListChecks, ChevronRight, LayoutGrid, Loader2 } from "lucide-react"

import { spacePortalApi, type PortalSummary } from "@/lib/api"
import { portalTile } from "@/lib/portal-ui"
import { notify } from "@/lib/toast"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog"
import { SectionHeader } from "./section-header"

// Same portal-type language as the org Clients Portals page.
const TEMPLATES = [
  { key: "rental", label: "Rental / Property", badge: "Rental", entity: "Apartment", blurb: "Tenants report maintenance issues (AC, plumbing…).", accent: "emerald" },
  { key: "logistics", label: "Logistics / Delivery", badge: "Logistics", entity: "Order", blurb: "Recipients report delivery problems (not arrived, damaged…).", accent: "orange" },
  { key: "workplace", label: "Workplace / Facilities", badge: "Workplace", entity: "Workspace", blurb: "Employees report facility issues (HVAC, lighting, IT…).", accent: "cyan" },
  { key: "custom", label: "Units (generic)", badge: "Units", entity: "Unit", blurb: "Generic units your clients are tied to.", accent: "slate" },
] as const
const BY_KEY = Object.fromEntries(TEMPLATES.map((x) => [x.key, x]))
const portalInitials = (n?: string) => (n || "?").trim().split(/\s+/).slice(0, 2).map((s) => s[0]?.toUpperCase() ?? "").join("") || "?"

export function PortalTab({ spaceId }: { spaceId: string }) {
  const { t } = useTranslation()
  const router = useRouter()
  const qc = useQueryClient()
  const portalsQ = useQuery({ queryKey: ["space-portals", spaceId], queryFn: () => spacePortalApi.listPortals(spaceId) })
  const portals = portalsQ.data ?? []
  const [createOpen, setCreateOpen] = useState(false)

  return (
    <div className="space-y-6">
      <SectionHeader
        icon={Building2}
        accent="violet"
        title={t("portal.title", "Client portals")}
        description={t("portal.introMulti", "This space's B2C portals. Clients you invite log in to order & follow. Run as many as you need.")}
        action={<Button size="sm" onClick={() => setCreateOpen(true)}><Plus className="mr-1.5 h-4 w-4" /> {t("portal.createPortal", "Create portal")}</Button>}
      />

      {portalsQ.isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2">
          {[0, 1].map((i) => <Skeleton key={i} className="h-36 w-full rounded-2xl" />)}
        </div>
      ) : portals.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed bg-muted/20 px-6 py-16 text-center">
          <span className="flex size-14 items-center justify-center rounded-2xl bg-muted text-muted-foreground"><LayoutGrid className="h-6 w-6" /></span>
          <p className="mt-4 text-sm font-semibold text-foreground">{t("portal.emptyTitle", "No portals yet")}</p>
          <p className="mt-1 max-w-sm text-xs text-muted-foreground">{t("portal.emptyHintSpace", "Create a portal for this space — pick a type, then invite your clients.")}</p>
          <Button onClick={() => setCreateOpen(true)} className="mt-4 gap-1.5"><Plus className="h-4 w-4" /> {t("portal.createPortal", "Create portal")}</Button>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {portals.map((p: PortalSummary) => {
            const meta = BY_KEY[p.templateKey] ?? BY_KEY.custom
            return (
              <button key={p.id} onClick={() => router.push(`/locations/${spaceId}/portals/${p.id}`)}
                className="group rounded-2xl border border-border bg-card p-5 text-left transition-all hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40">
                <div className="flex items-start justify-between gap-3">
                  <div className={cn("flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-sm font-semibold", portalTile(meta.accent))}>{portalInitials(p.name)}</div>
                  <span className={cn("inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-medium", portalTile(meta.accent))}>{t(`portal.type.${meta.key}`, meta.badge)}</span>
                </div>
                <p className="mt-4 truncate font-semibold text-foreground">{p.name}</p>
                <p className="truncate text-xs text-muted-foreground">{t("portal.entityIs", "Entity: {{e}}", { e: p.entityLabel })}</p>
                <div className="mt-4 flex items-center justify-between">
                  <div className="flex gap-4 text-xs text-muted-foreground">
                    <span className="inline-flex items-center gap-1"><Users className="h-3.5 w-3.5" /><span className="font-medium text-foreground tabular-nums">{p.residentCount}</span> {t("portal.residents", "clients")}</span>
                    <span className="inline-flex items-center gap-1"><ListChecks className="h-3.5 w-3.5" /><span className="font-medium text-foreground tabular-nums">{p.categoryCount}</span> {t("portal.categories", "categories")}</span>
                  </div>
                  <ChevronRight className="h-4 w-4 text-muted-foreground/40 transition-all group-hover:translate-x-0.5 group-hover:text-primary" />
                </div>
              </button>
            )
          })}
        </div>
      )}

      <CreatePortalDialog spaceId={spaceId} open={createOpen} onOpenChange={setCreateOpen}
        onCreated={(id) => { qc.invalidateQueries({ queryKey: ["space-portals", spaceId] }); router.push(`/locations/${spaceId}/portals/${id}`) }} />
    </div>
  )
}

function CreatePortalDialog({ spaceId, open, onOpenChange, onCreated }: {
  spaceId: string; open: boolean; onOpenChange: (o: boolean) => void; onCreated: (id: string) => void
}) {
  const { t } = useTranslation()
  const [tpl, setTpl] = useState("rental")
  const [name, setName] = useState("")

  const create = useMutation({
    mutationFn: () => spacePortalApi.createPortal(spaceId, tpl, name.trim() || undefined),
    onSuccess: (p) => { onOpenChange(false); setName(""); setTpl("rental"); onCreated(p.id) },
    onError: (e: any) => notify.error(e.message || "Could not create"),
  })

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onOpenChange(false)}>
      <DialogContent className="max-h-[88vh] max-w-md overflow-y-auto">
        <DialogHeader><DialogTitle>{t("portal.createPortal", "Create portal")}</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <div>
            <Label>{t("portal.portalName", "Portal name")}</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Rivergate Rentals" />
          </div>
          <div>
            <Label>{t("portal.pickType", "Type")}</Label>
            <div className="mt-1.5 space-y-2">
              {TEMPLATES.map((x) => {
                const active = tpl === x.key
                return (
                  <button key={x.key} type="button" onClick={() => setTpl(x.key)}
                    className={cn("flex w-full items-start gap-3 rounded-xl border p-3 text-left transition-colors",
                      active ? "border-primary bg-primary/5 ring-1 ring-inset ring-primary/20" : "border-border hover:border-border/80 hover:bg-accent/30")}>
                    <span className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-[11px] font-semibold", portalTile(x.accent))}>{t(`portal.type.${x.key}`, x.badge).slice(0, 2)}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-medium text-foreground">{t(`portal.tpl.${x.key}`, x.label)}</span>
                      <span className="mt-0.5 block text-xs text-muted-foreground">{t(`portal.blurb.${x.key}`, x.blurb)}</span>
                    </span>
                  </button>
                )
              })}
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>{t("common.cancel", "Cancel")}</Button>
          <Button disabled={create.isPending} onClick={() => create.mutate()}>
            {create.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {t("portal.createPortal", "Create portal")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
