"use client"

import { useMemo, useState } from "react"
import { useTranslation } from "react-i18next"
import { useMutation } from "@tanstack/react-query"
import { notify } from "@/lib/toast"
import { customersApi, type Customer, type CustomerDetail } from "@/lib/api"
import { useAuth } from "@/contexts/auth-context"
import { useCompanies } from "@/components/companies/company-select"
import { clientLocaleFormValue, clientLocalePayload } from "@/lib/client-locale"
import { useActiveSpaces } from "@/hooks/use-space-directory"
import { cn } from "@/lib/utils"
import { DetailFields } from "@/components/common/detail-fields"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Dialog, DialogTrigger, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { PhoneInput } from "@/components/ui/phone-input"
import { CustomerTypeToggle } from "./customer-type-toggle"
import { CustomerWorkspaceField } from "./customer-workspace-field"
import { CustomerLanguageBilling } from "./customer-language-billing"
import { CustomerCompanyFields } from "./customer-company-fields"

const isEmail = (v: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)

/** The text fields of a client, as the form holds them. */
export type CustomerFormFields = {
  name: string
  email: string
  phone: string
  notes: string
  legalName: string
  website: string
  industry: string
  vatId: string
  regNumber: string
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
export function CustomerForm({
  spaceId,
  existing,
  onSaved,
  trigger,
  personOnly,
}: {
  // personOnly = hide the Person/Company toggle and lock to Person (e.g. a
  // portal client / apartment resident is always a person).
  spaceId?: string
  existing?: Customer
  onSaved: (customer?: Customer) => void
  trigger: React.ReactNode
  personOnly?: boolean
}) {
  const { t } = useTranslation()
  const { user } = useAuth()
  const [open, setOpen] = useState(false)
  const [type, setType] = useState<"PERSON" | "COMPANY">(
    personOnly ? "PERSON" : existing?.type === "COMPANY" ? "COMPANY" : "PERSON",
  )
  const [form, setForm] = useState<CustomerFormFields>({
    name: existing?.name ?? "",
    email: existing?.email ?? "",
    phone: existing?.phone ?? "",
    notes: existing?.notes ?? "",
    legalName: existing?.legalName ?? "",
    website: existing?.website ?? "",
    industry: existing?.industry ?? "",
    vatId: existing?.vatId ?? "",
    regNumber: existing?.regNumber ?? "",
  })
  const [details, setDetails] = useState<CustomerDetail[]>(existing?.details ?? [])
  // "" = same as the organization; kept apart from `form` because it is sent as
  // null, not as an empty string, when nothing is chosen.
  const [locale, setLocale] = useState<string>(clientLocaleFormValue(existing))
  // null = the organization's currency (used for invoices outside a workspace).
  const [currency, setCurrency] = useState<string | null>(existing?.currency ?? null)
  // null = the main company issues this client's invoices outside a workspace.
  const [legalEntityId, setLegalEntityId] = useState<string | null>(existing?.legalEntityId ?? null)
  const { main: mainCompany } = useCompanies()

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
  const { data: activeSpaces } = useActiveSpaces({ enabled: open && showSpace })
  const crmSpaces = useMemo(() => {
    const all = activeSpaces ?? []
    // A space's own module list wins; an absent one inherits the organization's
    // — the same precedence useSpaceScope and the server's gates apply.
    return all.filter((sp) => {
      const mods = (Array.isArray(sp.enabledModules) ? sp.enabledModules : (user?.orgModules ?? [])) as string[]
      return mods.includes("crm")
    })
  }, [activeSpaces, user?.orgModules])
  const [chosenSpace, setChosenSpace] = useState<string>(existing?.spaceId ?? "")
  // One workspace is not a choice; answer it and say where it is going instead.
  const targetSpace = existing ? chosenSpace : (spaceId ?? (crmSpaces.length === 1 ? crmSpaces[0].id : chosenSpace))
  const set = (k: keyof typeof form, v: string) => setForm((f) => ({ ...f, [k]: v }))
  const emailInvalid = !!form.email && !isEmail(form.email)
  const isCompany = type === "COMPANY"

  const save = useMutation({
    mutationFn: () => {
      const cleanDetails = details.map((d) => ({ label: d.label.trim(), value: d.value.trim() })).filter((d) => d.label)
      const payload = {
        ...form,
        type,
        // Company-only fields are cleared when the record is a person.
        legalName: isCompany ? form.legalName : "",
        website: isCompany ? form.website : "",
        industry: isCompany ? form.industry : "",
        vatId: isCompany ? form.vatId : "",
        regNumber: isCompany ? form.regNumber : "",
        locale: clientLocalePayload(locale),
        currency,
        // Only when it changed: a client still pointing at a since switched-off company must stay editable.
        ...(legalEntityId !== (existing?.legalEntityId ?? null) ? { legalEntityId } : {}),
        details: cleanDetails,
      }
      return existing
        ? // Sent only when it actually changed — an unchanged workspace has no
          // business in a PATCH, and the server refuses a move for an app user.
          customersApi.update(existing.id, {
            ...payload,
            ...(canMoveSpace && chosenSpace !== (existing.spaceId ?? "") ? { spaceId: chosenSpace || null } : {}),
          })
        : customersApi.create({ ...payload, spaceId: targetSpace })
    },
    onSuccess: (customer) => {
      notify.success(existing ? t("customers.updated", "Customer updated") : t("customers.created", "Customer added"))
      onSaved(customer)
      setOpen(false)
    },
    onError: (e: Error) => notify.error(e.message || "Could not save"),
  })

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="max-h-[88vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {existing ? t("customers.edit", "Edit customer") : t("customers.add", "Add customer")}
          </DialogTitle>
        </DialogHeader>
        <div className="grid gap-3">
          {/* Person / Company segmented toggle (hidden when locked to Person) */}
          {!personOnly && <CustomerTypeToggle type={type} setType={setType} />}

          <CustomerWorkspaceField
            existing={existing}
            needsSpace={needsSpace}
            showSpace={showSpace}
            crmSpaces={crmSpaces}
            chosenSpace={chosenSpace}
            setChosenSpace={setChosenSpace}
          />

          <Field
            label={isCompany ? t("customers.companyName", "Company name") : t("customers.name", "Name")}
            required
            value={form.name}
            onChange={(v) => set("name", v)}
          />
          <div className="space-y-1">
            <Label>{isCompany ? t("customers.companyEmail", "Company email") : t("customers.email", "Email")}</Label>
            <Input
              type="email"
              inputMode="email"
              value={form.email}
              onChange={(e) => set("email", e.target.value)}
              aria-invalid={emailInvalid}
              className={cn(emailInvalid && "border-destructive focus-visible:ring-destructive")}
            />
            {emailInvalid && (
              <p className="text-[11px] text-destructive">{t("customers.emailInvalid", "Enter a valid email")}</p>
            )}
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

          <CustomerLanguageBilling
            locale={locale}
            setLocale={setLocale}
            currency={currency}
            setCurrency={setCurrency}
            legalEntityId={legalEntityId}
            setLegalEntityId={setLegalEntityId}
            mainCompany={mainCompany}
          />

          {/* Company-only fields */}
          {isCompany && <CustomerCompanyFields form={form} set={set} />}

          {/* Flexible custom details */}
          <DetailFields
            title={t("customers.moreInfo", "Additional info")}
            hint={t("customers.moreInfoHint", "Add anything else — payment terms, preferred contact, account manager…")}
            details={details}
            setDetails={setDetails}
          />

          <div className="space-y-1">
            <Label>{t("customers.notes", "Notes")}</Label>
            <Textarea value={form.notes} onChange={(e) => set("notes", e.target.value)} rows={2} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            {t("common.cancel", "Cancel")}
          </Button>
          {/* A client with no workspace is the bug this dialog exists to stop. */}
          <Button
            disabled={!form.name.trim() || emailInvalid || (needsSpace && !targetSpace) || save.isPending}
            onClick={() => save.mutate()}
          >
            {save.isPending ? t("common.saving", "Saving…") : t("common.save", "Save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function Field({
  label,
  value,
  onChange,
  required,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  required?: boolean
}) {
  return (
    <div className="space-y-1">
      <Label>
        {label}
        {required && <span className="text-destructive"> *</span>}
      </Label>
      <Input value={value} onChange={(e) => onChange(e.target.value)} />
    </div>
  )
}
