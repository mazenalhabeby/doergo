"use client"

import { keys } from "@/lib/query-keys"
import dynamic from "next/dynamic"

import { useState, useRef } from "react"
import { useParams, useRouter } from "next/navigation"
import { useQuery, useMutation, useQueryClient, type QueryKey } from "@tanstack/react-query"
import { useTranslation } from "react-i18next"
import { ArrowLeft, Plus, Trash2, Ticket, Copy, Check, Pencil, AlertTriangle, Inbox, Users, ListChecks, ChevronRight, Loader2, Repeat, Upload, ImageIcon, Building2 } from "lucide-react"

import { portalAdminApi, locationsApi, workflowsApi, type PortalIntakeCategory, type Customer, type PortalCategoryInput, type PortalRequestView } from "@/lib/api"
import { portalTile } from "@/lib/portal-ui"
import { canReceiveTasks, personName, personInitials } from "@hbcfield/shared/client"
import { getPriorityConfig } from "@/lib/constants"
import { useSpaceModules } from "@/hooks/use-space-modules"
import { notify } from "@/lib/toast"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import { accessAllows, isAdmin } from "@hbcfield/shared/client"
import { useAuth } from "@/contexts/auth-context"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { ConfirmDialog, ConfirmTargetDialog } from "@/components/confirm-dialog"
import { copyText } from "@/lib/clipboard"
import { useActiveSpaces } from "@/hooks/use-space-directory"
import { usePortalDetailPage, TEMPLATES } from "./use-portal-detail-page"
import {
  ApartmentDialog,
  CustomerForm,
  COLORS,
  STATUS_STYLES,
  TabTrigger,
  Panel,
  EmptyState,
  Loading,
} from "./portal-detail-page-helpers"
import { PortalDetailPagePortal } from "./portal-detail-page-portal"
import { PortalDetailPageInviteResident } from "./portal-detail-page-invite-resident"

export default function PortalDetailPage() {
  const vm = usePortalDetailPage()
  const {
    spaceId,
    router,
    t,
    backToSpace,
    spaceHasApartments,
    user,
    mayManage,
    mayAnswer,
    mayInvite,
    residentsQ,
    requestsQ,
    spaces,
    flows,
    ownerSpaceName,
    portal,
    categories,
    meta,
    typePickerOpen,
    setTypePickerOpen,
    switchOpen,
    setSwitchOpen,
    switchM,
    delPortalM,
    delPortalOpen,
    setDelPortalOpen,
    delConfirmText,
    setDelConfirmText,
    canDeletePortal,
    catEdit,
    setCatEdit,
    catForm,
    setCatForm,
    catRemove,
    setCatRemove,
    openNewCat,
    openEditCat,
    saveCatM,
    delCatM,
    triageReq,
    setTriageReq,
    triageForm,
    setTriageForm,
    openTriage,
    spaceMembersQ,
    spaceWorkers,
    setTriageSpace,
    triageM,
    coverInputRef,
    uploadCoverM,
    removeCoverM,
    clientToRemove,
    setClientToRemove,
    removeClientM,
    inviteOpen,
    setInviteOpen,
    unitChoice,
    setUnitChoice,
    customerChoice,
    setCustomerChoice,
    code,
    copied,
    setCopied,
    availUnitsQ,
    availUnits,
    availCustomersQ,
    availCustomers,
    resetInvite,
    inviteM,
    requestCount,
    clientCount,
    openCount,
  } = vm

  return (
    <div className="min-h-full bg-background">
      <PortalDetailPagePortal vm={vm} />

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
                  className={`w-full flex items-center justify-between gap-3 rounded-xl border p-3 text-left transition-colors ${isCurrent
                    ? "border-primary/40 bg-primary/5 cursor-default"
                    : locked ? "cursor-not-allowed border-border opacity-60" : "border-border hover:bg-accent/40"}`}
                >
                  <span className="flex items-center gap-2.5 min-w-0">
                    <span
                      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-medium ${portalTile(x.accent)}`}>{x.badge}</span>
                    <span className="min-w-0">
                      <span className="block text-sm text-foreground truncate">{x.label}</span>
                      {locked && <span className="block text-[11px] text-muted-foreground">{t("portal.apartmentModuleRequired", "Enable the Apartments module for this workspace to use this type.")}</span>}
                    </span>
                  </span>
                  {isCurrent
                    ? <span className={"inline-flex items-center gap-1 text-[11px] font-medium text-primary " + "shrink-0"}><Check className="h-3.5 w-3.5" />{t("portal.currentType", "Current")}</span>
                    : !locked && <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />}
                </button>
              )
            })}
          </div>
          <p className="text-[11px] text-muted-foreground">{t("portal.changeTypeHint", ("Switching replaces the issue categories with the new type's defaults. " + "Clients and their requests are kept."))}</p>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={!!switchOpen}
        onOpenChange={(o) => !o && setSwitchOpen(null)}
        titleClassName="flex items-center gap-2"
        title={<><AlertTriangle className="h-4 w-4 text-amber-500" />{t("portal.switchTitle", "Switch portal type?")}</>}
        description={t("portal.switchWarn", ("This replaces the issue categories with the new type’s defaults. Clients " + "and their requests are kept."))}
        cancelLabel={t("common.cancel", "Cancel")}
        confirmLabel={t("portal.switchConfirm", "Switch & reset categories")}
        onConfirm={() => switchOpen && switchM.mutate(switchOpen)}
        confirmDisabled={switchM.isPending}
      />

      {/* Delete portal — type-the-name to confirm */}
      <Dialog open={delPortalOpen} onOpenChange={(o) => !delPortalM.isPending && setDelPortalOpen(o)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("portal.deleteDialogTitle", "Delete “{{name}}”?", { name: portal?.name })}</DialogTitle>
            <DialogDescription>{t("portal.deletePortalWarn", ("Deleting removes the portal and its categories. Clients keep their " + "accounts but lose portal access."))}</DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-1">
            <p className="text-sm text-muted-foreground">
              {clientCount > 0 || requestCount > 0
                ? t("portal.deletePortalStats", ("This portal has {{clients}} client(s) and {{requests}} request(s). Their " + "history is kept but they lose access here."), { clients: clientCount, requests: requestCount })
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
                <select value={catForm.color} onChange={(e) => setCatForm({ ...catForm, color: e.target.value })} className={"mt-1 w-full h-10 rounded-md border border-border bg-background px-3 " + "text-sm"}>
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
            <DialogDescription>{t("portal.triageHint", ("Send this request into a workspace and choose how it should flow, then " + "assign a worker."))}</DialogDescription>
          </DialogHeader>
          {triageReq && (
            <div className="space-y-3">
              <div className="rounded-lg border border-border bg-muted/30 px-3 py-2">
                <p className="text-sm font-medium text-foreground truncate">{triageReq.title}</p>
                <p className="text-xs text-muted-foreground truncate mt-0.5"><span className="font-mono">{triageReq.reference}</span>{triageReq.customerName ? ` · ${triageReq.customerName}` : ""}{triageReq.unitName ? ` · ${triageReq.unitName}` : ""}</p>
                {triageReq.unitAddress && <p className="text-xs text-muted-foreground mt-1">📍 {triageReq.unitAddress}</p>}
                {triageReq.description && <p className="text-xs text-muted-foreground mt-1.5 whitespace-pre-wrap line-clamp-4">{triageReq.description}</p>}
              </div>
              <div><Label>{t("portal.triageSpace", "Workspace")} <span className="text-red-500">*</span></Label>
                <select value={triageForm.spaceId} onChange={(e) => setTriageSpace(e.target.value)} className={"mt-1 w-full h-10 rounded-md border border-border bg-background px-3 " + "text-sm"}>
                  <option value="">{t("portal.triagePickSpace", "Pick a workspace…")}</option>
                  {spaces.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select></div>
              <div className="grid grid-cols-2 gap-3">
                <div><Label>{t("portal.triageFlow", "Flow")}</Label>
                  <select value={triageForm.workflowId} onChange={(e) => setTriageForm({ ...triageForm, workflowId: e.target.value })} className={"mt-1 w-full h-10 rounded-md border border-border bg-background px-3 " + "text-sm"}>
                    <option value="">{t("portal.triageFlowDefault", "Workspace default")}</option>
                    {flows.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
                  </select></div>
                <div><Label>{t("portal.triagePriority", "Priority")}</Label>
                  <select value={triageForm.priority} onChange={(e) => setTriageForm({ ...triageForm, priority: e.target.value })} className={"mt-1 w-full h-10 rounded-md border border-border bg-background px-3 " + "text-sm"}>
                    {["LOW", "MEDIUM", "HIGH", "URGENT"].map((p) => <option key={p} value={p}>{p.charAt(0) + p.slice(1).toLowerCase()}</option>)}
                  </select></div>
              </div>
              <div><Label>{t("portal.triageWorker", "Assign worker")}</Label>
                <select value={triageForm.assignedToId} disabled={!triageForm.spaceId} onChange={(e) => setTriageForm({ ...triageForm, assignedToId: e.target.value })} className={"mt-1 w-full h-10 rounded-md border border-border bg-background px-3 " + "text-sm disabled:opacity-50"}>
                  <option value="">{!triageForm.spaceId ? t("portal.triagePickSpaceFirst", "Pick a workspace first") : t("portal.triageUnassigned", "Leave unassigned")}</option>
                  {spaceWorkers.map((m) => <option key={m.userId} value={m.userId}>{personName(m.user)}</option>)}
                </select>
                {triageForm.spaceId && !spaceMembersQ.isLoading && spaceWorkers.length === 0 ? (
                  <p className="mt-1 text-xs text-amber-600 dark:text-amber-400">{t("portal.triageNoMembers", ("No workers assigned to this workspace yet. Add members to the workspace, " + "or leave unassigned."))}</p>
                ) : null}
              </div>
            </div>
          )}
          <DialogFooter><Button variant="ghost" onClick={() => setTriageReq(null)}>{t("common.cancel", "Cancel")}</Button>
            <Button disabled={!triageForm.spaceId || triageM.isPending} onClick={() => triageM.mutate()}>{triageM.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : t("portal.triageAccept", "Accept & route")}</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Category delete */}
      <ConfirmDialog
        open={!!catRemove}
        onOpenChange={(o) => !o && setCatRemove(null)}
        title={t("portal.deleteCategoryTitle", "Delete “{{label}}”?", { label: catRemove?.label })}
        description={t("portal.deleteCategoryWarn", ("Clients can no longer pick this category for new requests. Existing " + "requests keep their category."))}
        cancelLabel={t("common.cancel", "Cancel")}
        confirmLabel={t("common.delete", "Delete")}
        onConfirm={() => catRemove && delCatM.mutate(catRemove.id)}
        destructive
        confirmDisabled={delCatM.isPending}
      />

      {/* Remove client from the portal */}
      <ConfirmTargetDialog
        target={clientToRemove}
        onClose={() => setClientToRemove(null)}
        title={t("portal.removeClientTitle", "Remove {{name}} from this portal?", { name: clientToRemove?.name })}
        description={t("portal.removeClientWarn", ("They immediately lose app access and are detached from this portal (any " + "apartment they held is freed). Their record and history are kept — you " + "can invite them again later."))}
        cancelLabel={t("common.cancel", "Cancel")}
        confirmLabel={t("portal.removeClientConfirm", "Remove client")}
        mutation={removeClientM}
      />

      {/* Invite client */}
      <PortalDetailPageInviteResident vm={vm} />
    </div>
  )
}
