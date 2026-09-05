"use client"

import { useMemo, useState } from "react"
import type { LucideIcon } from "lucide-react"
import { useRouter } from "next/navigation"
import { useTranslation } from "react-i18next"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { Contact, Plus, Smartphone, ChevronRight, User, Building2, Trash2, Globe, Hash, Landmark, Briefcase, Search, Users } from "lucide-react"

import { notify } from "@/lib/toast"
import { customersApi, type Customer, type CustomerDetail } from "@/lib/api"
import { customerStageLabel } from "@hbcfield/shared/client"
// The record page's own vocabulary — same client, same colour, same shape.
import { initials, stageDot, shapeFor, AVATAR_TONE } from "@/lib/crm-visuals"
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

/*
  "contacts" is a different KIND of filter from the other three.

  All / CRM only / App users select among clients the list already holds.
  Contacts asks the server for rows it deliberately withholds: a person who
  exists because they work at a company you deal with is not a client, so they
  are excluded by default — a firm with six contacts would otherwise turn one
  client into seven rows and bury the pipeline.
*/
type Filter = "all" | "companies" | "people" | "contacts" | "app"

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
        {/* An icon inside the field, and the count beside it — "12 clients" is
            the first thing anybody wants from a list and it was nowhere. */}
        <div className="relative max-w-xs flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder={t("common.search", "Search…")}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-9 pl-9"
          />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {!listQ.isLoading && (
            <span className="text-xs tabular-nums text-muted-foreground">
              {t("customers.countLabel", "{{count}} shown", { count: rows.length })}
            </span>
          )}
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
      </div>

      {listQ.isLoading ? (
        <div className="space-y-2">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-16 w-full rounded-xl" />)}</div>
      ) : rows.length === 0 ? (
        /*
          "No customers yet" was shown for every segment, including the ones a
          brand-new organization would land on with a full book — searching for a
          name that is not there, or opening Contacts before adding one, both
          reported that the CRM was empty.
        */
        <EmptyState
          icon={filter === "companies" ? Building2 : filter === "people" || filter === "contacts" ? Users : Contact}
          title={
            search
              ? t("customers.emptySearch", "Nothing matches “{{q}}”", { q: search })
              : filter === "companies"
                ? t("customers.emptyCompanies", "No companies yet")
                : filter === "people"
                  ? t("customers.emptyPeople", "No people yet")
                  : filter === "contacts"
                    ? t("customers.emptyContacts", "No contact people yet")
                    : filter === "app"
                      ? t("customers.emptyApp", "Nobody has app access yet")
                      : t("customers.empty", "No customers yet")
          }
          description={
            filter === "contacts"
              ? t("customers.emptyContactsHint", "Open a company and add the people you deal with there.")
              : undefined
          }
        />
      ) : (
        /*
          A table, not a stack of cards.

          Every row was a bordered card carrying an avatar, two lines of joined
          text, a badge and a chevron — the shape of a phone list, repeated down
          a wide screen. Nothing lined up: the stage started after the name, the
          phone number after whatever the stage happened to be, so no column
          could be read down and the page grew a hard border every 68 pixels.

          A CRM list is a table. Columns give the eye a rail to run down, the
          hairlines between rows are quieter than a border around each one, and
          the same information fits in half the height — which is what makes a
          book of clients feel like a book rather than a feed.
        */
        <div className="overflow-hidden rounded-xl border border-border bg-card">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] border-collapse text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/40 text-[11px] uppercase tracking-wider text-muted-foreground">
                  <th className="px-4 py-2.5 text-left font-semibold">{t("customers.colName", "Name")}</th>
                  <th className="px-3 py-2.5 text-left font-semibold">{t("customers.colStage", "Stage")}</th>
                  <th className="hidden px-3 py-2.5 text-left font-semibold lg:table-cell">{t("customers.colContact", "Contact")}</th>
                  <th className="hidden px-3 py-2.5 text-left font-semibold md:table-cell">{t("customers.colReach", "Phone / Email")}</th>
                  <th className="px-3 py-2.5 text-right font-semibold" />
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {rows.map((c) => (
                  <tr
                    key={c.id}
                    onClick={() => router.push(`/customers/${c.id}`)}
                    tabIndex={0}
                    onKeyDown={(e) => { if (e.key === "Enter") router.push(`/customers/${c.id}`) }}
                    className={cn(
                      "group cursor-pointer transition-colors hover:bg-muted/50 focus-visible:bg-muted/50 focus-visible:outline-none",
                      // A contact is somebody else's person sitting in a list of
                      // your clients — readable, plainly not the same thing.
                      c.isContact && "opacity-65",
                    )}
                  >
                    {/* ── name ── */}
                    <td className="px-4 py-2">
                      <div className="flex min-w-0 items-center gap-2.5">
                        {/*
                          Smaller than the card version on purpose: at 28px the
                          avatar identifies a row without setting its height, and
                          the row height is what decides whether this reads as a
                          table or a feed. Colour is keyed to the name and the
                          shape says company or person — the record page's own
                          vocabulary, so a client looks the same on both screens.
                        */}
                        <span className={cn(
                          "flex h-7 w-7 shrink-0 items-center justify-center text-[10px] font-semibold",
                          shapeFor(c.type), AVATAR_TONE,
                        )}>
                          {c.type === "COMPANY" ? <Building2 className="h-3.5 w-3.5" /> : initials(c.name)}
                        </span>
                        <span className="min-w-0">
                          <span className="block truncate font-medium text-foreground">{c.name}</span>
                          {/* Only when it says something the columns do not. */}
                          {c.isContact && c.contactOf && (
                            <span className="block truncate text-xs text-muted-foreground">
                              {t("customers.contactAt", "Contact at {{name}}", { name: c.contactOf.name })}
                            </span>
                          )}
                          {!c.isContact && c.contactOf && (
                            <span className="block truncate text-xs text-muted-foreground">
                              {t("customers.atCompany", "at {{name}}", { name: c.contactOf.name })}
                            </span>
                          )}
                        </span>
                      </div>
                    </td>

                    {/* ── stage ── */}
                    <td className="px-3 py-2">
                      {c.isContact ? (
                        <span className="text-xs text-muted-foreground">{t("customers.contactTag", "Contact")}</span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 whitespace-nowrap text-xs font-medium text-foreground/80">
                          <span className={cn("h-1.5 w-1.5 rounded-full", stageDot(c.status || "LEAD"))} />
                          {customerStageLabel(c.status || "LEAD")}
                        </span>
                      )}
                    </td>

                    {/* ── who to ring there ── */}
                    <td className="hidden max-w-[180px] px-3 py-2 lg:table-cell">
                      {c.primaryContact ? (
                        <span className="block truncate text-xs text-muted-foreground">
                          {c.primaryContact.name}
                          {c.contactCount && c.contactCount > 1 ? (
                            <span className="ml-1 text-muted-foreground/70">+{c.contactCount - 1}</span>
                          ) : null}
                        </span>
                      ) : c.contactName ? (
                        // The old typed field, only while there is nobody real
                        // to name instead — it is shown nowhere else in the app.
                        <span className="block truncate text-xs italic text-muted-foreground/70">{c.contactName}</span>
                      ) : (
                        <span className="text-xs text-muted-foreground/40">—</span>
                      )}
                    </td>

                    {/* ── reach ── */}
                    <td className="hidden max-w-[200px] px-3 py-2 md:table-cell">
                      <span className="block truncate text-xs tabular-nums text-muted-foreground">{c.phone || ""}</span>
                      {c.email && <span className="block truncate text-xs text-muted-foreground/70">{c.email}</span>}
                      {!c.phone && !c.email && <span className="text-xs text-muted-foreground/40">—</span>}
                    </td>

                    {/* ── state ── */}
                    <td className="px-3 py-2">
                      <div className="flex items-center justify-end gap-2">
                        {c.isPortalResident && (
                          <Badge variant="outline" className="gap-1 font-normal text-muted-foreground">
                            <Smartphone className="h-3 w-3" /> {t("customers.appAccess", "App access")}
                          </Badge>
                        )}
                        {/* Appears on the row under the pointer — a chevron on
                            every row of a table is forty arrows pointing at
                            nothing. */}
                        <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100" />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
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
