"use client"

import { useState } from "react"
import { useParams, useRouter } from "next/navigation"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { useTranslation } from "react-i18next"
import { ArrowLeft, Plus, Trash2, Ticket, Copy, Check, Mail, Loader2, AlertTriangle } from "lucide-react"

import { customersApi, portalAdminApi, invitationsApi, type PortalCustomerUnit } from "@/lib/api"
import { notify } from "@/lib/toast"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog"
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog"

const STATUS_STYLES: Record<string, string> = {
  NEW: "bg-blue-500/10 text-blue-600 dark:text-blue-400", ASSIGNED: "bg-purple-500/10 text-purple-600 dark:text-purple-400",
  ACCEPTED: "bg-indigo-500/10 text-indigo-600 dark:text-indigo-400", IN_PROGRESS: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
  BLOCKED: "bg-red-500/10 text-red-600 dark:text-red-400", COMPLETED: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  CLOSED: "bg-slate-500/10 text-slate-500 dark:text-slate-400", CANCELED: "bg-slate-500/10 text-slate-500 dark:text-slate-400",
}
const PRIORITY_DOT: Record<string, string> = {
  URGENT: "bg-red-500", HIGH: "bg-orange-500", MEDIUM: "bg-blue-500", LOW: "bg-slate-400",
}

export default function CustomerDetailPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const qc = useQueryClient()
  const { t } = useTranslation()

  const customerQ = useQuery({ queryKey: ["customer", id], queryFn: () => customersApi.get(id) })
  const unitsQ = useQuery({ queryKey: ["portalUnits", id], queryFn: () => portalAdminApi.listUnits(id) })
  const requestsQ = useQuery({ queryKey: ["portalRequests", id], queryFn: () => portalAdminApi.requests(id) })

  // Terminology adapts to the client's portal TYPE: rental → Apartment,
  // logistics → Order, workplace → Workspace (falls back to a generic "Unit").
  const portalId = customerQ.data?.portalId
  const portalQ = useQuery({
    queryKey: ["portal", portalId],
    queryFn: () => portalAdminApi.getPortal(portalId as string),
    enabled: !!portalId,
  })
  const entity = portalQ.data?.entityLabel || t("portal.entityFallback", "Unit")
  const entityLower = entity.toLowerCase()

  // Units
  const [unitOpen, setUnitOpen] = useState(false)
  const [unitName, setUnitName] = useState("")
  const [unitAddress, setUnitAddress] = useState("")
  const addUnitM = useMutation({
    mutationFn: () => portalAdminApi.createUnit({ customerId: id, name: unitName.trim(), address: unitAddress.trim() || null }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["portalUnits", id] })
      setUnitOpen(false); setUnitName(""); setUnitAddress("")
    },
    onError: (e) => notify.error(e instanceof Error ? e.message : t("common.error", "Something went wrong")),
  })
  const [unitToDelete, setUnitToDelete] = useState<PortalCustomerUnit | null>(null)
  const delUnitM = useMutation({
    mutationFn: (uid: string) => portalAdminApi.deleteUnit(uid),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["portalUnits", id] }); setUnitToDelete(null) },
    onError: (e) => notify.error(e instanceof Error ? e.message : t("common.error", "Something went wrong")),
  })

  // Remove client — deactivates the client and revokes their portal login.
  const [removeClientOpen, setRemoveClientOpen] = useState(false)
  const removeClientM = useMutation({
    mutationFn: () => customersApi.remove(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["portalResidents"] })
      qc.invalidateQueries({ queryKey: ["customer", id] })
      notify.success(t("portal.clientRemoved", "Client removed"))
      router.back()
    },
    onError: (e) => notify.error(e instanceof Error ? e.message : t("common.error", "Something went wrong")),
  })

  // Resend the existing pending invite by email (uses the stored code).
  const resendM = useMutation({
    mutationFn: () => portalAdminApi.resendInvite(id),
    onSuccess: (r: any) => notify.success(t("portal.inviteResent", "Invitation email sent to {{email}}", { email: r?.data?.sentTo ?? "the client" })),
    onError: (e) => notify.error(e instanceof Error ? e.message : t("common.error", "Something went wrong")),
  })

  // Invite
  const [inviteOpen, setInviteOpen] = useState(false)
  const [inviteEmail, setInviteEmail] = useState("")
  const [inviteUnit, setInviteUnit] = useState<string>("")
  const [code, setCode] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const inviteM = useMutation({
    mutationFn: () =>
      invitationsApi.create({
        targetRole: "CUSTOMER",
        customerId: id,
        unitId: inviteUnit || undefined,
        email: inviteEmail.trim() || undefined,
      }),
    onSuccess: (res) => {
      setCode(res.code)
      notify.success(inviteEmail.trim()
        ? t("portal.inviteEmailed", "Invitation created & emailed")
        : t("portal.inviteCreated", "Invitation created"))
    },
    onError: (e) => notify.error(e instanceof Error ? e.message : t("common.error", "Something went wrong")),
  })

  const customer = customerQ.data

  return (
    <div className="min-h-full bg-background">
      <div className="max-w-screen-lg mx-auto px-6 py-8">
        <Button variant="ghost" size="sm" className="mb-4 -ml-2 gap-1.5 text-muted-foreground" onClick={() => router.back()}>
          <ArrowLeft className="h-4 w-4" />{t("common.back", "Back")}
        </Button>

        {/* Header */}
        <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <h1 className="text-3xl font-bold text-foreground tracking-tight truncate">{customer?.name || "…"}</h1>
            {customer?.email && <p className="mt-1 text-sm text-muted-foreground truncate">{customer.email}</p>}
            <p className="mt-1 text-sm text-muted-foreground">{t("portal.detailSubtitle", "Portal access, units, and requests for this client.")}</p>
          </div>
          <div className="flex items-center gap-2">
            {customer?.email && (
              <Button variant="outline" className="h-11 rounded-xl gap-1.5" disabled={resendM.isPending} onClick={() => resendM.mutate()}>
                {resendM.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mail className="h-4 w-4" />}
                {t("portal.resendInvite", "Resend invitation")}
              </Button>
            )}
            <Button onClick={() => setInviteOpen(true)} className="h-11 rounded-xl shadow-sm gap-1.5"><Ticket className="h-4 w-4" />{t("portal.invite", "Invite to portal")}</Button>
          </div>
        </div>

        {/* Units — labelled by the portal type (Apartments / Orders / Workspaces) */}
        <Section title={`${entity}s`} action={
          <Button variant="outline" size="sm" className="gap-1.5" onClick={() => setUnitOpen(true)}><Plus className="h-3.5 w-3.5" />{t("portal.addEntity", "Add {{entity}}", { entity: entityLower })}</Button>
        }>
          {unitsQ.isLoading ? (
            <Empty text={t("common.loading", "Loading…")} />
          ) : (unitsQ.data?.length ?? 0) === 0 ? (
            <Empty text={t("portal.noEntities", "No {{entity}}s yet. Add the {{entity}} this client is tied to.", { entity: entityLower })} />
          ) : (
            <div className="divide-y divide-border/60">
              {unitsQ.data!.map((u: PortalCustomerUnit) => (
                <div key={u.id} className="flex items-center gap-4 px-5 py-3.5">
                  <div className="h-9 w-9 rounded-lg bg-primary/10 text-primary flex items-center justify-center shrink-0 text-sm font-semibold">{(u.name || "?").slice(0, 2).toUpperCase()}</div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-foreground truncate">{u.name}</p>
                    {u.address && <p className="text-xs text-muted-foreground truncate">{u.address}</p>}
                  </div>
                  <Button variant="ghost" size="sm" className="h-8 w-8 p-0 text-red-600 hover:text-red-700" onClick={() => setUnitToDelete(u)}><Trash2 className="h-3.5 w-3.5" /></Button>
                </div>
              ))}
            </div>
          )}
        </Section>

        {/* Requests */}
        <Section title={t("portal.requests", "Requests")}>
          {requestsQ.isLoading ? (
            <Empty text={t("common.loading", "Loading…")} />
          ) : (requestsQ.data?.length ?? 0) === 0 ? (
            <Empty text={t("portal.noRequestsOffice", "No requests from this customer yet.")} />
          ) : (
            <div className="divide-y divide-border/50">
              {requestsQ.data!.map((r) => (
                <button key={r.id} className="w-full flex items-center gap-3 px-4 sm:px-5 py-3.5 hover:bg-accent/40 transition-colors text-left" onClick={() => router.push(`/tasks/${r.id}`)}>
                  <span className={`h-2 w-2 rounded-full shrink-0 ${PRIORITY_DOT[r.priority] ?? "bg-slate-400"}`} title={r.priority} />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-foreground truncate">{r.title}</p>
                    <p className="text-xs text-muted-foreground truncate mt-0.5"><span className="font-mono">{r.reference}</span>{r.unitName ? ` · ${r.unitName}` : ""}</p>
                  </div>
                  <span className={`text-[11px] font-semibold capitalize rounded-full px-2.5 py-1 shrink-0 ${STATUS_STYLES[r.status] ?? "bg-slate-500/10 text-slate-600 dark:text-slate-400"}`}>
                    {r.status.replace(/_/g, " ").toLowerCase()}
                  </span>
                </button>
              ))}
            </div>
          )}
        </Section>

        {/* Danger zone */}
        {customer && (
          <Card className="mt-8 border-destructive/40">
            <CardHeader className="pb-3">
              <div className="flex items-start gap-3">
                <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-destructive/10 text-destructive">
                  <AlertTriangle className="h-[18px] w-[18px]" />
                </span>
                <div>
                  <CardTitle className="text-base text-destructive">{t("portal.dangerTitle", "Danger zone")}</CardTitle>
                  <CardDescription>{t("portal.clientDangerHint", "Revoke this client's access to the portal.")}</CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="flex flex-col gap-3 rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="pr-4">
                  <p className="text-sm font-medium text-foreground">{t("portal.removeClient", "Remove client")}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">{t("portal.removeClientWarn", "Their portal login is deactivated; request history is kept.")}</p>
                </div>
                <Button variant="destructive" className="shrink-0" onClick={() => setRemoveClientOpen(true)}>
                  <Trash2 className="mr-2 h-4 w-4" />{t("portal.removeClient", "Remove client")}
                </Button>
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Delete unit confirm */}
      <AlertDialog open={!!unitToDelete} onOpenChange={(o) => !o && setUnitToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("portal.deleteUnitTitle", "Remove this {{entity}}?", { entity: entityLower })}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("portal.deleteUnitWarn", "Requests already linked keep their history.")}{unitToDelete?.name ? ` (${unitToDelete.name})` : ""}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("common.cancel", "Cancel")}</AlertDialogCancel>
            <AlertDialogAction className="bg-red-600 hover:bg-red-700" onClick={() => unitToDelete && delUnitM.mutate(unitToDelete.id)} disabled={delUnitM.isPending}>{t("common.remove", "Remove")}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Remove client confirm */}
      <AlertDialog open={removeClientOpen} onOpenChange={setRemoveClientOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("portal.removeClientTitle", "Remove this client?")}</AlertDialogTitle>
            <AlertDialogDescription>{t("portal.removeClientWarn", "Their portal login is deactivated; request history is kept.")}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("common.cancel", "Cancel")}</AlertDialogCancel>
            <AlertDialogAction className="bg-red-600 hover:bg-red-700" onClick={() => removeClientM.mutate()} disabled={removeClientM.isPending}>{t("common.remove", "Remove")}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Add unit dialog */}
      <Dialog open={unitOpen} onOpenChange={(o) => !o && setUnitOpen(false)}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>{t("portal.addEntity", "Add {{entity}}", { entity: entityLower })}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label>{t("portal.unitName", "Name")}</Label><Input value={unitName} onChange={(e) => setUnitName(e.target.value)} placeholder={`${entity} 12A`} /></div>
            <div><Label>{t("portal.unitAddress", "Address")}</Label><Input value={unitAddress} onChange={(e) => setUnitAddress(e.target.value)} placeholder={t("portal.optional", "Optional")} /></div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setUnitOpen(false)}>{t("common.cancel", "Cancel")}</Button>
            <Button disabled={!unitName.trim() || addUnitM.isPending} onClick={() => addUnitM.mutate()}>{t("common.save", "Save")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Invite dialog */}
      <Dialog open={inviteOpen} onOpenChange={(o) => { if (!o) { setInviteOpen(false); setCode(null); setInviteEmail(""); setInviteUnit("") } }}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>{t("portal.inviteTitle", "Invite to the portal")}</DialogTitle></DialogHeader>
          {code ? (
            <div className="text-center py-4">
              <p className="text-sm text-muted-foreground mb-3">{t("portal.shareCode", "Share this code with the customer to activate their login:")}</p>
              <div className="flex items-center justify-center gap-2">
                <span className="text-2xl font-mono font-bold tracking-widest text-foreground">{code}</span>
                <Button variant="outline" size="sm" className="h-9 w-9 p-0" onClick={() => { navigator.clipboard.writeText(code); setCopied(true); setTimeout(() => setCopied(false), 1500) }}>
                  {copied ? <Check className="h-4 w-4 text-green-600" /> : <Copy className="h-4 w-4" />}
                </Button>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <div>
                <Label>{t("portal.inviteEmail", "Email (optional)")}</Label>
                <Input value={inviteEmail} onChange={(e) => setInviteEmail(e.target.value)} placeholder="resident@example.com" />
                <p className="mt-1 text-[11px] text-muted-foreground">{t("portal.inviteEmailHint", "If set, the invite code is emailed to the client automatically.")}</p>
              </div>
              <div>
                <Label>{t("portal.defaultEntity", "Default {{entity}} (optional)", { entity: entityLower })}</Label>
                <select
                  value={inviteUnit}
                  onChange={(e) => setInviteUnit(e.target.value)}
                  className="mt-1 w-full h-10 rounded-md border border-border bg-background px-3 text-sm"
                >
                  <option value="">{t("portal.none", "None")}</option>
                  {unitsQ.data?.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
                </select>
              </div>
            </div>
          )}
          <DialogFooter>
            {code ? (
              <Button onClick={() => { setInviteOpen(false); setCode(null); setInviteEmail(""); setInviteUnit("") }}>{t("common.done", "Done")}</Button>
            ) : (
              <>
                <Button variant="ghost" onClick={() => setInviteOpen(false)}>{t("common.cancel", "Cancel")}</Button>
                <Button disabled={inviteM.isPending} onClick={() => inviteM.mutate()}>{t("portal.createInvite", "Create invite")}</Button>
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function Section({ title, action, children }: { title: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="mb-6">
      <div className="flex items-center justify-between mb-2.5">
        <h2 className="font-semibold text-foreground">{title}</h2>
        {action}
      </div>
      <div className="rounded-2xl border border-border/60 bg-card shadow-sm overflow-hidden">{children}</div>
    </div>
  )
}

function Empty({ text }: { text: string }) {
  return <div className="px-6 py-10 text-center text-sm text-muted-foreground">{text}</div>
}
