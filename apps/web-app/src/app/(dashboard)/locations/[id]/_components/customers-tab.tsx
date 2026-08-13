"use client"

import { useMemo, useState } from "react"
import { useTranslation } from "react-i18next"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { Contact, Plus, Smartphone, Mail, Phone, MapPin, Trash2, Send, Copy, Check } from "lucide-react"

import { notify } from "@/lib/toast"
import { customersApi, type Customer, type CompanyLocation } from "@/lib/api"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger,
} from "@/components/ui/dialog"
import {
  Sheet, SheetContent, SheetHeader, SheetTitle,
} from "@/components/ui/sheet"
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import { SectionHeader, EmptyState } from "./section-header"

type Filter = "all" | "crm" | "app"

const initials = (n: string) => n.split(" ").map((w) => w[0]).slice(0, 2).join("").toUpperCase()

export function CustomersTab({ space }: { space: CompanyLocation }) {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const spaceId = space.id
  const hasB2C = !!space.enabledModules?.includes("b2c_portal")

  const [search, setSearch] = useState("")
  const [filter, setFilter] = useState<Filter>("all")
  const [openId, setOpenId] = useState<string | null>(null)

  const listQ = useQuery({
    queryKey: ["space-customers", spaceId, search],
    queryFn: () => customersApi.list({ spaceId, search: search || undefined, limit: 100 }),
  })
  const customers = listQ.data?.data ?? []
  const rows = useMemo(
    () => customers.filter((c) => filter === "all" || (filter === "app" ? c.isPortalResident : !c.isPortalResident)),
    [customers, filter],
  )
  const selected = customers.find((c) => c.id === openId) || null

  const invalidate = () => qc.invalidateQueries({ queryKey: ["space-customers", spaceId] })

  return (
    <div className="space-y-4">
      <SectionHeader
        icon={Contact}
        accent="blue"
        title={t("customers.title", "Customers")}
        description={t("customers.intro", "People & companies for this space. Sales works them with tasks; invited ones also use the app.")}
        action={<CustomerForm spaceId={spaceId} onSaved={invalidate} trigger={
          <Button size="sm"><Plus className="mr-1.5 h-4 w-4" /> {t("customers.add", "Add customer")}</Button>
        } />}
      />

      {/* Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Input
          placeholder={t("common.search", "Search…")}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="h-9 max-w-xs"
        />
        <div className="inline-flex rounded-lg bg-muted p-0.5">
          {(["all", "crm", "app"] as Filter[]).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={cn(
                "rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
                filter === f ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
              )}
            >
              {f === "all" ? t("customers.filter.all", "All") : f === "crm" ? t("customers.filter.crm", "CRM only") : t("customers.filter.app", "App users")}
            </button>
          ))}
        </div>
      </div>

      {/* List */}
      {listQ.isLoading ? (
        <div className="space-y-2">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-16 w-full rounded-xl" />)}</div>
      ) : rows.length === 0 ? (
        <EmptyState icon={Contact} title={t("customers.empty", "No customers yet")} />
      ) : (
        <div className="space-y-2">
          {rows.map((c) => (
            <button
              key={c.id}
              onClick={() => setOpenId(c.id)}
              className="flex w-full items-center gap-3 rounded-xl border border-border p-3 text-left transition-colors hover:bg-muted/50"
            >
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-muted text-sm font-semibold text-muted-foreground">
                {initials(c.name)}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium text-foreground">{c.name}</span>
                <span className="block truncate text-xs text-muted-foreground">
                  {[c.contactName, c.phone || c.email].filter(Boolean).join(" · ") || t("customers.noContact", "No contact")}
                </span>
              </span>
              {c.isPortalResident ? (
                <Badge className="gap-1 bg-emerald-100 text-emerald-700 hover:bg-emerald-100 dark:bg-emerald-950/50 dark:text-emerald-300">
                  <Smartphone className="h-3 w-3" /> {t("customers.appAccess", "App access")}
                </Badge>
              ) : (
                <Badge variant="secondary">{t("customers.crmTag", "CRM")}</Badge>
              )}
            </button>
          ))}
        </div>
      )}

      {/* Detail slide-over */}
      <Sheet open={!!openId} onOpenChange={(o) => !o && setOpenId(null)}>
        <SheetContent side="right" className="w-full sm:max-w-md overflow-y-auto">
          {selected && (
            <CustomerDetail
              customer={selected}
              spaceId={spaceId}
              hasB2C={hasB2C}
              onChanged={invalidate}
              onClose={() => setOpenId(null)}
            />
          )}
        </SheetContent>
      </Sheet>
    </div>
  )
}

// ── Detail slide-over ──────────────────────────────────────────────────────────
function CustomerDetail({ customer, spaceId, hasB2C, onChanged, onClose }: {
  customer: Customer; spaceId: string; hasB2C: boolean; onChanged: () => void; onClose: () => void
}) {
  const { t } = useTranslation()
  const [code, setCode] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  const invite = useMutation({
    mutationFn: () => customersApi.invite(customer.id),
    onSuccess: (res) => { setCode(res.code ?? null); notify.success(t("customers.invited", "Invite sent")); onChanged() },
    onError: (e: any) => notify.error(e.message || "Could not invite"),
  })
  const remove = useMutation({
    mutationFn: () => customersApi.remove(customer.id),
    onSuccess: () => { notify.success(t("customers.removed", "Customer removed")); onChanged(); onClose() },
    onError: (e: any) => notify.error(e.message || "Could not remove"),
  })

  const copy = () => { if (code) { navigator.clipboard?.writeText(code); setCopied(true); setTimeout(() => setCopied(false), 1500) } }

  return (
    <>
      <SheetHeader className="space-y-0">
        <div className="flex items-center gap-3">
          <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-muted text-base font-semibold text-muted-foreground">{initials(customer.name)}</span>
          <div className="min-w-0">
            <SheetTitle className="truncate">{customer.name}</SheetTitle>
            {customer.isPortalResident ? (
              <Badge className="mt-1 gap-1 bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300"><Smartphone className="h-3 w-3" /> {t("customers.appAccess", "App access")}</Badge>
            ) : (
              <Badge variant="secondary" className="mt-1">{t("customers.crmRecord", "CRM record · no app")}</Badge>
            )}
          </div>
        </div>
      </SheetHeader>

      <dl className="mt-5 space-y-2 text-sm">
        <Row icon={Mail} value={customer.email} />
        <Row icon={Phone} value={customer.phone} />
        <Row icon={MapPin} value={customer.address} />
        {customer.contactName && <Row icon={Contact} value={customer.contactName} />}
      </dl>
      {customer.notes && <p className="mt-3 rounded-lg bg-muted/50 p-3 text-sm text-muted-foreground">{customer.notes}</p>}

      {/* Invite to app */}
      <div className="mt-6 rounded-xl border border-border bg-muted/30 p-4">
        {customer.isPortalResident ? (
          <p className="text-center text-sm text-muted-foreground">✓ {t("customers.hasApp", "This customer logs in to order & follow.")}</p>
        ) : code ? (
          <div className="space-y-2 text-center">
            <p className="text-sm font-medium text-foreground">{t("customers.inviteCode", "Invite code")}</p>
            <button onClick={copy} className="mx-auto flex items-center gap-2 rounded-lg border border-border bg-background px-3 py-2 font-mono text-lg tracking-wider">
              {code} {copied ? <Check className="h-4 w-4 text-emerald-600" /> : <Copy className="h-4 w-4 text-muted-foreground" />}
            </button>
            <p className="text-xs text-muted-foreground">{t("customers.inviteShare", "Share this code (or the emailed link) so they can sign in.")}</p>
          </div>
        ) : hasB2C ? (
          <Button className="w-full" disabled={invite.isPending} onClick={() => invite.mutate()}>
            <Send className="mr-1.5 h-4 w-4" /> {invite.isPending ? t("common.saving", "Working…") : t("customers.invite", "Invite to app")}
          </Button>
        ) : (
          <div className="text-center">
            <Button className="w-full" disabled><Send className="mr-1.5 h-4 w-4" /> {t("customers.invite", "Invite to app")}</Button>
            <p className="mt-2 text-xs text-muted-foreground">🔒 {t("customers.needB2C", "Turn on the B2C Portal module (Modules tab) to invite customers.")}</p>
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="mt-6 flex items-center justify-between">
        <CustomerForm spaceId={spaceId} existing={customer} onSaved={onChanged} trigger={
          <Button variant="outline" size="sm">{t("common.edit", "Edit")}</Button>
        } />
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive"><Trash2 className="mr-1.5 h-4 w-4" /> {t("common.remove", "Remove")}</Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>{t("customers.removeTitle", "Remove customer?")}</AlertDialogTitle>
              <AlertDialogDescription>{t("customers.removeDesc", "This deactivates the record and revokes any app login.")}</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>{t("common.cancel", "Cancel")}</AlertDialogCancel>
              <AlertDialogAction onClick={() => remove.mutate()} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">{t("common.remove", "Remove")}</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </>
  )
}

function Row({ icon: Icon, value }: { icon: any; value?: string | null }) {
  if (!value) return null
  return (
    <div className="flex items-center gap-2 text-foreground">
      <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
      <span className="truncate">{value}</span>
    </div>
  )
}

// ── Add / edit dialog ───────────────────────────────────────────────────────────
function CustomerForm({ spaceId, existing, onSaved, trigger }: {
  spaceId: string; existing?: Customer; onSaved: () => void; trigger: React.ReactNode
}) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState({
    name: existing?.name ?? "", contactName: existing?.contactName ?? "", email: existing?.email ?? "",
    phone: existing?.phone ?? "", address: existing?.address ?? "", notes: existing?.notes ?? "",
  })
  const set = (k: keyof typeof form, v: string) => setForm((f) => ({ ...f, [k]: v }))

  const save = useMutation({
    mutationFn: () => existing
      ? customersApi.update(existing.id, form)
      : customersApi.create({ ...form, spaceId }),
    onSuccess: () => { notify.success(existing ? t("customers.updated", "Customer updated") : t("customers.created", "Customer added")); onSaved(); setOpen(false) },
    onError: (e: any) => notify.error(e.message || "Could not save"),
  })

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>{existing ? t("customers.edit", "Edit customer") : t("customers.add", "Add customer")}</DialogTitle></DialogHeader>
        <div className="grid gap-3">
          <Field label={t("customers.name", "Name")} required value={form.name} onChange={(v) => set("name", v)} />
          <Field label={t("customers.contactName", "Contact person")} value={form.contactName} onChange={(v) => set("contactName", v)} />
          <div className="grid grid-cols-2 gap-3">
            <Field label={t("customers.email", "Email")} value={form.email} onChange={(v) => set("email", v)} />
            <Field label={t("customers.phone", "Phone")} value={form.phone} onChange={(v) => set("phone", v)} />
          </div>
          <Field label={t("customers.address", "Address")} value={form.address} onChange={(v) => set("address", v)} />
          <div className="space-y-1">
            <Label>{t("customers.notes", "Notes")}</Label>
            <Textarea value={form.notes} onChange={(e) => set("notes", e.target.value)} rows={2} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>{t("common.cancel", "Cancel")}</Button>
          <Button disabled={!form.name.trim() || save.isPending} onClick={() => save.mutate()}>
            {save.isPending ? t("common.saving", "Saving…") : t("common.save", "Save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function Field({ label, value, onChange, required }: { label: string; value: string; onChange: (v: string) => void; required?: boolean }) {
  return (
    <div className="space-y-1">
      <Label>{label}{required && <span className="text-destructive"> *</span>}</Label>
      <Input value={value} onChange={(e) => onChange(e.target.value)} />
    </div>
  )
}
