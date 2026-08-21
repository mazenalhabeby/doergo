"use client"

import { useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { useTranslation } from "react-i18next"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { Contact, Plus, Smartphone, ChevronRight, User, Building2, Trash2, Globe, Hash, Landmark, Briefcase } from "lucide-react"

import { notify } from "@/lib/toast"
import { customersApi, type Customer, type CompanyLocation, type CustomerDetail } from "@/lib/api"
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

// Common industries for the datalist (smart suggestions, still free-text).
const INDUSTRIES = [
  "Construction", "Real Estate", "Property Management", "Facility Management",
  "Manufacturing", "Retail", "Hospitality", "Healthcare", "Logistics",
  "Energy & Utilities", "Telecommunications", "Automotive", "Agriculture",
  "Education", "Public Sector", "Professional Services", "Technology",
]

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
export function CustomerForm({ spaceId, existing, onSaved, trigger, personOnly }: {
  // personOnly = hide the Person/Company toggle and lock to Person (e.g. a
  // portal client / apartment resident is always a person).
  spaceId?: string; existing?: Customer; onSaved: (customer?: Customer) => void; trigger: React.ReactNode; personOnly?: boolean
}) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const [type, setType] = useState<"PERSON" | "COMPANY">(personOnly ? "PERSON" : ((existing?.type as any) === "COMPANY" ? "COMPANY" : "PERSON"))
  const [form, setForm] = useState({
    name: existing?.name ?? "", email: existing?.email ?? "",
    phone: existing?.phone ?? "", notes: existing?.notes ?? "",
    legalName: existing?.legalName ?? "", website: existing?.website ?? "",
    industry: existing?.industry ?? "", vatId: existing?.vatId ?? "", regNumber: existing?.regNumber ?? "",
  })
  const [details, setDetails] = useState<CustomerDetail[]>(existing?.details ?? [])
  const set = (k: keyof typeof form, v: string) => setForm((f) => ({ ...f, [k]: v }))
  const emailInvalid = !!form.email && !isEmail(form.email)
  const isCompany = type === "COMPANY"

  const setDetail = (i: number, k: "label" | "value", v: string) =>
    setDetails((d) => d.map((row, idx) => (idx === i ? { ...row, [k]: v } : row)))
  const addDetail = () => setDetails((d) => [...d, { label: "", value: "" }])
  const removeDetail = (i: number) => setDetails((d) => d.filter((_, idx) => idx !== i))

  const save = useMutation({
    mutationFn: () => {
      const cleanDetails = details.map((d) => ({ label: d.label.trim(), value: d.value.trim() })).filter((d) => d.label)
      const payload = {
        ...form, type,
        // Company-only fields are cleared when the record is a person.
        legalName: isCompany ? form.legalName : "",
        website: isCompany ? form.website : "",
        industry: isCompany ? form.industry : "",
        vatId: isCompany ? form.vatId : "",
        regNumber: isCompany ? form.regNumber : "",
        details: cleanDetails,
      }
      return existing ? customersApi.update(existing.id, payload) : customersApi.create({ ...payload, spaceId })
    },
    onSuccess: (customer) => { notify.success(existing ? t("customers.updated", "Customer updated") : t("customers.created", "Customer added")); onSaved(customer); setOpen(false) },
    onError: (e: Error) => notify.error(e.message || "Could not save"),
  })

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="max-h-[88vh] overflow-y-auto">
        <DialogHeader><DialogTitle>{existing ? t("customers.edit", "Edit customer") : t("customers.add", "Add customer")}</DialogTitle></DialogHeader>
        <div className="grid gap-3">
          {/* Person / Company segmented toggle (hidden when locked to Person) */}
          {!personOnly && (
          <div className="grid grid-cols-2 gap-1 rounded-lg bg-muted p-1">
            {([["PERSON", User, t("customers.typePerson", "Person")], ["COMPANY", Building2, t("customers.typeCompany", "Company")]] as const).map(([val, Icon, label]) => (
              <button key={val} type="button" onClick={() => setType(val as any)}
                className={cn("inline-flex items-center justify-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
                  type === val ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground")}>
                <Icon className="h-4 w-4" /> {label}
              </button>
            ))}
          </div>
          )}

          <Field label={isCompany ? t("customers.companyName", "Company name") : t("customers.name", "Name")} required value={form.name} onChange={(v) => set("name", v)} />
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>{isCompany ? t("customers.companyEmail", "Company email") : t("customers.email", "Email")}</Label>
              <Input type="email" inputMode="email" value={form.email} onChange={(e) => set("email", e.target.value)}
                aria-invalid={emailInvalid} className={cn(emailInvalid && "border-destructive focus-visible:ring-destructive")} />
              {emailInvalid && <p className="text-[11px] text-destructive">{t("customers.emailInvalid", "Enter a valid email")}</p>}
            </div>
            <div className="space-y-1">
              <Label>{isCompany ? t("customers.companyPhone", "Company phone") : t("customers.phone", "Phone")}</Label>
              <PhoneInput value={form.phone} onChange={(v) => set("phone", v)} />
            </div>
          </div>

          {/* Company-only fields */}
          {isCompany && (
            <div className="space-y-3 rounded-xl border border-border/70 bg-muted/30 p-3">
              <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                <Building2 className="h-3.5 w-3.5" /> {t("customers.companyInfo", "Company info")}
              </p>
              <IconField icon={Landmark} label={t("customers.legalName", "Legal name")} placeholder={t("customers.legalNamePh", "Registered entity name")} value={form.legalName} onChange={(v) => set("legalName", v)} />
              <div className="grid grid-cols-2 gap-3">
                <IconField icon={Globe} label={t("customers.website", "Website")} placeholder="example.com" value={form.website} onChange={(v) => set("website", v)} />
                <div className="space-y-1">
                  <Label className="flex items-center gap-1.5"><Briefcase className="h-3.5 w-3.5 text-muted-foreground" /> {t("customers.industry", "Industry")}</Label>
                  <Input list="crm-industries" value={form.industry} onChange={(e) => set("industry", e.target.value)} placeholder={t("customers.industryPh", "e.g. Construction")} />
                  <datalist id="crm-industries">{INDUSTRIES.map((i) => <option key={i} value={i} />)}</datalist>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <IconField icon={Hash} label={t("customers.vatId", "VAT / UID no.")} placeholder="ATU12345678" value={form.vatId} onChange={(v) => set("vatId", v)} />
                <IconField icon={Landmark} label={t("customers.regNumber", "Register no.")} placeholder={t("customers.regNumberPh", "FN 123456x")} value={form.regNumber} onChange={(v) => set("regNumber", v)} />
              </div>
            </div>
          )}

          {/* Flexible custom details */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>{t("customers.moreInfo", "Additional info")}</Label>
              <button type="button" onClick={addDetail} className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline">
                <Plus className="h-3.5 w-3.5" /> {t("customers.addField", "Add field")}
              </button>
            </div>
            {details.length === 0 ? (
              <p className="text-xs text-muted-foreground">{t("customers.moreInfoHint", "Add anything else — payment terms, preferred contact, account manager…")}</p>
            ) : (
              <div className="space-y-2">
                {details.map((d, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <Input value={d.label} onChange={(e) => setDetail(i, "label", e.target.value)} placeholder={t("customers.fieldLabel", "Label")} className="w-2/5" />
                    <Input value={d.value} onChange={(e) => setDetail(i, "value", e.target.value)} placeholder={t("customers.fieldValue", "Value")} className="flex-1" />
                    <button type="button" onClick={() => removeDetail(i)} className="shrink-0 rounded p-1.5 text-muted-foreground hover:text-destructive"><Trash2 className="h-4 w-4" /></button>
                  </div>
                ))}
              </div>
            )}
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

function IconField({ icon: Icon, label, value, onChange, placeholder }: { icon: any; label: string; value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <div className="space-y-1">
      <Label className="flex items-center gap-1.5"><Icon className="h-3.5 w-3.5 text-muted-foreground" /> {label}</Label>
      <Input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} />
    </div>
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
