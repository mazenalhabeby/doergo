"use client"

import {
  ArrowLeft,
  Plus,
  Trash2,
  Ticket,
  Pencil,
  AlertTriangle,
  Inbox,
  Users,
  ListChecks,
  ChevronRight,
  Loader2,
  Repeat,
  Upload,
  ImageIcon,
  Building2,
} from "lucide-react"
import { type Customer, type PortalRequestView } from "@/lib/api"
import { portalTile } from "@/lib/portal-ui"
import { personInitials } from "@hbcfield/shared/client"
import { getPriorityConfig } from "@/lib/constants"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Tabs, TabsList, TabsContent } from "@/components/ui/tabs"
import { STATUS_STYLES, TabTrigger, Panel, EmptyState, Loading } from "./portal-detail-page-helpers"
import type { PortalDetailPageState } from "./use-portal-detail-page"

/** Part of PortalDetailPage's markup, moved here unchanged; it reads the page's state from `vm`. */
export function PortalDetailPagePortal({ vm }: { vm: PortalDetailPageState }) {
  const {
    backToSpace,
    t,
    meta,
    portal,
    openCount,
    requestCount,
    clientCount,
    mayManage,
    setTypePickerOpen,
    mayInvite,
    setInviteOpen,
    coverInputRef,
    uploadCoverM,
    removeCoverM,
    ownerSpaceName,
    categories,
    requestsQ,
    mayAnswer,
    openTriage,
    router,
    residentsQ,
    setClientToRemove,
    openNewCat,
    openEditCat,
    setCatRemove,
    user,
    setDelConfirmText,
    setDelPortalOpen,
  } = vm
  return (
    <div className="max-w-screen-lg mx-auto px-6 py-8">
      <Button variant="ghost" size="sm" className="mb-4 -ml-2 gap-1.5 text-muted-foreground" onClick={backToSpace}>
        <ArrowLeft className="h-4 w-4" />{t("portal.title", "Client portals")}
      </Button>

      {/* Header */}
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-start gap-3 min-w-0">
          <div className={`h-12 w-12 rounded-xl flex items-center justify-center shrink-0 text-sm font-semibold ${portalTile(meta.accent)}`}>{personInitials(portal?.name)}</div>
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
          {mayManage && (
            <Button variant="outline" className="h-11 rounded-xl gap-1.5" onClick={() => setTypePickerOpen(true)}>
              <Repeat className="h-4 w-4" />{t("portal.changeType", "Change type")}
            </Button>
          )}
          {mayInvite && <Button onClick={() => setInviteOpen(true)} className="h-11 rounded-xl shadow-sm gap-1.5"><Ticket className="h-4 w-4" />{t("portal.inviteResident", "Invite client")}</Button>}
        </div>
      </div>

      {/* Cover image — previewed exactly as the app shows it (full-screen
          portrait background on the client's home), so it looks right on web too. */}
      <div className="mb-6 flex flex-col items-center gap-5 rounded-2xl border border-border bg-card p-5 sm:flex-row sm:items-stretch">
        {/* Phone-frame preview */}
        <div className="relative aspect-[9/16] w-[168px] shrink-0 overflow-hidden rounded-[24px] border-[5px] border-foreground/15 bg-muted shadow-lg">
          {portal?.coverImageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={portal.coverImageUrl} alt="" decoding="async" className="absolute inset-0 h-full w-full object-cover" />
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
            <Button size="sm" className="gap-1.5" disabled={!mayManage || uploadCoverM.isPending} onClick={() => coverInputRef.current?.click()}>
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
          <span className="font-medium text-foreground">{ownerSpaceName || t("portal.thisSpace", "this workspace")}</span>
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
                  <button key={r.id} className="w-full flex items-center gap-4 px-5 py-3.5 hover:bg-accent/30 transition-colors text-left" onClick={() => pending ? (mayAnswer && openTriage(r)) : router.push(`/tasks/${r.id}`)}>
                    <span className={`h-2 w-2 rounded-full shrink-0 ${r.priority ? "" : "bg-slate-400"}`} style={r.priority ? { backgroundColor: getPriorityConfig(r.priority).hex } : undefined} title={r.priority ? getPriorityConfig(r.priority).label : undefined} />
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
            {mayInvite && <Button variant="outline" size="sm" className="gap-1.5" onClick={() => setInviteOpen(true)}><Plus className="h-3.5 w-3.5" />{t("portal.inviteResident", "Invite client")}</Button>}
          </div>
          <Panel>
            {residentsQ.isLoading ? <Loading /> : clientCount === 0 ? (
              <EmptyState icon={<Users className="h-6 w-6" />} title={t("portal.noResidentsTitle", "No clients yet")} hint={t("portal.noResidents", "Invite one — they get a code to sign in on the app.")}
                cta={mayInvite ? <Button size="sm" className="gap-1.5" onClick={() => setInviteOpen(true)}><Ticket className="h-4 w-4" />{t("portal.inviteResident", "Invite client")}</Button> : undefined} />
            ) : (
              <div className="divide-y divide-border/60">
                {residentsQ.data!.map((r: Customer) => (
                  <div key={r.id} className="group flex items-center gap-2 px-5 py-3.5 hover:bg-accent/30 transition-colors">
                    <button className="flex min-w-0 flex-1 items-center gap-4 text-left" onClick={() => router.push(`/customers/${r.id}`)}>
                      <div className="h-9 w-9 rounded-lg bg-primary/10 text-primary flex items-center justify-center shrink-0 text-sm font-semibold">{personInitials(r.name)}</div>
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
            {mayManage && <Button variant="outline" size="sm" className="gap-1.5" onClick={openNewCat}><Plus className="h-3.5 w-3.5" />{t("portal.addCategory", "Add category")}</Button>}
          </div>
          <Panel>
            {categories.length === 0 ? <EmptyState icon={<ListChecks className="h-6 w-6" />} title={t("portal.noCategoriesTitle", "No categories yet")} hint={t("portal.noCategories", "Add a category so clients can classify what they report.")}
              cta={mayManage ? <Button size="sm" className="gap-1.5" onClick={openNewCat}><Plus className="h-4 w-4" />{t("portal.addCategory", "Add category")}</Button> : undefined} /> : (
              <div className="divide-y divide-border/60">
                {categories.map((c) => (
                  <div key={c.id} className="group flex items-center gap-4 px-5 py-3.5">
                    <div className={`h-10 w-10 rounded-lg flex items-center justify-center shrink-0 text-xs font-semibold ${portalTile(c.color)}`}>{personInitials(c.label)}</div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-foreground truncate flex items-center gap-1.5">{c.label}
                        {c.urgent && <span className="text-[10px] font-semibold rounded-full bg-red-500/10 text-red-600 dark:text-red-400 px-1.5 py-0.5">URGENT</span>}
                      </p>
                      <p className="text-xs text-muted-foreground truncate mt-0.5">{(c.issues || []).join(" · ") || t("portal.noIssues", "no sub-issues")}{c.team ? ` — ${c.team}` : ""}</p>
                    </div>
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      {mayManage && <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={() => openEditCat(c)}><Pencil className="h-3.5 w-3.5" /></Button>}
                      {mayManage && <Button variant="ghost" size="sm" className="h-8 w-8 p-0 text-red-600 hover:text-red-700" onClick={() => setCatRemove(c)}><Trash2 className="h-3.5 w-3.5" /></Button>}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Panel>
        </TabsContent>
      </Tabs>

      {/* Danger zone — deleting is managing, and closed to external members (the route says both). */}
      {portal && mayManage && user?.isExternal !== true && (
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
  )
}
