"use client"

import { useState } from "react"
import { useParams, useRouter } from "next/navigation"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { useTranslation } from "react-i18next"
import { ArrowLeft, Plus, Trash2, Ticket, Copy, Check, Pencil, AlertTriangle, Inbox, Users, ListChecks, ChevronRight, Loader2, Repeat } from "lucide-react"

import { portalAdminApi, type PortalIntakeCategory, type Customer, type PortalCategoryInput, type PortalRequestView } from "@/lib/api"
import { portalTile } from "@/lib/portal-ui"
import { notify } from "@/lib/toast"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog"

const TEMPLATES = [
  { key: "rental", label: "Rental / Property", badge: "Rental", accent: "emerald" },
  { key: "logistics", label: "Logistics / Delivery", badge: "Logistics", accent: "orange" },
  { key: "workplace", label: "Workplace / Facilities", badge: "Workplace", accent: "cyan" },
]
const TPL_BY_KEY = Object.fromEntries(TEMPLATES.map((x) => [x.key, x]))
const COLORS = ["emerald", "blue", "amber", "purple", "cyan", "indigo", "red", "orange", "slate"]
const EMPTY_CAT: PortalCategoryInput = { label: "", icon: "plus", color: "slate", urgent: false, team: "", issues: [] }

const STATUS_STYLES: Record<string, string> = {
  NEW: "bg-blue-500/10 text-blue-600 dark:text-blue-400", ASSIGNED: "bg-purple-500/10 text-purple-600 dark:text-purple-400",
  ACCEPTED: "bg-indigo-500/10 text-indigo-600 dark:text-indigo-400", IN_PROGRESS: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
  BLOCKED: "bg-red-500/10 text-red-600 dark:text-red-400", COMPLETED: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  CLOSED: "bg-slate-500/10 text-slate-500 dark:text-slate-400", CANCELED: "bg-slate-500/10 text-slate-500 dark:text-slate-400",
}
const PRIORITY_DOT: Record<string, string> = {
  URGENT: "bg-red-500", HIGH: "bg-orange-500", MEDIUM: "bg-blue-500", LOW: "bg-slate-400",
}

export default function PortalDetailPage() {
  const { id } = useParams<{ id: string }>()
  const qc = useQueryClient()
  const router = useRouter()
  const { t } = useTranslation()

  const portalQ = useQuery({ queryKey: ["portal", id], queryFn: () => portalAdminApi.getPortal(String(id)) })
  const residentsQ = useQuery({ queryKey: ["portalResidents", id], queryFn: () => portalAdminApi.residents(String(id)) })
  const requestsQ = useQuery({ queryKey: ["portalAllRequests", id], queryFn: () => portalAdminApi.portalRequests(String(id)) })
  const portal = portalQ.data
  const categories = portal?.categories ?? []
  const meta = TPL_BY_KEY[portal?.templateKey ?? ""] ?? TPL_BY_KEY.rental
  const inv = (k: string) => qc.invalidateQueries({ queryKey: [k, id] })

  // Switch type / delete portal
  const [typePickerOpen, setTypePickerOpen] = useState(false)
  const [switchOpen, setSwitchOpen] = useState<string | null>(null)
  const switchM = useMutation({
    mutationFn: (templateKey: string) => portalAdminApi.updatePortal(String(id), { templateKey, reseed: true }),
    onSuccess: () => { inv("portal"); setSwitchOpen(null); notify.success(t("portal.switched", "Type switched")) },
    onError: (e) => notify.error(e instanceof Error ? e.message : t("common.error", "Something went wrong")),
  })
  const delPortalM = useMutation({
    mutationFn: () => portalAdminApi.deletePortal(String(id)),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["portals"] }); notify.success(t("portal.deleted", "Portal deleted")); router.push("/customer-portal") },
    onError: (e) => notify.error(e instanceof Error ? e.message : t("common.error", "Something went wrong")),
  })
  const [delPortalOpen, setDelPortalOpen] = useState(false)
  const [delConfirmText, setDelConfirmText] = useState("")
  const canDeletePortal = !!portal && delConfirmText.trim() === portal.name

  // Categories
  const [catEdit, setCatEdit] = useState<PortalIntakeCategory | "new" | null>(null)
  const [catForm, setCatForm] = useState<PortalCategoryInput>(EMPTY_CAT)
  const [catRemove, setCatRemove] = useState<PortalIntakeCategory | null>(null)
  const openNewCat = () => { setCatForm(EMPTY_CAT); setCatEdit("new") }
  const openEditCat = (c: PortalIntakeCategory) => { setCatForm({ label: c.label, icon: c.icon ?? "plus", color: c.color ?? "slate", urgent: c.urgent, team: c.team ?? "", issues: c.issues ?? [] }); setCatEdit(c) }
  const saveCatM = useMutation({
    mutationFn: () => catEdit === "new"
      ? portalAdminApi.createCategory({ ...catForm, portalId: String(id), key: catForm.label.toLowerCase().replace(/[^a-z0-9]+/g, "_") })
      : portalAdminApi.updateCategory((catEdit as PortalIntakeCategory).id, catForm),
    onSuccess: () => { inv("portal"); setCatEdit(null) },
    onError: (e) => notify.error(e instanceof Error ? e.message : t("common.error", "Something went wrong")),
  })
  const delCatM = useMutation({
    mutationFn: (cid: string) => portalAdminApi.deleteCategory(cid),
    onSuccess: () => { inv("portal"); setCatRemove(null) },
    onError: (e) => notify.error(e instanceof Error ? e.message : t("common.error", "Something went wrong")),
  })

  // Invite client
  const [inviteOpen, setInviteOpen] = useState(false)
  const [res, setRes] = useState({ name: "", email: "", unitName: "", unitAddress: "" })
  const [code, setCode] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const resetInvite = () => { setInviteOpen(false); setCode(null); setRes({ name: "", email: "", unitName: "", unitAddress: "" }) }
  const inviteM = useMutation({
    mutationFn: () => portalAdminApi.inviteResident(String(id), { name: res.name.trim() || undefined, email: res.email.trim() || undefined, unitName: res.unitName.trim(), unitAddress: res.unitAddress.trim() || undefined }),
    onSuccess: (r) => { setCode(r.code ?? null); inv("portalResidents"); notify.success(t("portal.inviteCreated", "Invitation created")) },
    onError: (e) => notify.error(e instanceof Error ? e.message : t("common.error", "Something went wrong")),
  })

  const requestCount = requestsQ.data?.length ?? 0
  const clientCount = residentsQ.data?.length ?? 0
  const openCount = requestsQ.data?.filter((r) => !["COMPLETED", "CLOSED", "CANCELED"].includes(r.status)).length ?? 0

  return (
    <div className="min-h-full bg-background">
      <div className="max-w-screen-lg mx-auto px-6 py-8">
        <Button variant="ghost" size="sm" className="mb-4 -ml-2 gap-1.5 text-muted-foreground" onClick={() => router.push("/customer-portal")}>
          <ArrowLeft className="h-4 w-4" />{t("portal.pageTitle", "Clients Portals")}
        </Button>

        {/* Header */}
        <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-start gap-3 min-w-0">
            <div className={`h-12 w-12 rounded-xl flex items-center justify-center shrink-0 text-sm font-semibold ${portalTile(meta.accent)}`}>{initials(portal?.name)}</div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-3xl font-bold text-foreground tracking-tight truncate">{portal?.name || "…"}</h1>
                {portal && <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-medium ${portalTile(meta.accent)}`}>{t(`portal.type.${meta.key}`, meta.badge)}</span>}
              </div>
              <p className="mt-1 text-sm text-muted-foreground capitalize">{t("portal.entityIs", "Entity: {{e}}", { e: portal?.entityLabel })}</p>
              <p className="mt-1 text-sm text-muted-foreground">
                <span className="font-medium text-foreground tabular-nums">{openCount}</span> {t("portal.statOpen", "open")}
                <span className="mx-1.5 text-border">·</span>
                <span className="font-medium text-foreground tabular-nums">{requestCount}</span> {t("portal.statTotal", "total")}
                <span className="mx-1.5 text-border">·</span>
                <span className="font-medium text-foreground tabular-nums">{clientCount}</span> {t("portal.tabClients", "Clients").toLowerCase()}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" className="h-11 rounded-xl gap-1.5" onClick={() => setTypePickerOpen(true)}>
              <Repeat className="h-4 w-4" />{t("portal.changeType", "Change type")}
            </Button>
            <Button onClick={() => setInviteOpen(true)} className="h-11 rounded-xl shadow-sm gap-1.5"><Ticket className="h-4 w-4" />{t("portal.inviteResident", "Invite client")}</Button>
          </div>
        </div>

        <Tabs defaultValue="requests" className="w-full">
          <TabsList className="h-11 p-1">
            <TabTrigger value="requests" label={t("portal.tabRequests", "Requests")} count={requestCount} />
            <TabTrigger value="clients" label={t("portal.tabClients", "Clients")} count={clientCount} />
            <TabTrigger value="categories" label={t("portal.tabCategories", "Categories")} count={categories.length} />
          </TabsList>

          {/* ── Requests ── */}
          <TabsContent value="requests" className="mt-4">
            <Panel>
              {requestsQ.isLoading ? <Loading /> : requestCount === 0 ? (
                <EmptyState icon={<Inbox className="h-6 w-6" />} title={t("portal.noRequestsTitle", "No requests yet")} hint={t("portal.noRequests", "They appear here as clients submit from the app.")} />
              ) : (
                <div className="divide-y divide-border/60">
                  {requestsQ.data!.map((r: PortalRequestView) => (
                    <button key={r.id} className="w-full flex items-center gap-4 px-5 py-3.5 hover:bg-accent/30 transition-colors text-left" onClick={() => router.push(`/tasks/${r.id}`)}>
                      <span className={`h-2 w-2 rounded-full shrink-0 ${PRIORITY_DOT[r.priority] ?? "bg-slate-400"}`} title={r.priority} />
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-foreground truncate">{r.title}</p>
                        <p className="text-xs text-muted-foreground truncate mt-0.5">
                          <span className="font-mono">{r.reference}</span>{r.customerName ? ` · ${r.customerName}` : ""}{r.unitName ? ` · ${r.unitName}` : ""}
                        </p>
                      </div>
                      <span className={`text-[11px] font-semibold capitalize rounded-full px-2.5 py-1 shrink-0 ${STATUS_STYLES[r.status] ?? "bg-slate-500/10 text-slate-600 dark:text-slate-400"}`}>{r.status.replace(/_/g, " ").toLowerCase()}</span>
                    </button>
                  ))}
                </div>
              )}
            </Panel>
          </TabsContent>

          {/* ── Clients ── */}
          <TabsContent value="clients" className="mt-4">
            <div className="flex justify-end mb-3">
              <Button variant="outline" size="sm" className="gap-1.5" onClick={() => setInviteOpen(true)}><Plus className="h-3.5 w-3.5" />{t("portal.inviteResident", "Invite client")}</Button>
            </div>
            <Panel>
              {residentsQ.isLoading ? <Loading /> : clientCount === 0 ? (
                <EmptyState icon={<Users className="h-6 w-6" />} title={t("portal.noResidentsTitle", "No clients yet")} hint={t("portal.noResidents", "Invite one — they get a code to sign in on the app.")}
                  cta={<Button size="sm" className="gap-1.5" onClick={() => setInviteOpen(true)}><Ticket className="h-4 w-4" />{t("portal.inviteResident", "Invite client")}</Button>} />
              ) : (
                <div className="divide-y divide-border/60">
                  {residentsQ.data!.map((r: Customer) => (
                    <button key={r.id} className="w-full flex items-center gap-4 px-5 py-3.5 hover:bg-accent/30 transition-colors text-left" onClick={() => router.push(`/customers/${r.id}`)}>
                      <div className="h-9 w-9 rounded-lg bg-primary/10 text-primary flex items-center justify-center shrink-0 text-sm font-semibold">{initials(r.name)}</div>
                      <div className="min-w-0 flex-1"><p className="text-sm font-medium text-foreground truncate">{r.name}</p>{r.email && <p className="text-xs text-muted-foreground truncate">{r.email}</p>}</div>
                      <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
                    </button>
                  ))}
                </div>
              )}
            </Panel>
          </TabsContent>

          {/* ── Categories ── */}
          <TabsContent value="categories" className="mt-4">
            <div className="flex justify-end mb-3">
              <Button variant="outline" size="sm" className="gap-1.5" onClick={openNewCat}><Plus className="h-3.5 w-3.5" />{t("portal.addCategory", "Add category")}</Button>
            </div>
            <Panel>
              {categories.length === 0 ? <EmptyState icon={<ListChecks className="h-6 w-6" />} title={t("portal.noCategoriesTitle", "No categories yet")} hint={t("portal.noCategories", "Add a category so clients can classify what they report.")}
                cta={<Button size="sm" className="gap-1.5" onClick={openNewCat}><Plus className="h-4 w-4" />{t("portal.addCategory", "Add category")}</Button>} /> : (
                <div className="divide-y divide-border/60">
                  {categories.map((c) => (
                    <div key={c.id} className="group flex items-center gap-4 px-5 py-3.5">
                      <div className={`h-10 w-10 rounded-lg flex items-center justify-center shrink-0 text-xs font-semibold ${portalTile(c.color)}`}>{initials(c.label)}</div>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-foreground truncate flex items-center gap-1.5">{c.label}
                          {c.urgent && <span className="text-[10px] font-semibold rounded-full bg-red-500/10 text-red-600 dark:text-red-400 px-1.5 py-0.5">URGENT</span>}
                        </p>
                        <p className="text-xs text-muted-foreground truncate mt-0.5">{(c.issues || []).join(" · ") || t("portal.noIssues", "no sub-issues")}{c.team ? ` — ${c.team}` : ""}</p>
                      </div>
                      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={() => openEditCat(c)}><Pencil className="h-3.5 w-3.5" /></Button>
                        <Button variant="ghost" size="sm" className="h-8 w-8 p-0 text-red-600 hover:text-red-700" onClick={() => setCatRemove(c)}><Trash2 className="h-3.5 w-3.5" /></Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </Panel>
          </TabsContent>
        </Tabs>

        {/* Danger zone */}
        {portal && (
          <Card className="mt-10 border-destructive/40">
            <CardHeader className="pb-3">
              <div className="flex items-start gap-3">
                <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-destructive/10 text-destructive">
                  <AlertTriangle className="h-[18px] w-[18px]" />
                </span>
                <div>
                  <CardTitle className="text-base text-destructive">{t("portal.dangerTitle", "Danger zone")}</CardTitle>
                  <CardDescription>{t("portal.dangerHint", "Irreversible actions for this portal.")}</CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="flex flex-col gap-3 rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="pr-4">
                  <p className="text-sm font-medium text-foreground">{t("portal.deletePortalTitle", "Delete this portal")}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">{t("portal.deletePortalWarn", "Deleting removes the portal and its categories. Clients keep their accounts but lose portal access.")}</p>
                </div>
                <Button variant="destructive" className="shrink-0" onClick={() => { setDelConfirmText(""); setDelPortalOpen(true) }}>
                  <Trash2 className="mr-2 h-4 w-4" />{t("portal.deletePortalButton", "Delete portal")}
                </Button>
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Switch type */}
      {/* Change type picker — shows the current type; picking another flows into
          the reseed confirm below. */}
      <Dialog open={typePickerOpen} onOpenChange={setTypePickerOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>{t("portal.changeType", "Change type")}</DialogTitle></DialogHeader>
          <div className="space-y-2 py-1">
            {TEMPLATES.map((x) => {
              const isCurrent = x.key === meta.key
              return (
                <button
                  key={x.key}
                  disabled={isCurrent}
                  onClick={() => { setTypePickerOpen(false); setSwitchOpen(x.key) }}
                  className={`w-full flex items-center justify-between gap-3 rounded-xl border p-3 text-left transition-colors ${isCurrent ? "border-primary/40 bg-primary/5 cursor-default" : "border-border hover:bg-accent/40"}`}
                >
                  <span className="flex items-center gap-2.5 min-w-0">
                    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-medium ${portalTile(x.accent)}`}>{x.badge}</span>
                    <span className="text-sm text-foreground truncate">{x.label}</span>
                  </span>
                  {isCurrent
                    ? <span className="inline-flex items-center gap-1 text-[11px] font-medium text-primary shrink-0"><Check className="h-3.5 w-3.5" />{t("portal.currentType", "Current")}</span>
                    : <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />}
                </button>
              )
            })}
          </div>
          <p className="text-[11px] text-muted-foreground">{t("portal.changeTypeHint", "Switching replaces the issue categories with the new type's defaults. Clients and their requests are kept.")}</p>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!switchOpen} onOpenChange={(o) => !o && setSwitchOpen(null)}>
        <AlertDialogContent>
          <AlertDialogHeader><AlertDialogTitle className="flex items-center gap-2"><AlertTriangle className="h-4 w-4 text-amber-500" />{t("portal.switchTitle", "Switch portal type?")}</AlertDialogTitle>
            <AlertDialogDescription>{t("portal.switchWarn", "This replaces the issue categories with the new type’s defaults. Clients and their requests are kept.")}</AlertDialogDescription></AlertDialogHeader>
          <AlertDialogFooter><AlertDialogCancel>{t("common.cancel", "Cancel")}</AlertDialogCancel>
            <AlertDialogAction onClick={() => switchOpen && switchM.mutate(switchOpen)} disabled={switchM.isPending}>{t("portal.switchConfirm", "Switch & reset categories")}</AlertDialogAction></AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete portal — type-the-name to confirm */}
      <Dialog open={delPortalOpen} onOpenChange={(o) => !delPortalM.isPending && setDelPortalOpen(o)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("portal.deleteDialogTitle", "Delete “{{name}}”?", { name: portal?.name })}</DialogTitle>
            <DialogDescription>{t("portal.deletePortalWarn", "Deleting removes the portal and its categories. Clients keep their accounts but lose portal access.")}</DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-1">
            <p className="text-sm text-muted-foreground">
              {clientCount > 0 || requestCount > 0
                ? t("portal.deletePortalStats", "This portal has {{clients}} client(s) and {{requests}} request(s). Their history is kept but they lose access here.", { clients: clientCount, requests: requestCount })
                : t("portal.deletePortalEmpty", "This portal has no clients or requests yet.")}
            </p>
            <div className="space-y-1.5">
              <Label htmlFor="portal-del-confirm">{t("portal.deleteConfirmLabel", "Type {{name}} to confirm", { name: portal?.name })}</Label>
              <Input id="portal-del-confirm" value={delConfirmText} onChange={(e) => setDelConfirmText(e.target.value)} placeholder={portal?.name} autoComplete="off" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDelPortalOpen(false)} disabled={delPortalM.isPending}>{t("common.cancel", "Cancel")}</Button>
            <Button variant="destructive" onClick={() => delPortalM.mutate()} disabled={!canDeletePortal || delPortalM.isPending}>
              {delPortalM.isPending ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />{t("common.deleting", "Deleting…")}</> : t("portal.deletePortalButton", "Delete portal")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Category add/edit */}
      <Dialog open={!!catEdit} onOpenChange={(o) => !o && setCatEdit(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>{catEdit === "new" ? t("portal.addCategory", "Add category") : t("portal.editCategory", "Edit category")}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label>{t("portal.catLabel", "Label")}</Label><Input value={catForm.label} onChange={(e) => setCatForm({ ...catForm, label: e.target.value })} placeholder="Air Conditioning" /></div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>{t("portal.catColor", "Colour")}</Label>
                <select value={catForm.color} onChange={(e) => setCatForm({ ...catForm, color: e.target.value })} className="mt-1 w-full h-10 rounded-md border border-border bg-background px-3 text-sm">
                  {COLORS.map((c) => <option key={c} value={c}>{c}</option>)}
                </select></div>
              <div><Label>{t("portal.catTeam", "Route to team")}</Label><Input value={catForm.team ?? ""} onChange={(e) => setCatForm({ ...catForm, team: e.target.value })} placeholder="HVAC team" /></div>
            </div>
            <div><Label>{t("portal.catIssues", "Sub-issues (comma separated)")}</Label>
              <Input value={(catForm.issues ?? []).join(", ")} onChange={(e) => setCatForm({ ...catForm, issues: e.target.value.split(",").map((s) => s.trim()).filter(Boolean) })} placeholder="Not cooling, No power" /></div>
            <label className="flex items-center gap-2 text-sm text-foreground">
              <input type="checkbox" checked={!!catForm.urgent} onChange={(e) => setCatForm({ ...catForm, urgent: e.target.checked })} className="h-4 w-4 rounded border-slate-300 text-primary" />
              {t("portal.catUrgent", "Auto-mark requests in this category as URGENT")}
            </label>
          </div>
          <DialogFooter><Button variant="ghost" onClick={() => setCatEdit(null)}>{t("common.cancel", "Cancel")}</Button>
            <Button disabled={!catForm.label.trim() || saveCatM.isPending} onClick={() => saveCatM.mutate()}>{t("common.save", "Save")}</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Category delete */}
      <AlertDialog open={!!catRemove} onOpenChange={(o) => !o && setCatRemove(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("portal.deleteCategoryTitle", "Delete “{{label}}”?", { label: catRemove?.label })}</AlertDialogTitle>
            <AlertDialogDescription>{t("portal.deleteCategoryWarn", "Clients can no longer pick this category for new requests. Existing requests keep their category.")}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter><AlertDialogCancel>{t("common.cancel", "Cancel")}</AlertDialogCancel>
            <AlertDialogAction className="bg-red-600 hover:bg-red-700" onClick={() => catRemove && delCatM.mutate(catRemove.id)} disabled={delCatM.isPending}>{t("common.delete", "Delete")}</AlertDialogAction></AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Invite client */}
      <Dialog open={inviteOpen} onOpenChange={(o) => { if (!o) resetInvite() }}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>{t("portal.inviteResident", "Invite client")}</DialogTitle></DialogHeader>
          {code ? (
            <div className="text-center py-4">
              <p className="text-sm text-muted-foreground mb-3">{t("portal.shareCode", "Share this code with the client to activate their login:")}</p>
              <div className="flex items-center justify-center gap-2">
                <span className="text-2xl font-mono font-bold tracking-widest text-foreground rounded-xl bg-muted px-4 py-2">{code}</span>
                <Button variant="outline" size="sm" className="h-11 w-11 p-0" onClick={() => { navigator.clipboard.writeText(code); setCopied(true); setTimeout(() => setCopied(false), 1500) }}>{copied ? <Check className="h-4 w-4 text-green-600" /> : <Copy className="h-4 w-4" />}</Button>
              </div>
              <p className="text-xs text-muted-foreground mt-3">{t("portal.codeHint", "In the app: register → Use Invitation → enter this code.")}</p>
            </div>
          ) : (
            <div className="space-y-3">
              <p className="text-xs text-muted-foreground">{t("portal.inviteHint", "Just set the {{entity}} and share the code — the client fills in their own name when they register.", { entity: (portal?.entityLabel || "unit").toLowerCase() })}</p>
              <div><Label>{t("portal.resUnit", "{{entity}} / reference", { entity: portal?.entityLabel || "Unit" })}</Label><Input value={res.unitName} onChange={(e) => setRes({ ...res, unitName: e.target.value })} placeholder="Apartment 12A" /></div>
              <div><Label>{t("portal.resAddress", "Address (optional)")}</Label><Input value={res.unitAddress} onChange={(e) => setRes({ ...res, unitAddress: e.target.value })} placeholder="Landstraße 24, 4020 Linz" /></div>
              <div><Label>{t("portal.resNameOpt", "Client name (optional)")}</Label><Input value={res.name} onChange={(e) => setRes({ ...res, name: e.target.value })} placeholder={t("portal.resNamePlaceholder", "Leave blank — they set it on sign-up")} /></div>
              <div><Label>{t("portal.resEmail", "Email (optional)")}</Label><Input value={res.email} onChange={(e) => setRes({ ...res, email: e.target.value })} placeholder="maria.gruber@gmail.com" /></div>
            </div>
          )}
          <DialogFooter>
            {code ? <Button onClick={resetInvite}>{t("common.done", "Done")}</Button> : (
              <>
                <Button variant="ghost" onClick={() => setInviteOpen(false)}>{t("common.cancel", "Cancel")}</Button>
                <Button disabled={!res.unitName.trim() || inviteM.isPending} onClick={() => inviteM.mutate()}>{t("portal.createInvite", "Create invite")}</Button>
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function TabTrigger({ value, label, count }: { value: string; label: string; count: number }) {
  return (
    <TabsTrigger value={value} className="rounded-md data-[state=active]:shadow-sm">
      {label}
      {count > 0 && <span className="ml-1.5 rounded-full bg-foreground/10 px-1.5 text-[11px] font-semibold tabular-nums">{count}</span>}
    </TabsTrigger>
  )
}

function Panel({ children }: { children: React.ReactNode }) {
  return <div className="rounded-2xl border border-border bg-card overflow-hidden">{children}</div>
}

function EmptyState({ icon, title, hint, cta }: { icon: React.ReactNode; title: string; hint: string; cta?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-6 text-center">
      <span className="flex size-14 items-center justify-center rounded-2xl bg-muted text-muted-foreground mb-4">{icon}</span>
      <p className="font-medium text-foreground">{title}</p>
      <p className="text-sm text-muted-foreground mt-1 max-w-sm">{hint}</p>
      {cta && <div className="mt-4">{cta}</div>}
    </div>
  )
}

function Loading() { return <div className="p-10 text-center text-sm text-muted-foreground">Loading…</div> }

function initials(name?: string) {
  return (name || "?").trim().split(/\s+/).slice(0, 2).map((s) => s[0]?.toUpperCase() ?? "").join("") || "?"
}
