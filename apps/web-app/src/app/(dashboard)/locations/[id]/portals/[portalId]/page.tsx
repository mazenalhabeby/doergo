"use client"

import { useState, useRef } from "react"
import { useParams, useRouter } from "next/navigation"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { useTranslation } from "react-i18next"
import { ArrowLeft, Plus, Trash2, Ticket, Copy, Check, Pencil, AlertTriangle, Inbox, Users, ListChecks, ChevronRight, Loader2, Repeat, Upload, ImageIcon, Building2 } from "lucide-react"

import { portalAdminApi, locationsApi, workflowsApi, spaceMembersApi, type PortalIntakeCategory, type Customer, type PortalCategoryInput, type PortalRequestView } from "@/lib/api"
import { portalTile } from "@/lib/portal-ui"
import { useSpaceModules } from "@/hooks/use-space-modules"
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
import { ApartmentDialog } from "../../_components/apartment-dialog"
import { CustomerForm } from "../../_components/customers-tab"

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
  const params = useParams<{ id: string; portalId: string }>()
  const spaceId = params.id
  const portalId = params.portalId
  const qc = useQueryClient()
  const router = useRouter()
  const { t } = useTranslation()
  // Back button + post-delete return land on THIS space's portal tab (not a
  // navbar route — the standalone Clients Portals page was removed).
  const backToSpace = () => router.push(`/locations/${spaceId}?tab=portal`)
  // The Apartment entity used to need the Apartments module; that module is
  // retired and its records live in Assets now. A portal's own units are part
  // of the portal, so this gates on the portal itself.
  const { hasModule } = useSpaceModules(spaceId)
  const spaceHasApartments = hasModule("b2c_portal")

  const portalQ = useQuery({ queryKey: ["portal", portalId], queryFn: () => portalAdminApi.getPortal(portalId) })
  const residentsQ = useQuery({ queryKey: ["portalResidents", portalId], queryFn: () => portalAdminApi.residents(portalId) })
  const requestsQ = useQuery({ queryKey: ["portalAllRequests", portalId], queryFn: () => portalAdminApi.portalRequests(portalId) })
  // Triage lookups (spaces to route to, flows/task-types, workers). Small + cached.
  const spacesQ = useQuery({ queryKey: ["triageSpaces"], queryFn: () => locationsApi.list({ limit: 100 }), staleTime: 60000 })
  const flowsQ = useQuery({ queryKey: ["triageFlows"], queryFn: () => workflowsApi.list(), staleTime: 60000 })
  const spaces = spacesQ.data?.data ?? []
  const flows = flowsQ.data ?? []
  // This portal belongs to the space in the URL (the list that led here is
  // filtered by it), so requests route here — no cross-space re-pointing.
  const ownerSpaceName = spaces.find((s) => s.id === spaceId)?.name
  const portal = portalQ.data
  const categories = portal?.categories ?? []
  const meta = TPL_BY_KEY[portal?.templateKey ?? ""] ?? TPL_BY_KEY.rental
  const inv = (k: string) => qc.invalidateQueries({ queryKey: [k, portalId] })

  // Switch type / delete portal
  const [typePickerOpen, setTypePickerOpen] = useState(false)
  const [switchOpen, setSwitchOpen] = useState<string | null>(null)
  const switchM = useMutation({
    mutationFn: (templateKey: string) => portalAdminApi.updatePortal(portalId, { templateKey, reseed: true }),
    onSuccess: () => { inv("portal"); setSwitchOpen(null); notify.success(t("portal.switched", "Type switched")) },
    onError: (e) => notify.error(e instanceof Error ? e.message : t("common.error", "Something went wrong")),
  })
  const delPortalM = useMutation({
    mutationFn: () => portalAdminApi.deletePortal(portalId),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["space-portals", spaceId] }); notify.success(t("portal.deleted", "Portal deleted")); backToSpace() },
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
      ? portalAdminApi.createCategory({ ...catForm, portalId, key: catForm.label.toLowerCase().replace(/[^a-z0-9]+/g, "_") })
      : portalAdminApi.updateCategory((catEdit as PortalIntakeCategory).id, catForm),
    onSuccess: () => { inv("portal"); setCatEdit(null) },
    onError: (e) => notify.error(e instanceof Error ? e.message : t("common.error", "Something went wrong")),
  })
  const delCatM = useMutation({
    mutationFn: (cid: string) => portalAdminApi.deleteCategory(cid),
    onSuccess: () => { inv("portal"); setCatRemove(null) },
    onError: (e) => notify.error(e instanceof Error ? e.message : t("common.error", "Something went wrong")),
  })

  // Triage a pending request → live task (space + flow + priority + worker)
  const [triageReq, setTriageReq] = useState<PortalRequestView | null>(null)
  const [triageForm, setTriageForm] = useState<{ spaceId: string; workflowId: string; priority: string; assignedToId: string }>({ spaceId: "", workflowId: "", priority: "", assignedToId: "" })
  const openTriage = (r: PortalRequestView) => {
    // Pre-route to the portal's linked space (if any) so the admin only confirms
    // the flow + assigns — no re-picking the space for every request.
    setTriageForm({ spaceId: r.suggestedSpaceId ?? r.spaceId ?? "", workflowId: "", priority: r.priority || "MEDIUM", assignedToId: r.assignedToId ?? "" })
    setTriageReq(r)
  }
  // Assignable workers = ONLY the roster of the space being routed to.
  const spaceMembersQ = useQuery({
    queryKey: ["triageSpaceMembers", triageForm.spaceId],
    queryFn: () => spaceMembersApi.list(triageForm.spaceId),
    enabled: !!triageReq && !!triageForm.spaceId,
    staleTime: 30000,
  })
  const spaceWorkers = spaceMembersQ.data ?? []
  // Changing the space invalidates a previously-picked worker (may not be on the
  // new roster) — clear it so we never submit a cross-space assignee.
  const setTriageSpace = (sid: string) => setTriageForm((f) => ({ ...f, spaceId: sid, assignedToId: "" }))
  const triageM = useMutation({
    mutationFn: () => portalAdminApi.triageRequest(triageReq!.id, {
      spaceId: triageForm.spaceId,
      // "" workflow = use the chosen space's default flow (send undefined so the
      // backend inherits it); a real id overrides it (dynamic flow).
      workflowId: triageForm.workflowId || undefined,
      priority: triageForm.priority || undefined,
      assignedToId: triageForm.assignedToId || undefined,
    }),
    onSuccess: () => { inv("portalAllRequests"); setTriageReq(null); notify.success(t("portal.requestRouted", "Request routed")) },
    onError: (e) => notify.error(e instanceof Error ? e.message : t("common.error", "Something went wrong")),
  })

  // Cover image (client-home background)
  const coverInputRef = useRef<HTMLInputElement>(null)
  const uploadCoverM = useMutation({
    mutationFn: (file: File) => portalAdminApi.uploadCover(portalId, file),
    onSuccess: () => { inv("portal"); notify.success(t("portal.coverUpdated", "Cover image updated")) },
    onError: (e) => notify.error(e instanceof Error ? e.message : t("common.error", "Something went wrong")),
  })
  const removeCoverM = useMutation({
    mutationFn: () => portalAdminApi.removeCover(portalId),
    onSuccess: () => { inv("portal"); notify.success(t("portal.coverRemoved", "Cover image removed")) },
    onError: (e) => notify.error(e instanceof Error ? e.message : t("common.error", "Something went wrong")),
  })

  // Remove a client from the portal (revoke access + detach)
  const [clientToRemove, setClientToRemove] = useState<Customer | null>(null)
  const removeClientM = useMutation({
    mutationFn: (cid: string) => portalAdminApi.removeResident(cid),
    onSuccess: () => { inv("portalResidents"); setClientToRemove(null); notify.success(t("portal.clientRemoved", "Client removed")) },
    onError: (e) => notify.error(e instanceof Error ? e.message : t("common.error", "Something went wrong")),
  })

  // Invite client — pick an existing customer + apartment, or create either using
  // the SAME models (CustomerForm / ApartmentDialog) so nothing is re-implemented.
  const [inviteOpen, setInviteOpen] = useState(false)
  const [unitChoice, setUnitChoice] = useState("")
  const [customerChoice, setCustomerChoice] = useState("")
  const [code, setCode] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const availUnitsQ = useQuery({ queryKey: ["portal-available-units", portalId], queryFn: () => portalAdminApi.availableUnits(portalId), enabled: inviteOpen })
  const availUnits = availUnitsQ.data ?? []
  const availCustomersQ = useQuery({ queryKey: ["portal-available-customers", portalId], queryFn: () => portalAdminApi.availableCustomers(portalId), enabled: inviteOpen })
  const availCustomers = availCustomersQ.data ?? []
  const resetInvite = () => { setInviteOpen(false); setCode(null); setUnitChoice(""); setCustomerChoice("") }
  const inviteM = useMutation({
    mutationFn: () => portalAdminApi.inviteResident(portalId, { customerId: customerChoice, unitId: unitChoice }),
    onSuccess: (r) => {
      setCode(r.code ?? null); inv("portalResidents")
      qc.invalidateQueries({ queryKey: ["portal-available-units", portalId] })
      qc.invalidateQueries({ queryKey: ["portal-available-customers", portalId] })
      notify.success(t("portal.inviteCreated", "Invitation created"))
    },
    onError: (e) => notify.error(e instanceof Error ? e.message : t("common.error", "Something went wrong")),
  })

  const requestCount = requestsQ.data?.length ?? 0
  const clientCount = residentsQ.data?.length ?? 0
  const openCount = requestsQ.data?.filter((r) => !["COMPLETED", "CLOSED", "CANCELED"].includes(r.status)).length ?? 0

  return (
    <div className="min-h-full bg-background">
      <div className="max-w-screen-lg mx-auto px-6 py-8">
        <Button variant="ghost" size="sm" className="mb-4 -ml-2 gap-1.5 text-muted-foreground" onClick={backToSpace}>
          <ArrowLeft className="h-4 w-4" />{t("portal.title", "Client portals")}
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

        {/* Cover image — previewed exactly as the app shows it (full-screen
            portrait background on the client's home), so it looks right on web too. */}
        <div className="mb-6 flex flex-col items-center gap-5 rounded-2xl border border-border bg-card p-5 sm:flex-row sm:items-stretch">
          {/* Phone-frame preview */}
          <div className="relative aspect-[9/16] w-[168px] shrink-0 overflow-hidden rounded-[24px] border-[5px] border-foreground/15 bg-muted shadow-lg">
            {portal?.coverImageUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={portal.coverImageUrl} alt="" className="absolute inset-0 h-full w-full object-cover" />
            ) : (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-1.5 text-muted-foreground">
                <ImageIcon className="h-6 w-6" />
                <span className="text-xs">{t("portal.noCover", "No cover image")}</span>
              </div>
            )}
            {/* Legibility gradient + the app-home title overlay (what the client sees). */}
            <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/70 via-black/10 to-black/25" />
            <div className="absolute left-1/2 top-2 h-1 w-10 -translate-x-1/2 rounded-full bg-white/50" />
            <div className="absolute inset-x-0 bottom-0 p-3 text-white">
              {portal?.entityLabel && <p className="text-[10px] font-medium uppercase tracking-wide text-white/70">{portal.entityLabel}</p>}
              <p className="text-sm font-semibold leading-tight drop-shadow">{portal?.name}</p>
            </div>
          </div>

          {/* Controls + guidance */}
          <div className="flex min-w-0 flex-1 flex-col justify-center gap-2 text-center sm:text-left">
            <p className="text-sm font-semibold text-foreground">{t("portal.coverTitle", "Client home cover")}</p>
            <p className="text-xs leading-relaxed text-muted-foreground">
              {t("portal.coverHint2", "Fills the background of the client's home screen in the app. Use a tall (portrait) image — this preview shows exactly how they'll see it.")}
            </p>
            <input
              ref={coverInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="hidden"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadCoverM.mutate(f); e.currentTarget.value = "" }}
            />
            <div className="mt-1 flex flex-wrap justify-center gap-2 sm:justify-start">
              <Button size="sm" className="gap-1.5" disabled={uploadCoverM.isPending} onClick={() => coverInputRef.current?.click()}>
                {uploadCoverM.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
                {portal?.coverImageUrl ? t("portal.changeCover", "Change") : t("portal.uploadCover", "Upload cover")}
              </Button>
              {portal?.coverImageUrl && (
                <Button size="sm" variant="outline" className="gap-1.5" disabled={removeCoverM.isPending} onClick={() => removeCoverM.mutate()}>
                  {removeCoverM.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                  {t("common.remove", "Remove")}
                </Button>
              )}
            </div>
          </div>
        </div>

        {/* This portal belongs to its space — requests route here automatically
            (inheriting the space's flow). No cross-space re-pointing. */}
        <div className="mb-6 flex items-center gap-2.5 rounded-2xl border border-border bg-muted/30 px-4 py-3">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Building2 className="h-4 w-4" />
          </span>
          <p className="min-w-0 text-sm text-muted-foreground">
            {t("portal.routesToThisSpace", "Requests route to")}{" "}
            <span className="font-medium text-foreground">{ownerSpaceName || t("portal.thisSpace", "this space")}</span>
            {" "}{t("portal.andItsFlow", "and inherit its workflow.")}
          </p>
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
                  {requestsQ.data!.map((r: PortalRequestView) => {
                    const pending = r.triaged === false
                    return (
                    <button key={r.id} className="w-full flex items-center gap-4 px-5 py-3.5 hover:bg-accent/30 transition-colors text-left" onClick={() => pending ? openTriage(r) : router.push(`/tasks/${r.id}`)}>
                      <span className={`h-2 w-2 rounded-full shrink-0 ${PRIORITY_DOT[r.priority] ?? "bg-slate-400"}`} title={r.priority} />
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-foreground truncate">{r.title}</p>
                        <p className="text-xs text-muted-foreground truncate mt-0.5">
                          <span className="font-mono">{r.reference}</span>{r.customerName ? ` · ${r.customerName}` : ""}{r.unitName ? ` · ${r.unitName}` : ""}{!pending && r.spaceName ? ` · ${r.spaceName}` : ""}
                        </p>
                      </div>
                      {pending ? (
                        <span className="inline-flex items-center gap-1 text-[11px] font-semibold rounded-full px-2.5 py-1 shrink-0 bg-amber-500/15 text-amber-600 dark:text-amber-400">
                          <Inbox className="h-3 w-3" />{t("portal.pendingTriage", "Route it")}
                        </span>
                      ) : (
                        <span className={`text-[11px] font-semibold capitalize rounded-full px-2.5 py-1 shrink-0 ${STATUS_STYLES[r.status] ?? "bg-slate-500/10 text-slate-600 dark:text-slate-400"}`}>{r.status.replace(/_/g, " ").toLowerCase()}</span>
                      )}
                    </button>
                    )
                  })}
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
                    <div key={r.id} className="group flex items-center gap-2 px-5 py-3.5 hover:bg-accent/30 transition-colors">
                      <button className="flex min-w-0 flex-1 items-center gap-4 text-left" onClick={() => router.push(`/customers/${r.id}`)}>
                        <div className="h-9 w-9 rounded-lg bg-primary/10 text-primary flex items-center justify-center shrink-0 text-sm font-semibold">{initials(r.name)}</div>
                        <div className="min-w-0 flex-1"><p className="text-sm font-medium text-foreground truncate">{r.name}</p>{r.email && <p className="text-xs text-muted-foreground truncate">{r.email}</p>}</div>
                      </button>
                      <button
                        onClick={() => setClientToRemove(r)}
                        aria-label={t("portal.removeClient", "Remove client")}
                        className="shrink-0 rounded-lg p-2 text-muted-foreground opacity-0 transition-all hover:bg-red-500/10 hover:text-red-600 focus:opacity-100 group-hover:opacity-100"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                      <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground/40" />
                    </div>
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
        <DialogContent>
          <DialogHeader><DialogTitle>{t("portal.changeType", "Change type")}</DialogTitle></DialogHeader>
          <div className="space-y-2 py-1">
            {TEMPLATES.map((x) => {
              const isCurrent = x.key === meta.key
              const locked = x.key === "rental" && !spaceHasApartments && !isCurrent
              return (
                <button
                  key={x.key}
                  disabled={isCurrent || locked}
                  onClick={() => { setTypePickerOpen(false); setSwitchOpen(x.key) }}
                  className={`w-full flex items-center justify-between gap-3 rounded-xl border p-3 text-left transition-colors ${isCurrent ? "border-primary/40 bg-primary/5 cursor-default" : locked ? "cursor-not-allowed border-border opacity-60" : "border-border hover:bg-accent/40"}`}
                >
                  <span className="flex items-center gap-2.5 min-w-0">
                    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-medium ${portalTile(x.accent)}`}>{x.badge}</span>
                    <span className="min-w-0">
                      <span className="block text-sm text-foreground truncate">{x.label}</span>
                      {locked && <span className="block text-[11px] text-muted-foreground">{t("portal.apartmentModuleRequired", "Enable the Apartments module for this space to use this type.")}</span>}
                    </span>
                  </span>
                  {isCurrent
                    ? <span className="inline-flex items-center gap-1 text-[11px] font-medium text-primary shrink-0"><Check className="h-3.5 w-3.5" />{t("portal.currentType", "Current")}</span>
                    : !locked && <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />}
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
        <DialogContent>
          <DialogHeader><DialogTitle>{catEdit === "new" ? t("portal.addCategory", "Add category") : t("portal.editCategory", "Edit category")}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label>{t("portal.catLabel", "Label")}</Label><Input value={catForm.label} onChange={(e) => setCatForm({ ...catForm, label: e.target.value })} placeholder={t("portal.catLabelPlaceholder", "Air Conditioning")} /></div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>{t("portal.catColor", "Colour")}</Label>
                <select value={catForm.color} onChange={(e) => setCatForm({ ...catForm, color: e.target.value })} className="mt-1 w-full h-10 rounded-md border border-border bg-background px-3 text-sm">
                  {COLORS.map((c) => <option key={c} value={c}>{c}</option>)}
                </select></div>
              <div><Label>{t("portal.catTeam", "Route to team")}</Label><Input value={catForm.team ?? ""} onChange={(e) => setCatForm({ ...catForm, team: e.target.value })} placeholder={t("portal.catTeamPlaceholder", "HVAC team")} /></div>
            </div>
            <div><Label>{t("portal.catIssues", "Sub-issues (comma separated)")}</Label>
              <Input value={(catForm.issues ?? []).join(", ")} onChange={(e) => setCatForm({ ...catForm, issues: e.target.value.split(",").map((s) => s.trim()).filter(Boolean) })} placeholder={t("portal.catIssuesPlaceholder", "Not cooling, No power")} /></div>
            <label className="flex items-center gap-2 text-sm text-foreground">
              <input type="checkbox" checked={!!catForm.urgent} onChange={(e) => setCatForm({ ...catForm, urgent: e.target.checked })} className="h-4 w-4 rounded border-slate-300 text-primary" />
              {t("portal.catUrgent", "Auto-mark requests in this category as URGENT")}
            </label>
          </div>
          <DialogFooter><Button variant="ghost" onClick={() => setCatEdit(null)}>{t("common.cancel", "Cancel")}</Button>
            <Button disabled={!catForm.label.trim() || saveCatM.isPending} onClick={() => saveCatM.mutate()}>{t("common.save", "Save")}</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Triage a pending request → live task */}
      <Dialog open={!!triageReq} onOpenChange={(o) => !o && setTriageReq(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("portal.triageTitle", "Route request")}</DialogTitle>
            <DialogDescription>{t("portal.triageHint", "Send this request into a space and choose how it should flow, then assign a worker.")}</DialogDescription>
          </DialogHeader>
          {triageReq && (
            <div className="space-y-3">
              <div className="rounded-lg border border-border bg-muted/30 px-3 py-2">
                <p className="text-sm font-medium text-foreground truncate">{triageReq.title}</p>
                <p className="text-xs text-muted-foreground truncate mt-0.5"><span className="font-mono">{triageReq.reference}</span>{triageReq.customerName ? ` · ${triageReq.customerName}` : ""}{triageReq.unitName ? ` · ${triageReq.unitName}` : ""}</p>
                {triageReq.unitAddress && <p className="text-xs text-muted-foreground mt-1">📍 {triageReq.unitAddress}</p>}
                {triageReq.description && <p className="text-xs text-muted-foreground mt-1.5 whitespace-pre-wrap line-clamp-4">{triageReq.description}</p>}
              </div>
              <div><Label>{t("portal.triageSpace", "Space")} <span className="text-red-500">*</span></Label>
                <select value={triageForm.spaceId} onChange={(e) => setTriageSpace(e.target.value)} className="mt-1 w-full h-10 rounded-md border border-border bg-background px-3 text-sm">
                  <option value="">{t("portal.triagePickSpace", "Pick a space…")}</option>
                  {spaces.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select></div>
              <div className="grid grid-cols-2 gap-3">
                <div><Label>{t("portal.triageFlow", "Flow")}</Label>
                  <select value={triageForm.workflowId} onChange={(e) => setTriageForm({ ...triageForm, workflowId: e.target.value })} className="mt-1 w-full h-10 rounded-md border border-border bg-background px-3 text-sm">
                    <option value="">{t("portal.triageFlowDefault", "Space default")}</option>
                    {flows.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
                  </select></div>
                <div><Label>{t("portal.triagePriority", "Priority")}</Label>
                  <select value={triageForm.priority} onChange={(e) => setTriageForm({ ...triageForm, priority: e.target.value })} className="mt-1 w-full h-10 rounded-md border border-border bg-background px-3 text-sm">
                    {["LOW", "MEDIUM", "HIGH", "URGENT"].map((p) => <option key={p} value={p}>{p.charAt(0) + p.slice(1).toLowerCase()}</option>)}
                  </select></div>
              </div>
              <div><Label>{t("portal.triageWorker", "Assign worker")}</Label>
                <select value={triageForm.assignedToId} disabled={!triageForm.spaceId} onChange={(e) => setTriageForm({ ...triageForm, assignedToId: e.target.value })} className="mt-1 w-full h-10 rounded-md border border-border bg-background px-3 text-sm disabled:opacity-50">
                  <option value="">{!triageForm.spaceId ? t("portal.triagePickSpaceFirst", "Pick a space first") : t("portal.triageUnassigned", "Leave unassigned")}</option>
                  {spaceWorkers.map((m) => <option key={m.userId} value={m.userId}>{m.user?.firstName} {m.user?.lastName}</option>)}
                </select>
                {triageForm.spaceId && !spaceMembersQ.isLoading && spaceWorkers.length === 0 ? (
                  <p className="mt-1 text-xs text-amber-600 dark:text-amber-400">{t("portal.triageNoMembers", "No workers assigned to this space yet. Add members to the space, or leave unassigned.")}</p>
                ) : null}
              </div>
            </div>
          )}
          <DialogFooter><Button variant="ghost" onClick={() => setTriageReq(null)}>{t("common.cancel", "Cancel")}</Button>
            <Button disabled={!triageForm.spaceId || triageM.isPending} onClick={() => triageM.mutate()}>{triageM.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : t("portal.triageAccept", "Accept & route")}</Button></DialogFooter>
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

      {/* Remove client from the portal */}
      <AlertDialog open={!!clientToRemove} onOpenChange={(o) => !o && setClientToRemove(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("portal.removeClientTitle", "Remove {{name}} from this portal?", { name: clientToRemove?.name })}</AlertDialogTitle>
            <AlertDialogDescription>{t("portal.removeClientWarn", "They immediately lose app access and are detached from this portal (any apartment they held is freed). Their record and history are kept — you can invite them again later.")}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={removeClientM.isPending}>{t("common.cancel", "Cancel")}</AlertDialogCancel>
            <AlertDialogAction className="bg-red-600 hover:bg-red-700" onClick={(e) => { e.preventDefault(); if (clientToRemove) removeClientM.mutate(clientToRemove.id) }} disabled={removeClientM.isPending}>
              {removeClientM.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}{t("portal.removeClientConfirm", "Remove client")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Invite client */}
      <Dialog open={inviteOpen} onOpenChange={(o) => { if (!o) resetInvite() }}>
        <DialogContent>
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
            <div className="space-y-4">
              <p className="text-xs text-muted-foreground">{t("portal.inviteHint2", "Pick the client and their {{entity}} — or create either — then share the code. The client sets their own name on sign-up.", { entity: (portal?.entityLabel || "unit").toLowerCase() })}</p>

              {/* Client — pick an existing CRM customer, or create one with the
                  same customer model (＋ New). */}
              <div className="space-y-1.5">
                <Label>{t("portal.pickCustomer", "Client")}</Label>
                <div className="flex items-center gap-2">
                  <select
                    value={customerChoice}
                    onChange={(e) => setCustomerChoice(e.target.value)}
                    className="h-10 flex-1 rounded-md border border-border bg-background px-3 text-sm"
                  >
                    <option value="">{t("portal.pickCustomerPh", "Choose a customer…")}</option>
                    {availCustomers.map((c) => (
                      <option key={c.id} value={c.id}>{c.name}{c.email ? ` · ${c.email}` : ""}</option>
                    ))}
                  </select>
                  <CustomerForm
                    spaceId={portal?.spaceId ?? undefined}
                    personOnly
                    onSaved={(c) => { availCustomersQ.refetch(); if (c) setCustomerChoice(c.id) }}
                    trigger={<Button type="button" variant="outline" className="shrink-0 gap-1.5"><Plus className="h-4 w-4" />{t("portal.newShort", "New")}</Button>}
                  />
                </div>
              </div>

              {/* Entity (apartment / order / workspace…) — pick a vacant one (with
                  its location), or create one with the same model, minus the
                  Resident picker (＋ New). Copy follows the portal's entity label. */}
              <div className="space-y-1.5">
                <Label>{portal?.entityLabel || t("portal.pickApartment", "Apartment")}</Label>
                <div className="flex items-center gap-2">
                  <select
                    value={unitChoice}
                    onChange={(e) => setUnitChoice(e.target.value)}
                    className="h-10 flex-1 rounded-md border border-border bg-background px-3 text-sm"
                  >
                    <option value="">{t("portal.pickEntityPh", "Choose an available {{entity}}…", { entity: (portal?.entityLabel || "unit").toLowerCase() })}</option>
                    {availUnits.map((u) => (
                      <option key={u.id} value={u.id}>{u.name}{u.address ? ` · ${u.address}` : ""}</option>
                    ))}
                  </select>
                  {portal?.spaceId && (
                    <ApartmentDialog
                      spaceId={portal.spaceId}
                      hideResident
                      entityLabel={portal?.entityLabel || undefined}
                      onSaved={(u) => { availUnitsQ.refetch(); if (u) setUnitChoice(u.id) }}
                      trigger={<Button type="button" variant="outline" className="shrink-0 gap-1.5"><Plus className="h-4 w-4" />{t("portal.newShort", "New")}</Button>}
                    />
                  )}
                </div>
              </div>
            </div>
          )}
          <DialogFooter>
            {code ? <Button onClick={resetInvite}>{t("common.done", "Done")}</Button> : (
              <>
                <Button variant="ghost" onClick={() => setInviteOpen(false)}>{t("common.cancel", "Cancel")}</Button>
                <Button
                  disabled={inviteM.isPending || !customerChoice || !unitChoice}
                  onClick={() => inviteM.mutate()}
                >
                  {t("portal.createInvite", "Create invite")}
                </Button>
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
