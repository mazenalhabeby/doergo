"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { useTranslation } from "react-i18next"
import { Plus, Users, ListChecks, LayoutGrid } from "lucide-react"

import { portalAdminApi, type PortalSummary } from "@/lib/api"
import { portalTile } from "@/lib/portal-ui"
import { notify } from "@/lib/toast"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"

const TEMPLATES = [
  { key: "rental", label: "Rental / Property", entity: "Apartment", blurb: "Tenants report maintenance issues (AC, plumbing…).", accent: "emerald" },
  { key: "logistics", label: "Logistics / Delivery", entity: "Order", blurb: "Recipients report delivery problems (not arrived, damaged…).", accent: "orange" },
  { key: "workplace", label: "Workplace / Facilities", entity: "Workspace", blurb: "Employees report facility issues (HVAC, lighting, IT…).", accent: "cyan" },
]
const BY_KEY = Object.fromEntries(TEMPLATES.map((t) => [t.key, t]))

export default function CustomerPortalsPage() {
  const qc = useQueryClient()
  const router = useRouter()
  const { t } = useTranslation()

  const portalsQ = useQuery({ queryKey: ["portals"], queryFn: portalAdminApi.listPortals })

  const [createOpen, setCreateOpen] = useState(false)
  const [tpl, setTpl] = useState("rental")
  const [name, setName] = useState("")
  const createM = useMutation({
    mutationFn: () => portalAdminApi.createPortal(tpl, name.trim() || undefined),
    onSuccess: (p) => { qc.invalidateQueries({ queryKey: ["portals"] }); setCreateOpen(false); setName(""); router.push(`/customer-portal/${p.id}`) },
    onError: (e) => notify.error(e instanceof Error ? e.message : t("common.error", "Something went wrong")),
  })

  const portals = portalsQ.data ?? []

  return (
    <div className="min-h-full bg-background">
      <div className="max-w-screen-lg mx-auto px-6 py-8">
        {/* Header */}
        <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold text-foreground tracking-tight">
              {t("portal.pageTitle", "Clients Portals")} {portals.length > 0 && <span className="text-muted-foreground font-normal text-xl">({portals.length})</span>}
            </h1>
            <p className="mt-1.5 text-sm text-muted-foreground max-w-xl">{t("portal.pageSubtitle", "Your B2C portals — let your clients (residents/customers) report issues from their phone. Run as many as you need.")}</p>
          </div>
          <Button onClick={() => setCreateOpen(true)} className="h-11 rounded-xl shadow-sm gap-1.5"><Plus className="h-4 w-4" />{t("portal.createPortal", "Create portal")}</Button>
        </div>

        {portalsQ.isLoading ? (
          <div className="p-10 text-center text-sm text-muted-foreground">{t("common.loading", "Loading…")}</div>
        ) : portals.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border bg-card p-14 text-center">
            <LayoutGrid className="h-10 w-10 mx-auto text-muted-foreground/40 mb-3" />
            <p className="text-foreground font-medium">{t("portal.emptyTitle", "No portals yet")}</p>
            <p className="text-sm text-muted-foreground mt-1 mb-5 max-w-sm mx-auto">{t("portal.emptyHint", "Create your first portal — pick a type, and invite your clients.")}</p>
            <Button onClick={() => setCreateOpen(true)} className="gap-1.5"><Plus className="h-4 w-4" />{t("portal.createPortal", "Create portal")}</Button>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {portals.map((p: PortalSummary) => {
              const meta = BY_KEY[p.templateKey] ?? BY_KEY.rental
              return (
                <button key={p.id} onClick={() => router.push(`/customer-portal/${p.id}`)}
                  className="rounded-2xl border border-border bg-card p-5 text-left hover:bg-accent/30 hover:border-primary/40 transition-colors">
                  <div className="flex items-start justify-between">
                    <div className={`h-11 w-11 rounded-lg flex items-center justify-center shrink-0 text-sm font-semibold ${portalTile(meta.accent)}`}>{initials(p.name)}</div>
                    <span className="inline-flex items-center rounded-full bg-muted px-2.5 py-0.5 text-[11px] font-medium capitalize text-muted-foreground">{p.templateKey}</span>
                  </div>
                  <p className="mt-4 font-semibold text-foreground truncate">{p.name}</p>
                  <p className="text-xs text-muted-foreground">{t("portal.entityIs", "Entity: {{e}}", { e: p.entityLabel })}</p>
                  <div className="mt-4 flex gap-4 text-xs text-muted-foreground">
                    <span className="inline-flex items-center gap-1"><Users className="h-3.5 w-3.5" /><span className="font-medium text-foreground tabular-nums">{p.residentCount}</span> {t("portal.residents", "clients")}</span>
                    <span className="inline-flex items-center gap-1"><ListChecks className="h-3.5 w-3.5" /><span className="font-medium text-foreground tabular-nums">{p.categoryCount}</span> {t("portal.categories", "categories")}</span>
                  </div>
                </button>
              )
            })}
          </div>
        )}
      </div>

      {/* Create portal */}
      <Dialog open={createOpen} onOpenChange={(o) => !o && setCreateOpen(false)}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>{t("portal.createPortal", "Create portal")}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div><Label>{t("portal.portalName", "Portal name")}</Label><Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Rivergate Rentals" /></div>
            <div>
              <Label>{t("portal.pickType", "Type")}</Label>
              <div className="mt-1.5 space-y-2">
                {TEMPLATES.map((x) => {
                  const active = tpl === x.key
                  return (
                    <button key={x.key} onClick={() => setTpl(x.key)}
                      className={`w-full rounded-xl border p-3 text-left transition-colors ${active ? "border-primary bg-primary/5 ring-1 ring-inset ring-primary/20" : "border-border hover:border-border/80 hover:bg-accent/30"}`}>
                      <p className="text-sm font-medium text-foreground">{x.label}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">{x.blurb}</p>
                    </button>
                  )
                })}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setCreateOpen(false)}>{t("common.cancel", "Cancel")}</Button>
            <Button disabled={createM.isPending} onClick={() => createM.mutate()}>{t("portal.createPortal", "Create portal")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function initials(name?: string) {
  return (name || "?").trim().split(/\s+/).slice(0, 2).map((s) => s[0]?.toUpperCase() ?? "").join("") || "?"
}
