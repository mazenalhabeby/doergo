"use client"

import { useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { useTranslation } from "react-i18next"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { Contact, Plus, Smartphone, ChevronRight } from "lucide-react"

import { notify } from "@/lib/toast"
import { customersApi, type Customer, type CompanyLocation } from "@/lib/api"
import { customerStageLabel } from "@hbcfield/shared/client"
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
import { PhoneInput } from "@/components/ui/phone-input"
import { SectionHeader, EmptyState } from "./section-header"

const isEmail = (v: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)

type Filter = "all" | "crm" | "app"

const initials = (n: string) => n.split(" ").map((w) => w[0]).slice(0, 2).join("").toUpperCase()

export function CustomersTab({ space }: { space: CompanyLocation }) {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const router = useRouter()
  const spaceId = space.id

  const [search, setSearch] = useState("")
  const [filter, setFilter] = useState<Filter>("all")

  const listQ = useQuery({
    queryKey: ["space-customers", spaceId, search],
    queryFn: () => customersApi.list({ spaceId, search: search || undefined, limit: 100 }),
  })
  const customers = listQ.data?.data ?? []
  const rows = useMemo(
    () => customers.filter((c) => filter === "all" || (filter === "app" ? c.isPortalResident : !c.isPortalResident)),
    [customers, filter],
  )
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

      <div className="flex flex-wrap items-center justify-between gap-2">
        <Input placeholder={t("common.search", "Search…")} value={search} onChange={(e) => setSearch(e.target.value)} className="h-9 max-w-xs" />
        <div className="inline-flex rounded-lg bg-muted p-0.5">
          {(["all", "crm", "app"] as Filter[]).map((f) => (
            <button key={f} onClick={() => setFilter(f)}
              className={cn("rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
                filter === f ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground")}>
              {f === "all" ? t("customers.filter.all", "All") : f === "crm" ? t("customers.filter.crm", "CRM only") : t("customers.filter.app", "App users")}
            </button>
          ))}
        </div>
      </div>

      {listQ.isLoading ? (
        <div className="space-y-2">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-16 w-full rounded-xl" />)}</div>
      ) : rows.length === 0 ? (
        <EmptyState icon={Contact} title={t("customers.empty", "No customers yet")} />
      ) : (
        <div className="space-y-2">
          {rows.map((c) => (
            <button key={c.id} onClick={() => router.push(`/customers/${c.id}`)}
              className="flex w-full items-center gap-3 rounded-xl border border-border p-3 text-left transition-colors hover:bg-muted/50">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-muted text-sm font-semibold text-muted-foreground">{initials(c.name)}</span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium text-foreground">{c.name}</span>
                <span className="block truncate text-xs text-muted-foreground">
                  {[customerStageLabel(c.status || "LEAD"), c.contactName, c.phone || c.email].filter(Boolean).join(" · ")}
                </span>
              </span>
              {c.isPortalResident ? (
                <Badge className="gap-1 bg-emerald-100 text-emerald-700 hover:bg-emerald-100 dark:bg-emerald-950/50 dark:text-emerald-300">
                  <Smartphone className="h-3 w-3" /> {t("customers.appAccess", "App access")}
                </Badge>
              ) : (
                <Badge variant="secondary">{t("customers.crmTag", "CRM")}</Badge>
              )}
              <ChevronRight className="h-4 w-4 text-muted-foreground" />
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// Add / edit dialog — exported for reuse on the full customer record page.
export function CustomerForm({ spaceId, existing, onSaved, trigger }: {
  spaceId?: string; existing?: Customer; onSaved: () => void; trigger: React.ReactNode
}) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState({
    name: existing?.name ?? "", contactName: existing?.contactName ?? "", email: existing?.email ?? "",
    phone: existing?.phone ?? "", address: existing?.address ?? "", notes: existing?.notes ?? "",
  })
  const set = (k: keyof typeof form, v: string) => setForm((f) => ({ ...f, [k]: v }))
  const emailInvalid = !!form.email && !isEmail(form.email)

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
            <div className="space-y-1">
              <Label>{t("customers.email", "Email")}</Label>
              <Input type="email" inputMode="email" value={form.email} onChange={(e) => set("email", e.target.value)}
                aria-invalid={emailInvalid} className={cn(emailInvalid && "border-destructive focus-visible:ring-destructive")} />
              {emailInvalid && <p className="text-[11px] text-destructive">{t("customers.emailInvalid", "Enter a valid email")}</p>}
            </div>
            <div className="space-y-1">
              <Label>{t("customers.phone", "Phone")}</Label>
              <PhoneInput value={form.phone} onChange={(v) => set("phone", v)} />
            </div>
          </div>
          <div className="space-y-1">
            <Label>{t("customers.notes", "Notes")}</Label>
            <Textarea value={form.notes} onChange={(e) => set("notes", e.target.value)} rows={2} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>{t("common.cancel", "Cancel")}</Button>
          <Button disabled={!form.name.trim() || emailInvalid || save.isPending} onClick={() => save.mutate()}>
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
