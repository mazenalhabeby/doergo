"use client"

import { User, Building2, Globe, Hash, Landmark, Briefcase } from "lucide-react"
import { CurrencySelect } from "@/components/rates/currency-setting"
import { CompanyField, companyName } from "@/components/companies/company-select"
import { CLIENT_LOCALE_OPTIONS } from "@/lib/client-locale"
import { cn } from "@/lib/utils"
import { DetailFields } from "@/components/detail-fields"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { PhoneInput } from "@/components/ui/phone-input"
import { INDUSTRIES, IconField, Field } from "./customer-form-helpers"
import type { CustomerFormState } from "./use-customer-form"
import type { CustomerForm } from "./customers-tab"

/** Part of CustomerForm's markup, moved here unchanged; it reads the page's state from `vm`. */
export function CustomerFormEdit(
  {
    vm,
    existing,
    personOnly
  }: {
    vm: CustomerFormState;
    existing: Parameters<typeof CustomerForm>[0]['existing'];
    personOnly: Parameters<typeof CustomerForm>[0]['personOnly']
  }) {
  const {
    t,
    setType,
    type,
    showSpace,
    crmSpaces,
    chosenSpace,
    setChosenSpace,
    needsSpace,
    isCompany,
    form,
    set,
    emailInvalid,
    locale,
    setLocale,
    currency,
    setCurrency,
    user,
    legalEntityId,
    setLegalEntityId,
    mainCompany,
    details,
    setDetails,
    setOpen,
    targetSpace,
    save,
  } = vm
  return (
    <DialogContent className="max-h-[88vh] overflow-y-auto">
      <DialogHeader><DialogTitle>{existing
        ? t("customers.edit", "Edit customer")
        : t("customers.add", "Add customer")}</DialogTitle></DialogHeader>
      <div className="grid gap-3">
        {/* Person / Company segmented toggle (hidden when locked to Person) */}
        {!personOnly && (
        <div className="grid grid-cols-2 gap-1 rounded-lg bg-muted p-1">
          {([
            ["PERSON", User, t("customers.typePerson", "Person")],
            ["COMPANY", Building2, t("customers.typeCompany", "Company")]] as const).map(([val, Icon, label]) => (
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
              className={"h-9 w-full rounded-md border border-input bg-background px-3 text-sm " +
                "text-foreground focus-visible:outline-none focus-visible:ring-1 " +
                "focus-visible:ring-ring"}
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

        <Field
          label={isCompany ? t("customers.companyName", "Company name") : t("customers.name", "Name")}
          required
          value={form.name}
          onChange={(v) => set("name", v)}
        />
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

        {/*
          Beside the address it belongs to: this decides what the emails sent
          to that address read like. Client info, so it saves under the same
          permission as the phone number — nothing of its own.
        */}
        <div className="space-y-1">
          <Label htmlFor="client-locale">{t("customers.locale", "Language for emails")}</Label>
          <select
            id="client-locale"
            value={locale}
            onChange={(e) => setLocale(e.target.value)}
            className={"h-9 w-full rounded-md border border-input bg-background px-3 text-sm " +
              "text-foreground focus-visible:outline-none focus-visible:ring-1 " +
              "focus-visible:ring-ring"}
          >
            <option value="">{t("customers.localeSame", "Same as the organization")}</option>
            {CLIENT_LOCALE_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
          <p className="text-[11px] text-muted-foreground">
            {t(
              "customers.localeHint",
              ("Invitations and signing links to this client are written in this " +
                "language. If the client picked a language in the app, that one is used. " +
                "With “Same as the organization”, emails follow your organization’s " +
                "country, otherwise English."))}
          </p>
        </div>

        {/* What invoices to this client are written in, outside a workspace. */}
        <div className="space-y-1">
          <Label htmlFor="client-currency">{t("currency.clientLabel")}</Label>
          <CurrencySelect
            id="client-currency"
            value={currency}
            onChange={setCurrency}
            inheritFrom={user?.orgCurrency ?? "EUR"}
            className="h-9 rounded-md"
          />
          <p className="text-[11px] text-muted-foreground">{t("currency.clientHint")}</p>
        </div>

        {/* Who invoices this client outside a workspace. Hidden while there is one company. */}
        <CompanyField
          id="client-company"
          label={t("companies.issuedBy")}
          help={t("companies.issuedByClientHelp")}
          value={legalEntityId}
          onChange={setLegalEntityId}
          inheritLabel={t("companies.sameAsMain", { name: companyName(mainCompany) })}
        />

        {/* Company-only fields */}
        {isCompany && (
          <div className="space-y-3 rounded-xl border border-border/70 bg-muted/30 p-3">
            <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              <Building2 className="h-3.5 w-3.5" /> {t("customers.companyInfo", "Company info")}
            </p>
            <IconField
              icon={Landmark}
              label={t("customers.legalName", "Legal name")}
              placeholder={t("customers.legalNamePh", "Registered entity name")}
              value={form.legalName}
              onChange={(v) => set("legalName", v)}
            />
            <div className="grid grid-cols-2 gap-3">
              <IconField
                icon={Globe}
                label={t("customers.website", "Website")}
                placeholder="example.com"
                value={form.website}
                onChange={(v) => set("website", v)}
              />
              <div className="space-y-1">
                <Label
                  className="flex items-center gap-1.5"><Briefcase
                    className="h-3.5 w-3.5 text-muted-foreground"
                  /> {t("customers.industry", "Industry")}</Label>
                <Input
                  list="crm-industries"
                  value={form.industry}
                  onChange={(e) => set("industry", e.target.value)}
                  placeholder={t("customers.industryPh", "e.g. Construction")}
                />
                <datalist id="crm-industries">{INDUSTRIES.map((i) => <option key={i} value={i} />)}</datalist>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <IconField
                icon={Hash}
                label={t("customers.vatId", "VAT / UID no.")}
                placeholder="ATU12345678"
                value={form.vatId}
                onChange={(v) => set("vatId", v)}
              />
              <IconField
                icon={Landmark}
                label={t("customers.regNumber", "Register no.")}
                placeholder={t("customers.regNumberPh", "FN 123456x")}
                value={form.regNumber}
                onChange={(v) => set("regNumber", v)}
              />
            </div>
          </div>
        )}

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
        <Button variant="outline" onClick={() => setOpen(false)}>{t("common.cancel", "Cancel")}</Button>
        {/* A client with no workspace is the bug this dialog exists to stop. */}
        <Button
          disabled={!form.name.trim() || emailInvalid || (needsSpace && !targetSpace) || save.isPending}
          onClick={() => save.mutate()}>
          {save.isPending ? t("common.saving", "Saving…") : t("common.save", "Save")}
        </Button>
      </DialogFooter>
    </DialogContent>
  )
}
