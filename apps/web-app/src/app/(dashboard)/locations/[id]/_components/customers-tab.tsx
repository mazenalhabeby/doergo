"use client"

import { useMemo, useState } from "react"
import type { LucideIcon } from "lucide-react"
import { useRouter } from "next/navigation"
import { useTranslation } from "react-i18next"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { Contact, Plus, Smartphone, ChevronRight, User, Building2, Trash2, Globe, Hash, Landmark, Briefcase } from "lucide-react"

import { notify } from "@/lib/toast"
import { customersApi, type Customer, type CustomerDetail } from "@/lib/api"
import { customerStageLabel } from "@hbcfield/shared/client"
import { cn } from "@/lib/utils"
import { Truncated } from "@/components/truncated"
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

/*
  "contacts" is a different KIND of filter from the other three.

  All / CRM only / App users select among clients the list already holds.
  Contacts asks the server for rows it deliberately withholds: a person who
  exists because they work at a company you deal with is not a client, so they
  are excluded by default — a firm with six contacts would otherwise turn one
  client into seven rows and bury the pipeline.
*/
type Filter = "all" | "companies" | "people" | "contacts" | "app"

const initials = (n: string) => n.split(" ").map((w) => w[0]).slice(0, 2).join("").toUpperCase()

/**
 * The clients list — one workspace's, or the organization's.
 *
 * Takes an id rather than the space object because `space.id` was the only
 * field it ever read, and an optional one because this same list is now the
 * body of the top-level Clients page: no workspace means the whole book, which
 * the API already supports.
 *
 * That top-level page used to be a SECOND copy of these rows — same avatar
 * square, same stage line, same App-access badge, same chevron into the client
 * record — and the two had already drifted apart in what they offered. One
 * component, two mounts.
 */
export function CustomersTab({ spaceId }: { spaceId?: string }) {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const router = useRouter()

  const [search, setSearch] = useState("")
  const [filter, setFilter] = useState<Filter>("all")

  const listQ = useQuery({
    // The filter is IN the key: a different segment is a different question, and
    // the server answers each one — filtering a fetched page in the browser
    // would show twelve rows of a hundred and a total that disagreed with them.
    queryKey: ["space-customers", spaceId ?? "all", search, filter],
    queryFn: () =>
      customersApi.list({
        spaceId,
        // Contacts are withheld by default, so this asks for them rather than
        // filtering a result set they were never in.
        contacts: filter === "contacts" ? "only" : undefined,
        type: filter === "companies" ? "COMPANY" : filter === "people" ? "PERSON" : undefined,
        /*
          Org-wide means the CRM book, not every portal resident.

          A B2C organization can have thousands of residents; they are people
          with a login to a client portal, not clients being worked. Excluded in
          the QUERY rather than filtered after, so the request stays small — and
          the App-users filter below is hidden to match, since it would then
          select from nothing.
        */
        portalResident: spaceId ? undefined : false,
        search: search || undefined,
        limit: 100,
      }),
  })
  const customers = listQ.data?.data ?? []
  // Only the App-users split is still done here: it is a property of the row
  // rather than a different question for the server.
  const rows = useMemo(
    () => customers.filter((c) => filter !== "app" || c.isPortalResident),
    [customers, filter],
  )
  const invalidate = () => qc.invalidateQueries({ queryKey: ["space-customers", spaceId ?? "all"] })

  return (
    <div className="space-y-4">
      <SectionHeader
        icon={Contact}
        accent="blue"
        title={t("customers.title", "Customers")}
        description={
          spaceId
            ? t("customers.intro", "People & companies for this workspace. Sales works them with tasks; invited ones also use the app.")
            : t("customers.introAll", "Every client you can see. Sales works them with tasks; invited ones also use the app.")
        }
        action={<CustomerForm spaceId={spaceId} onSaved={invalidate} trigger={
          <Button size="sm"><Plus className="mr-1.5 h-4 w-4" /> {t("customers.add", "Add customer")}</Button>
        } />}
      />

      <div className="flex flex-wrap items-center justify-between gap-2">
        <Input placeholder={t("common.search", "Search…")} value={search} onChange={(e) => setSearch(e.target.value)} className="h-9 max-w-xs" />
        <div className="inline-flex flex-wrap rounded-lg bg-muted p-0.5">
          {((spaceId ? ["all", "companies", "people", "contacts", "app"] : ["all", "companies", "people", "contacts"]) as Filter[]).map((f) => (
            <button key={f} onClick={() => setFilter(f)}
              className={cn("rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
                filter === f ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground")}>
              {f === "all"
                ? t("customers.filter.all", "All")
                : f === "companies"
                  ? t("customers.filter.companies", "Companies")
                  : f === "people"
                    ? t("customers.filter.people", "People")
                    : f === "contacts"
                      ? t("customers.filter.contacts", "Contacts")
                      : t("customers.filter.app", "App users")}
            </button>
          ))}
        </div>
      </div>

      {listQ.isLoading ? (
        /*
          The shape of the rows that are coming, not a stack of grey slabs.

          A skeleton is a promise about the layout that follows. Four solid
          blocks promise four solid blocks; when bordered rows with an avatar and
          two lines of text arrive instead, the page rearranges itself in front
          of the reader — and a filled block also reads far heavier than the
          sparse row it stands in for, so the wait looks denser than the answer.

          The line widths vary because real names do. Identical bars read as a
          barcode, which is the other way a skeleton announces itself as fake.
        */
        <div className="space-y-2">
          {[
            ["w-40", "w-56"],
            ["w-32", "w-44"],
            ["w-48", "w-36"],
            ["w-36", "w-52"],
          ].map(([name, meta], i) => (
            <div key={i} className="flex items-center gap-3 rounded-xl border border-border p-3">
              <Skeleton className="h-10 w-10 shrink-0 rounded-lg" />
              <div className="min-w-0 flex-1 space-y-2">
                <Skeleton className={cn("h-3.5", name)} />
                <Skeleton className={cn("h-3", meta)} />
              </div>
              <Skeleton className="h-5 w-14 shrink-0 rounded-md" />
            </div>
          ))}
        </div>
      ) : rows.length === 0 ? (
        <EmptyState icon={Contact} title={t("customers.empty", "No customers yet")} />
      ) : (
        <div className="space-y-2">
          {rows.map((c) => {
            /*
              The subtitle, built once.

              It is truncated to the row's width, so the same string has to be
              available whole for the hover — computing it twice is how the
              tooltip ends up saying something the row does not.
            */
            const subtitle = [
              c.isContact
                ? c.contactOf
                  ? t("customers.contactAt", "Contact at {{name}}", { name: c.contactOf.name })
                  : t("customers.contactTag", "Contact")
                : customerStageLabel(c.status || "LEAD"),
              !c.isContact && c.contactOf ? t("customers.atCompany", "at {{name}}", { name: c.contactOf.name }) : null,
              /*
                Who to ring, by name — and the typed `contactName` only while
                there is nobody real to name instead. That old field is printed
                here and nowhere else, so a reader seeing "Lead · Klaus Berger"
                could open the client and never find Klaus.
              */
              c.primaryContact
                ? c.contactCount && c.contactCount > 1
                  ? `${c.primaryContact.name} +${c.contactCount - 1}`
                  : c.primaryContact.name
                : c.contactName,
              c.phone || c.email,
            ]
              .filter(Boolean)
              .join(" · ")
            return (
            <button key={c.id} onClick={() => router.push(`/customers/${c.id}`)}
              className={cn(
                "flex w-full items-center gap-3 rounded-xl border border-border p-3 text-left transition-colors hover:bg-muted/50",
                // Dimmed: a contact is somebody else's person, sitting in a list
                // of your clients. Still readable, plainly not the same thing.
                c.isContact && "opacity-70",
              )}>
              {/*
                Square for a company, round for a person — the same shape
                language the client record's own header uses, so the two kinds
                are told apart before anybody reads a word.
              */}
              <span className={cn(
                "flex h-10 w-10 shrink-0 items-center justify-center bg-muted text-sm font-semibold text-muted-foreground",
                c.type === "COMPANY" ? "rounded-lg" : "rounded-full",
              )}>
                {c.type === "COMPANY" ? <Building2 className="h-4.5 w-4.5" /> : initials(c.name)}
              </span>
              <span className="min-w-0 flex-1">
                <Truncated text={c.name} className="text-sm font-medium text-foreground" />
                <Truncated text={subtitle} className="text-xs text-muted-foreground" side="bottom" />
              </span>
              {c.isPortalResident ? (
                <Badge className="gap-1 bg-emerald-100 text-emerald-700 hover:bg-emerald-100 dark:bg-emerald-950/50 dark:text-emerald-300">
                  <Smartphone className="h-3 w-3" /> {t("customers.appAccess", "App access")}
                </Badge>
              ) : c.isContact ? (
                <Badge variant="outline">{t("customers.contactTag", "Contact")}</Badge>
              ) : (
                <Badge variant="secondary">{t("customers.crmTag", "CRM")}</Badge>
              )}
              <ChevronRight className="h-4 w-4 text-muted-foreground" />
            </button>
            )
          })}
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
  const [type, setType] = useState<"PERSON" | "COMPANY">(personOnly ? "PERSON" : (existing?.type === "COMPANY" ? "COMPANY" : "PERSON"))
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
              <button key={val} type="button" onClick={() => setType(val)}
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

function IconField({ icon: Icon, label, value, onChange, placeholder }: { icon: LucideIcon; label: string; value: string; onChange: (v: string) => void; placeholder?: string }) {
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
