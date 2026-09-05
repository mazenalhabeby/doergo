"use client"

import { useMemo, useState } from "react"
import type { LucideIcon } from "lucide-react"
import { useRouter } from "next/navigation"
import { useTranslation } from "react-i18next"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { Contact, Plus, Smartphone, ChevronRight, User, Building2, Trash2, Globe, Hash, Landmark, Briefcase } from "lucide-react"

import { notify } from "@/lib/toast"
import { customersApi, locationsApi, type CompanyLocation, type Customer, type CustomerDetail } from "@/lib/api"
import { useAuth } from "@/contexts/auth-context"
import { customerStageLabel } from "@hbcfield/shared/client"
import { cn } from "@/lib/utils"
import { Truncated } from "@/components/truncated"
import { ClientRowsSkeleton } from "@/components/skeletons/crm"
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
        // The rows that are coming — the same ones the route skeleton draws.
        <ClientRowsSkeleton />
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
/**
 * ⚠️ A client belongs to a WORKSPACE, and this form is opened from two places
 * that know different amounts about which one.
 *
 * From a workspace's own Customers tab, `spaceId` is that workspace and there is
 * nothing to ask. From the top-level Clients page the reader may be on "All",
 * where `spaceId` is undefined — and that used to create a client belonging to
 * NO workspace: absent from every workspace tab, visible only under All, and
 * outside the per-workspace CRM everything else here is built on. Sixteen of
 * nineteen clients in this database arrived that way.
 *
 * So when nobody has said which workspace, the form asks. One workspace and it
 * answers itself; several and it is a required choice, because guessing puts a
 * client somewhere a person then has to find.
 *
 * On EDIT it shows the workspace too. Hiding it was a mistake: a client created
 * before this asked — sixteen of nineteen here — had no way out of "no
 * workspace" except a database statement, and a client filed in the wrong one
 * was stuck there. The field says what it does, because moving a client between
 * workspaces is not the same kind of act as correcting a phone number. An app
 * user is the exception: their workspace is decided by the portal that runs
 * their login, and the server refuses to move them.
 */
export function CustomerForm({ spaceId, existing, onSaved, trigger, personOnly }: {
  // personOnly = hide the Person/Company toggle and lock to Person (e.g. a
  // portal client / apartment resident is always a person).
  spaceId?: string; existing?: Customer; onSaved: (customer?: Customer) => void; trigger: React.ReactNode; personOnly?: boolean
}) {
  const { t } = useTranslation()
  const { user } = useAuth()
  const [open, setOpen] = useState(false)
  const [type, setType] = useState<"PERSON" | "COMPANY">(personOnly ? "PERSON" : (existing?.type === "COMPANY" ? "COMPANY" : "PERSON"))
  const [form, setForm] = useState({
    name: existing?.name ?? "", email: existing?.email ?? "",
    phone: existing?.phone ?? "", notes: existing?.notes ?? "",
    legalName: existing?.legalName ?? "", website: existing?.website ?? "",
    industry: existing?.industry ?? "", vatId: existing?.vatId ?? "", regNumber: existing?.regNumber ?? "",
  })
  const [details, setDetails] = useState<CustomerDetail[]>(existing?.details ?? [])

  /*
    Workspaces this client could belong to — those with the CRM module on.

    Same query key the nav and the space tabs use, so opening this dialog reuses
    what the page already fetched rather than asking again. Only consulted when
    the caller did not name a workspace and this is a new client; editing never
    moves one, which is a different action with different consequences.
  */
  // Asked when nobody has answered (new, from "All"), and shown when editing so
  // a client can be filed, moved or rescued from having no workspace at all.
  const needsSpace = !spaceId && !existing
  const canMoveSpace = !!existing && !existing.isPortalResident
  const showSpace = needsSpace || canMoveSpace
  const spacesQ = useQuery({
    queryKey: ["locations", "list"],
    queryFn: () => locationsApi.list({ limit: 200 }),
    staleTime: 60_000,
    enabled: open && showSpace,
  })
  const crmSpaces = useMemo(() => {
    const all = ((spacesQ.data as { data?: CompanyLocation[] } | undefined)?.data ?? []).filter(
      (sp) => sp.isActive !== false,
    )
    // A space's own module list wins; an absent one inherits the organization's
    // — the same precedence useSpaceScope and the server's gates apply.
    return all.filter((sp) => {
      const mods = (Array.isArray(sp.enabledModules) ? sp.enabledModules : user?.orgModules ?? []) as string[]
      return mods.includes("crm")
    })
  }, [spacesQ.data, user?.orgModules])
  const [chosenSpace, setChosenSpace] = useState<string>(existing?.spaceId ?? "")
  // One workspace is not a choice; answer it and say where it is going instead.
  const targetSpace = existing ? chosenSpace : spaceId ?? (crmSpaces.length === 1 ? crmSpaces[0].id : chosenSpace)
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
      return existing
        // Sent only when it actually changed — an unchanged workspace has no
        // business in a PATCH, and the server refuses a move for an app user.
        ? customersApi.update(existing.id, { ...payload, ...(canMoveSpace && chosenSpace !== (existing.spaceId ?? "") ? { spaceId: chosenSpace || null } : {}) })
        : customersApi.create({ ...payload, spaceId: targetSpace })
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

          {showSpace && (crmSpaces.length > 1 || existing) && (
            <div className="space-y-1">
              <Label>
                {t("customers.workspace", "Workspace")}
                {!existing && <span className="text-destructive"> *</span>}
              </Label>
              <select
                value={chosenSpace}
                onChange={(e) => setChosenSpace(e.target.value)}
                className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              >
                <option value="">
                  {existing
                    ? t("customers.workspaceNone", "No workspace")
                    : t("customers.workspacePick", "Choose a workspace…")}
                </option>
                {crmSpaces.map((sp) => (
                  <option key={sp.id} value={sp.id}>{sp.name}</option>
                ))}
              </select>
              <p className="text-[11px] text-muted-foreground">
                {existing
                  ? t("customers.workspaceMoveHint", "Moving this client takes it out of one workspace's list and into another.")
                  : t("customers.workspaceHint", "Which workspace's client list this belongs to.")}
              </p>
            </div>
          )}
          {needsSpace && !existing && crmSpaces.length === 1 && (
            // Said, not asked — one workspace answers the question itself, but a
            // client still lands somewhere and the reader should know where.
            <p className="rounded-lg bg-muted/50 px-3 py-2 text-[11.5px] text-muted-foreground">
              {t("customers.workspaceOnly", "Added to {{name}}.", { name: crmSpaces[0].name })}
            </p>
          )}

          <Field label={isCompany ? t("customers.companyName", "Company name") : t("customers.name", "Name")} required value={form.name} onChange={(v) => set("name", v)} />
          <div className="space-y-1">
            <Label>{isCompany ? t("customers.companyEmail", "Company email") : t("customers.email", "Email")}</Label>
            <Input type="email" inputMode="email" value={form.email} onChange={(e) => set("email", e.target.value)}
              aria-invalid={emailInvalid} className={cn(emailInvalid && "border-destructive focus-visible:ring-destructive")} />
            {emailInvalid && <p className="text-[11px] text-destructive">{t("customers.emailInvalid", "Enter a valid email")}</p>}
          </div>

          {/*
            The phone gets the whole line.

            Sharing a two-column row with the email left it about 200px wide, and
            a phone field spends the first third of that on the country selector
            — so an international number scrolled out of sight as it was typed,
            and there was no way to read back what had been entered without
            dragging through the field. It is the one input here that cannot be
            checked at a glance if it does not fit.
          */}
          <div className="space-y-1">
            <Label>{isCompany ? t("customers.companyPhone", "Company phone") : t("customers.phone", "Phone")}</Label>
            <PhoneInput value={form.phone} onChange={(v) => set("phone", v)} />
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
          {/* A client with no workspace is the bug this dialog exists to stop. */}
          <Button disabled={!form.name.trim() || emailInvalid || (needsSpace && !targetSpace) || save.isPending} onClick={() => save.mutate()}>
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
